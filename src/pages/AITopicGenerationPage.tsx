/**
 * AITopicGenerationPage — AI 专题生成助手
 *
 * 功能：
 *   1. 左侧：任务创建表单（选商品、填目标、选场景/人群/语气约束）
 *   2. 右侧：任务队列列表（进度卡片）
 *   3. 弹窗：结果预览与编辑（理解层 + 内容表达层 + 质量警告）
 *   4. 一键创建为专题草稿（写入 homepage_topics + topic_products）
 *
 * [修复] 任务持久化改造：
 *   - 使用 localStorage 替代 sessionStorage（跨 tab 持久）
 *   - 页面加载时从 DB (ai_topic_generation_tasks) 加载历史任务
 *   - SSE 断开后通过 DB 轮询恢复任务状态
 *   - 已完成的任务从 DB 读取结果，不依赖页面生命周期
 *
 * 状态管理：
 *   - tasks: AITopicTask[] — 所有任务列表（localStorage + DB 双重持久化）
 *   - viewingTaskId: string | null — 当前查看结果的任务 ID
 *   - abortControllers: Map<string, AbortController> — SSE 连接管理
 *
 * 与 AIListingPage 保持一致的交互范式和状态流转。
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { adminQuery, adminInsert, adminUpdate } from '../lib/adminApi';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sparkles, ListTodo, Trash2, RefreshCw, Search,
  Plus, X, AlertTriangle, CheckCircle, Clock, Loader2,
  ChevronDown, ChevronUp, FileText, Package, Lightbulb,
  Globe, BookOpen, Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ProductPickerPanel from '@/components/ProductPickerPanel';
import type { ProductPickerItem } from '@/components/ProductPickerPanel';

import { adminSSEFetch } from '@/lib/adminApi';
import { auditLog } from '@/lib/auditLogger';
import type {
  AITopicTask, AITopicDraftRequest, AITopicDraftResult,
  AITopicSSEEventData, AITopicProductInput,
  SCENE_OPTIONS, AUDIENCE_OPTIONS, TONE_CONSTRAINT_OPTIONS,
} from '@/types/aiTopic';

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || '';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-topic-generate`;
// [修复] 使用 localStorage 替代 sessionStorage
const STORAGE_KEY = 'ai_topic_tasks';
// [修复] DB 轮询间隔（毫秒）
const DB_POLL_INTERVAL = 5000;

// 预设选项
const SCENE_PRESETS = [
  '冬季保暖', '厨房做饭', '家里来人待客', '节庆送礼',
  '宿舍小空间', '家庭聚餐', '日常收纳', '婚礼季', '开学季', '夏季消暑',
];

const AUDIENCE_PRESETS = [
  '年轻妈妈', '新婚夫妇', '大学生', '家庭主妇',
  '上班族', '老人', '送礼人群', '租房青年',
];

const TONE_CONSTRAINT_PRESETS = [
  '太官方', '太像广告', '过度夸张', '生硬硬翻', '空泛套话', '过于文艺',
];

// topic_type 映射：AI 返回值 → 数据库枚举值
const TOPIC_TYPE_MAP: Record<string, string> = {
  story: 'story',
  collection: 'collection',
  seasonal: 'festival',
  gift_guide: 'collection',
  festival: 'festival',
  promotion: 'promotion',
};

// card_style 映射：AI 返回值 → 数据库枚举值
// [修复] 增加 banner 映射，与前端 TopicCard 支持的样式保持一致
const CARD_STYLE_MAP: Record<string, string> = {
  story_card: 'hero',
  image_card: 'standard',
  minimal_card: 'mini',
  banner_card: 'banner',
  hero: 'hero',
  standard: 'standard',
  mini: 'mini',
  banner: 'banner',
};

// ============================================================
// 商品搜索结果类型
// ============================================================
interface ProductSearchItem {
  id: string;
  name: string;
  name_i18n: Record<string, string> | null;
  description_i18n: Record<string, string> | null;
  image_url: string | null;
  original_price: number | null;
  status: string;
}

// ============================================================
// 主组件
// ============================================================

export default function AITopicGenerationPage() {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();

  // ─── 核心状态 ──────────────────────────────────────────────
  // [修复] 使用 localStorage 替代 sessionStorage
  const [tasks, setTasks] = useState<AITopicTask[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as any[];
        return parsed.map((t: any) => ({
          ...t,
          createdAt: new Date(t.createdAt),
          completedAt: t.completedAt ? new Date(t.completedAt) : undefined,
          // [修复] 恢复时将 processing 状态标记为需要恢复
          // 不再重置为 queued（避免重复执行），而是标记为 recovering
          status: t.status === 'processing' ? 'recovering' as any : t.status,
          progress: t.status === 'processing' ? t.progress : t.progress,
          stage: t.status === 'processing' ? '正在恢复任务状态...' : t.stage,
        }));
      }
    } catch { /* ignore */ }
    return [];
  });

  const [viewingTaskId, setViewingTaskId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // [修复] 标记是否已从 DB 加载历史任务
  const [dbLoaded, setDbLoaded] = useState(false);

  // SSE 连接管理
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  // [修复] DB 轮询定时器
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── 表单状态 ──────────────────────────────────────────────
  const [topicGoal, setTopicGoal] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<AITopicProductInput[]>([]);
  const [selectedScenes, setSelectedScenes] = useState<string[]>([]);
  const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
  const [selectedToneConstraints, setSelectedToneConstraints] = useState<string[]>([]);
  const [manualNotes, setManualNotes] = useState('');
  const [localContextHints, setLocalContextHints] = useState('');

  // 商品搜索
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);

  // ─── [修复] 持久化到 localStorage ─────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch { /* storage full */ }
  }, [tasks]);

  // ─── beforeunload 事件拦截 ────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsaved = tasks.some(
        (t) => (t.status === 'done' || t.status === 'partial') && !t.savedAsDraft
      );
      const hasProcessing = tasks.some(
        (t) => t.status === 'processing' || t.status === 'queued'
      );
      if (hasUnsaved || hasProcessing) {
        e.preventDefault();
        e.returnValue = '有未保存的生成结果或正在处理的任务，确定要离开吗？';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [tasks]);

  // ─── 组件卸载时中止所有 SSE 连接和轮询 ──────────────────
  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach((ctrl) => ctrl.abort());
      abortControllersRef.current.clear();
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  // ─── 更新单个任务 ──────────────────────────────────────────
  const updateTask = useCallback((taskId: string, updates: Partial<AITopicTask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
    );
  }, []);

  // ─── [修复] 从 DB 加载历史任务并恢复 ─────────────────────
  useEffect(() => {
    if (dbLoaded) return;

    const loadFromDB = async () => {
      try {
        // 查询最近 50 条任务记录
        const dbTasks = await adminQuery<any>(supabase, 'ai_topic_generation_tasks', {
          select: 'id, status, request_payload, result_payload, error_message, created_at, completed_at, topic_id',
          orderBy: 'created_at',
          orderAsc: false,
          limit: 50,
        });

        if (!dbTasks || dbTasks.length === 0) {
          setDbLoaded(true);
          return;
        }

        setTasks(prev => {
          const existingTaskIds = new Set(prev.map(t => t.taskId).filter(Boolean));
          const existingLocalIds = new Set(prev.map(t => t.id));
          let updated = [...prev];

          // 1. 恢复 recovering 状态的任务（从 DB 获取最新状态）
          updated = updated.map(t => {
            if ((t.status as string) === 'recovering' && t.taskId) {
              const dbTask = dbTasks.find((d: any) => d.id === t.taskId);
              if (dbTask) {
                if (dbTask.status === 'done' || dbTask.status === 'partial') {
                  return {
                    ...t,
                    status: dbTask.status,
                    progress: 100,
                    stage: dbTask.status === 'done' ? '全部完成' : '部分完成（请检查质量警告）',
                    result: dbTask.result_payload || t.result,
                    completedAt: dbTask.completed_at ? new Date(dbTask.completed_at) : new Date(),
                    savedTopicId: dbTask.topic_id || t.savedTopicId,
                    savedAsDraft: !!dbTask.topic_id || t.savedAsDraft,
                  };
                } else if (dbTask.status === 'error') {
                  return {
                    ...t,
                    status: 'error' as any,
                    progress: 0,
                    stage: '生成失败',
                    errorMessage: dbTask.error_message || '未知错误',
                  };
                } else if (dbTask.status === 'processing') {
                  // 后端仍在处理，标记为 processing 并启动轮询
                  return {
                    ...t,
                    status: 'processing' as any,
                    stage: '后端正在处理中（已恢复监控）...',
                  };
                }
              }
              // DB 中找不到，标记为 error
              return {
                ...t,
                status: 'error' as any,
                progress: 0,
                stage: '任务记录丢失',
                errorMessage: '无法从服务器恢复任务状态',
              };
            }
            return t;
          });

          // 2. 从 DB 加载本地不存在的已完成任务
          for (const dbTask of dbTasks) {
            if (existingTaskIds.has(dbTask.id) || existingLocalIds.has(dbTask.id)) continue;
            if (dbTask.status !== 'done' && dbTask.status !== 'partial') continue;
            if (!dbTask.result_payload) continue;

            const request = dbTask.request_payload || {};
            updated.push({
              id: dbTask.id, // 使用 DB id 作为本地 id
              status: dbTask.status,
              progress: 100,
              stage: dbTask.status === 'done' ? '全部完成' : '部分完成',
              request: {
                topic_goal: request.topic_goal || '(历史任务)',
                target_audience: request.target_audience || [],
                core_scene: request.core_scene || [],
                local_context_hints: request.local_context_hints || [],
                selected_products: request.selected_products || [],
                manual_notes: request.manual_notes,
                tone_constraints: request.tone_constraints || [],
                output_languages: request.output_languages || ['zh', 'ru', 'tg'],
              },
              result: dbTask.result_payload,
              taskId: dbTask.id,
              savedAsDraft: !!dbTask.topic_id,
              savedTopicId: dbTask.topic_id || undefined,
              createdAt: new Date(dbTask.created_at),
              completedAt: dbTask.completed_at ? new Date(dbTask.completed_at) : undefined,
            });
          }

          return updated;
        });

        setDbLoaded(true);
      } catch (error) {
        console.error('[AITopic] 从 DB 加载历史任务失败:', error);
        // 即使加载失败也标记为已加载，避免无限重试
        setDbLoaded(true);
      }
    };

    loadFromDB();
  }, [supabase, dbLoaded]);

  // ─── [修复] DB 轮询：恢复正在处理中的任务状态 ─────────────
  useEffect(() => {
    const processingTasks = tasks.filter(
      t => t.status === 'processing' && t.taskId && !abortControllersRef.current.has(t.id)
    );

    if (processingTasks.length === 0) {
      // 没有需要轮询的任务，清除定时器
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    // 启动轮询
    if (!pollTimerRef.current) {
      const pollFn = async () => {
        const taskIds = tasks
          .filter(t => t.status === 'processing' && t.taskId && !abortControllersRef.current.has(t.id))
          .map(t => t.taskId!)
          .filter(Boolean);

        if (taskIds.length === 0) {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          return;
        }

        try {
          for (const taskId of taskIds) {
            const dbTasks = await adminQuery<any>(supabase, 'ai_topic_generation_tasks', {
              select: 'id, status, result_payload, error_message, completed_at, topic_id',
              filters: [{ col: 'id', op: 'eq', val: taskId }],
              limit: 1,
            });

            if (dbTasks && dbTasks.length > 0) {
              const dbTask = dbTasks[0];
              if (dbTask.status === 'done' || dbTask.status === 'partial') {
                setTasks(prev => prev.map(t => {
                  if (t.taskId === taskId) {
                    return {
                      ...t,
                      status: dbTask.status,
                      progress: 100,
                      stage: dbTask.status === 'done' ? '全部完成' : '部分完成（请检查质量警告）',
                      result: dbTask.result_payload || t.result,
                      completedAt: dbTask.completed_at ? new Date(dbTask.completed_at) : new Date(),
                      savedTopicId: dbTask.topic_id || t.savedTopicId,
                      savedAsDraft: !!dbTask.topic_id || t.savedAsDraft,
                    };
                  }
                  return t;
                }));
                toast.success('AI 专题草稿生成完成！');
              } else if (dbTask.status === 'error') {
                setTasks(prev => prev.map(t => {
                  if (t.taskId === taskId) {
                    return {
                      ...t,
                      status: 'error',
                      progress: 0,
                      stage: '生成失败',
                      errorMessage: dbTask.error_message || '未知错误',
                    };
                  }
                  return t;
                }));
                toast.error('生成失败: ' + (dbTask.error_message || '未知错误'));
              }
            }
          }
        } catch (error) {
          console.error('[AITopic] DB 轮询失败:', error);
        }
      };

      pollTimerRef.current = setInterval(pollFn, DB_POLL_INTERVAL);
      // 立即执行一次
      pollFn();
    }

    return () => {
      // 注意：不在这里清除，因为 effect 可能频繁触发
    };
  }, [tasks, supabase]);

  // ─── SSE 执行单个任务 ──────────────────────────────────────
  const executeTask = useCallback(
    (task: AITopicTask) => {
      updateTask(task.id, {
        status: 'processing',
        progress: 5,
        stage: '正在连接 AI 服务...',
      });

      const controller = adminSSEFetch(
        EDGE_FUNCTION_URL,
        {
          topic_goal: task.request.topic_goal,
          target_audience: task.request.target_audience,
          core_scene: task.request.core_scene,
          local_context_hints: task.request.local_context_hints,
          selected_products: task.request.selected_products,
          manual_notes: task.request.manual_notes,
          tone_constraints: task.request.tone_constraints,
          output_languages: task.request.output_languages,
        },
        // onEvent
        (data: AITopicSSEEventData) => {
          if (data.status === 'processing') {
            updateTask(task.id, {
              status: 'processing',
              progress: data.progress || 0,
              stage: data.stage || '处理中...',
            });
          } else if (data.status === 'done' || data.status === 'partial') {
            updateTask(task.id, {
              status: data.status,
              progress: 100,
              stage: data.status === 'done' ? '全部完成' : '部分完成（请检查质量警告）',
              result: data.result,
              taskId: data.task_id,
              completedAt: new Date(),
            });

            abortControllersRef.current.delete(task.id);

            if (data.status === 'done') {
              toast.success('AI 专题草稿生成完成！');
            } else {
              toast('部分完成，请检查质量警告', { icon: '⚠️' });
            }
          } else if (data.status === 'error') {
            updateTask(task.id, {
              status: 'error',
              progress: 0,
              stage: '生成失败',
              errorMessage: data.error || '未知错误',
            });

            abortControllersRef.current.delete(task.id);
            toast.error('生成失败: ' + (data.error || '未知错误'));
          }
        },
        // onError
        (error: Error) => {
          // [修复] SSE 断开时，如果任务有 taskId，不标记为 error，而是标记为 processing
          // 让 DB 轮询来恢复状态
          const currentTask = tasks.find(t => t.id === task.id);
          if (currentTask?.taskId) {
            updateTask(task.id, {
              status: 'processing',
              stage: '连接中断，正在从服务器恢复...',
            });
          } else {
            updateTask(task.id, {
              status: 'error',
              progress: 0,
              stage: '连接失败',
              errorMessage: error.message || '网络连接中断，请重试',
            });
          }

          abortControllersRef.current.delete(task.id);
          if (!currentTask?.taskId) {
            toast.error('连接失败: ' + error.message);
          }
        }
      );

      abortControllersRef.current.set(task.id, controller);
    },
    [updateTask, tasks]
  );

  // ─── 当 tasks 变化时检查是否有待处理任务（一次只处理一个）──
  useEffect(() => {
    const hasProcessing = tasks.some((t) => t.status === 'processing');
    if (hasProcessing) return;

    const nextQueued = tasks.find((t) => t.status === 'queued');
    if (nextQueued) {
      executeTask(nextQueued);
    }
  }, [tasks, executeTask]);

  // ─── 商品搜索 ──────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!productSearch.trim()) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      try {
        // [RLS 修复] 使用 adminQuery
        const data = await adminQuery<any>(supabase, 'inventory_products', {
          select: 'id, name, name_i18n, description_i18n, image_url, original_price, status',
          filters: [{ col: 'status', op: 'eq', val: 'ACTIVE' }],
          orFilters: `name_i18n->>zh.ilike.%${productSearch}%,name_i18n->>ru.ilike.%${productSearch}%,name_i18n->>tg.ilike.%${productSearch}%,name.ilike.%${productSearch}%`,
          limit: 20,
        });
        setSearchResults(data || []);
      } catch (error: any) {
        console.error('Product search failed:', error);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch, supabase]);

  // ─── 添加/移除商品 ────────────────────────────────────────
  const addProduct = (product: ProductSearchItem) => {
    if (selectedProducts.some(p => p.id === product.id)) {
      toast.error('该商品已添加');
      return;
    }
    setSelectedProducts(prev => [...prev, {
      id: product.id,
      name: product.name || product.name_i18n?.zh || '',
      name_i18n: product.name_i18n,
      description_i18n: product.description_i18n,
      image_url: product.image_url,
      original_price: product.original_price,
    }]);
    setProductSearch('');
    setSearchResults([]);
  };

  const removeProduct = (productId: string) => {
    setSelectedProducts(prev => prev.filter(p => p.id !== productId));
  };

  // 批量添加商品（来自 ProductPickerPanel）
  const addProductsFromPicker = (products: ProductPickerItem[]) => {
    const newProducts: AITopicProductInput[] = [];
    for (const product of products) {
      if (selectedProducts.some(p => p.id === product.id)) continue;
      newProducts.push({
        id: product.id,
        name: product.name_i18n?.zh || product.name || '',
        name_i18n: product.name_i18n || undefined,
        description_i18n: product.description_i18n || undefined,
        image_url: product.image_url,
        original_price: product.original_price,
      });
    }
    if (newProducts.length > 0) {
      setSelectedProducts(prev => [...prev, ...newProducts]);
      toast.success(`已添加 ${newProducts.length} 个商品`);
    } else {
      toast.error('没有新商品被添加（可能已全部添加）');
    }
  };

  // ─── 标签切换 ──────────────────────────────────────────────
  const toggleTag = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    setList(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  // ─── 提交任务 ──────────────────────────────────────────────
  const handleSubmit = () => {
    if (!topicGoal.trim()) {
      toast.error('请输入专题目标');
      return;
    }
    if (selectedProducts.length === 0) {
      toast.error('请至少选择一个商品');
      return;
    }

    const request: AITopicDraftRequest = {
      topic_goal: topicGoal.trim(),
      target_audience: selectedAudiences,
      core_scene: selectedScenes,
      local_context_hints: localContextHints.trim()
        ? localContextHints.split(/[,，、\n]/).map(s => s.trim()).filter(Boolean)
        : [],
      selected_products: selectedProducts,
      manual_notes: manualNotes.trim() || undefined,
      tone_constraints: selectedToneConstraints,
      output_languages: ['zh', 'ru', 'tg'],
    };

    const task: AITopicTask = {
      id: crypto.randomUUID(),
      status: 'queued',
      progress: 0,
      stage: '排队中...',
      request,
      savedAsDraft: false,
      createdAt: new Date(),
    };

    setTasks(prev => [...prev, task]);
    toast.success('任务已添加到生成队列');

    // 重置表单
    setTopicGoal('');
    setSelectedProducts([]);
    setSelectedScenes([]);
    setSelectedAudiences([]);
    setSelectedToneConstraints([]);
    setManualNotes('');
    setLocalContextHints('');
  };

  // ─── 重试失败任务 ──────────────────────────────────────────
  const handleRetry = (taskId: string) => {
    updateTask(taskId, {
      status: 'queued',
      progress: 0,
      stage: '排队中（重试）...',
      errorMessage: undefined,
      result: undefined,
    });
  };

  // ─── 删除任务 ──────────────────────────────────────────────
  const handleDeleteTask = (taskId: string) => {
    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(taskId);
    }
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (viewingTaskId === taskId) setViewingTaskId(null);
  };

  // ─── 创建为专题草稿 ───────────────────────────────────────
  const handleSaveAsDraft = useCallback(async (taskId: string, editedResult: AITopicDraftResult) => {
    if (!admin) {
      toast.error('未登录');
      return;
    }

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    setSaving(true);
    const startTime = Date.now();

    try {
      // 生成 slug
      const slugBase = (editedResult.title_i18n?.zh || editedResult.title_i18n?.ru || 'topic')
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 30);
      const slug = `ai-${slugBase}-${Date.now().toString(36)}`;

      // 映射 topic_type 和 card_style
      const aiTopicType = editedResult.understanding?.recommended_topic_type || 'story';
      const aiCardStyle = editedResult.understanding?.recommended_card_style || 'story_card';
      const topicType = TOPIC_TYPE_MAP[aiTopicType] || 'story';
      const cardStyle = CARD_STYLE_MAP[aiCardStyle] || 'standard';

      // 构建 story_blocks_i18n
      const storyBlocks = (editedResult.story_blocks_i18n || []).map(block => ({
        block_key: block.block_key,
        block_type: block.block_type || 'paragraph',
        content_i18n: {
          zh: block.zh || '',
          ru: block.ru || '',
          tg: block.tg || '',
        },
      }));

      // 构建专题数据
      const topicData = {
        topic_type: topicType,
        status: 'draft',
        slug,
        title_i18n: editedResult.title_i18n || {},
        subtitle_i18n: editedResult.subtitle_i18n || {},
        intro_i18n: editedResult.intro_i18n || {},
        story_blocks_i18n: storyBlocks,
        theme_color: '#FF6B35',
        card_style: cardStyle,
        local_context_notes: editedResult.explanation?.local_anchors?.join('、') || '',
        source_type: 'ai_draft',
        is_active: false,
      };

      // [RLS 修复] 插入 homepage_topics
      const topicResult = await adminInsert<{ id: string }>(supabase, 'homepage_topics', topicData);
      const topicId = topicResult?.id;
      if (!topicId) throw new Error('创建专题失败，未返回 ID');

      // 插入 topic_products（带 note_i18n 和 badge_text_i18n）
      const productNotes = editedResult.product_notes || [];
      const productInserts = task.request.selected_products.map((p, index) => {
        const note = productNotes.find(n => n.product_id === p.id);
        return {
          topic_id: topicId,
          product_id: p.id,
          sort_order: index,
          note_i18n: note?.note_i18n || null,
          badge_text_i18n: note?.badge_text_i18n || null,
        };
      });

      if (productInserts.length > 0) {
        try {
          for (const pi of productInserts) {
            await adminInsert(supabase, 'topic_products', pi);
          }
        } catch (prodError: any) {
          console.error('[AITopic] 挂载商品失败:', prodError);
          toast('专题已创建，但商品挂载失败，请手动添加', { icon: '⚠️' });
        }
      }

      // [RLS 修复] 更新 AI 任务记录的 topic_id
      if (task.taskId) {
        await adminUpdate(supabase, 'ai_topic_generation_tasks', { topic_id: topicId }, [
          { col: 'id', op: 'eq', val: task.taskId },
        ]);
      }

      // 更新本地任务状态
      updateTask(taskId, {
        savedAsDraft: true,
        savedTopicId: topicId,
      });

      // 审计日志
      const duration = Date.now() - startTime;
      await auditLog(supabase, {
        adminId: admin.id,
        action: 'AI_CREATE_TOPIC_DRAFT',
        targetType: 'homepage_topic',
        targetId: topicId,
        newData: topicData,
        details: {
          source: 'ai_topic_assistant',
          topic_goal: task.request.topic_goal,
          product_count: task.request.selected_products.length,
          quality_warnings: editedResult.quality_warnings,
          ai_task_id: task.taskId,
        },
        source: 'admin_ui',
        status: 'success',
        durationMs: duration,
      });

      setViewingTaskId(null);
      toast.success('专题草稿创建成功！请到专题管理页面继续编辑和发布。');
    } catch (error: any) {
      console.error('[AITopic] 创建专题草稿失败:', error);
      toast.error('创建失败: ' + (error.message || '未知错误'));
    } finally {
      setSaving(false);
    }
  }, [tasks, admin, supabase, updateTask]);

  // ─── 清除已保存的任务 ──────────────────────────────────────
  const handleClearSaved = () => {
    const savedCount = tasks.filter(t => t.savedAsDraft).length;
    if (savedCount === 0) return;
    setTasks(prev => prev.filter(t => !t.savedAsDraft));
    toast.success(`已清除 ${savedCount} 个已保存的任务`);
  };

  // ─── 统计 ──────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: tasks.length,
    queued: tasks.filter(t => t.status === 'queued').length,
    processing: tasks.filter(t => t.status === 'processing' || (t.status as string) === 'recovering').length,
    done: tasks.filter(t => t.status === 'done' || t.status === 'partial').length,
    error: tasks.filter(t => t.status === 'error').length,
    saved: tasks.filter(t => t.savedAsDraft).length,
  }), [tasks]);

  // ─── 当前查看的任务 ────────────────────────────────────────
  const viewingTask = viewingTaskId ? tasks.find(t => t.id === viewingTaskId) : null;

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <div className="space-y-6 pb-20">
      {/* ─── 页面标题 ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-purple-600" />
            AI 专题生成助手
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            选择商品、描述场景，AI 自动生成三语专题草稿，审核后一键创建为专题
          </p>
        </div>
        {stats.saved > 0 && (
          <Button variant="outline" size="sm" onClick={handleClearSaved} className="text-gray-500">
            <Trash2 className="w-4 h-4 mr-1" />
            清除已保存 ({stats.saved})
          </Button>
        )}
      </div>

      {/* ─── 统计卡片 ─────────────────────────────────────── */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="排队中" value={stats.queued} color="text-gray-600" />
          <StatCard label="生成中" value={stats.processing} color="text-blue-600" />
          <StatCard label="已完成" value={stats.done} color="text-green-600" />
          <StatCard label="失败" value={stats.error} color="text-red-600" />
          <StatCard label="已保存" value={stats.saved} color="text-purple-600" />
        </div>
      )}

      {/* ─── 主体：左右分栏 ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：任务创建表单 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              创建生成任务
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* 专题目标 */}
            <div>
              <Label className="font-medium">专题目标 *</Label>
              <p className="text-xs text-gray-400 mb-1">描述你想要的专题主题，例如"冬季家常做饭更省事"</p>
              <Textarea
                value={topicGoal}
                onChange={(e) => setTopicGoal(e.target.value)}
                placeholder="例如：冬天回家晚了，想快点吃上热饭，厨房里有几样好用的东西就够了"
                rows={3}
              />
            </div>

            {/* 商品选择 */}
            <div>
              <Label className="font-medium">选择商品 * ({selectedProducts.length} 个已选)</Label>
              <p className="text-xs text-gray-400 mb-1">通过快速搜索或打开商品选择器添加商品</p>
              
              {/* 快速搜索 + 打开选择器按钮 */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <Input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="快速搜索商品名称..."
                    className="pl-9"
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 animate-spin" />
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowProductPicker(true)}
                  className="flex items-center gap-1.5 whitespace-nowrap border-orange-300 text-orange-600 hover:bg-orange-50"
                >
                  <Package className="w-4 h-4" />
                  浏览选择
                </Button>
              </div>

              {/* 快速搜索结果下拉 */}
              {searchResults.length > 0 && (
                <div className="mt-1 border rounded-lg bg-white shadow-lg max-h-48 overflow-y-auto z-10 relative">
                  {searchResults.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addProduct(product)}
                      disabled={selectedProducts.some(p => p.id === product.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm ${
                        selectedProducts.some(p => p.id === product.id)
                          ? 'bg-gray-50 opacity-50 cursor-not-allowed'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      {product.image_url && (
                        <img src={product.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{product.name_i18n?.zh || product.name || product.id}</div>
                        <div className="text-xs text-gray-400">{product.original_price} сомони</div>
                      </div>
                      {selectedProducts.some(p => p.id === product.id)
                        ? <span className="text-xs text-gray-400">已添加</span>
                        : <Plus className="w-4 h-4 text-green-500 flex-shrink-0" />
                      }
                    </button>
                  ))}
                </div>
              )}

              {/* 已选商品列表 */}
              {selectedProducts.length > 0 && (
                <div className="mt-2 space-y-1">
                  {selectedProducts.map(product => (
                    <div
                      key={product.id}
                      className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5 text-sm"
                    >
                      {product.image_url && (
                        <img src={product.image_url} alt="" className="w-6 h-6 rounded object-cover" />
                      )}
                      <span className="flex-1 truncate">
                        {product.name_i18n?.zh || product.name}
                      </span>
                      <span className="text-xs text-gray-400">{product.original_price} с.</span>
                      <button
                        onClick={() => removeProduct(product.id)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 商品选择器侧边面板 */}
              <ProductPickerPanel
                open={showProductPicker}
                onClose={() => setShowProductPicker(false)}
                onConfirm={addProductsFromPicker}
                existingProductIds={selectedProducts.map(p => p.id)}
                title="选择专题商品"
              />
            </div>

            {/* 核心场景 - [修复] 添加自定义新增入口 */}
            <TagSectionWithCustomInput
              label="核心场景"
              hint="选择或输入商品的使用场景"
              presets={SCENE_PRESETS}
              selected={selectedScenes}
              onToggle={(value) => toggleTag(selectedScenes, setSelectedScenes, value)}
              onAdd={(value) => setSelectedScenes(prev => [...prev, value])}
              colorScheme="blue"
            />

            {/* 目标人群 - [修复] 添加自定义新增入口 */}
            <TagSectionWithCustomInput
              label="目标人群"
              presets={AUDIENCE_PRESETS}
              selected={selectedAudiences}
              onToggle={(value) => toggleTag(selectedAudiences, setSelectedAudiences, value)}
              onAdd={(value) => setSelectedAudiences(prev => [...prev, value])}
              colorScheme="green"
            />

            {/* 语气约束 - [修复] 添加自定义新增入口 */}
            <TagSectionWithCustomInput
              label="不要出现的风格"
              presets={TONE_CONSTRAINT_PRESETS}
              selected={selectedToneConstraints}
              onToggle={(value) => toggleTag(selectedToneConstraints, setSelectedToneConstraints, value)}
              onAdd={(value) => setSelectedToneConstraints(prev => [...prev, value])}
              colorScheme="red"
            />

            {/* 本地化提示 */}
            <div>
              <Label className="font-medium">本地化提示</Label>
              <p className="text-xs text-gray-400 mb-1">输入本地生活相关的关键词，用逗号分隔</p>
              <Input
                value={localContextHints}
                onChange={(e) => setLocalContextHints(e.target.value)}
                placeholder="例如：手抓饭、家庭聚餐、节庆待客"
              />
            </div>

            {/* 运营补充说明 */}
            <div>
              <Label className="font-medium">运营补充说明</Label>
              <Textarea
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="可选：补充任何你希望 AI 注意的信息..."
                rows={2}
              />
            </div>

            {/* 提交按钮 */}
            <Button
              onClick={handleSubmit}
              className="w-full bg-purple-600 hover:bg-purple-700"
              disabled={!topicGoal.trim() || selectedProducts.length === 0}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              开始生成
            </Button>
          </CardContent>
        </Card>

        {/* 右侧：任务队列 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ListTodo className="w-5 h-5" />
                任务队列 ({stats.total})
              </span>
              {stats.error > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    tasks.filter(t => t.status === 'error').forEach(t => handleRetry(t.id));
                  }}
                  className="text-xs text-orange-600"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  全部重试
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>暂无任务</p>
                <p className="text-sm mt-1">在左侧填写信息并开始生成</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {tasks.map(task => (
                  <TopicTaskCard
                    key={task.id}
                    task={task}
                    onViewResult={() => setViewingTaskId(task.id)}
                    onRetry={() => handleRetry(task.id)}
                    onDelete={() => handleDeleteTask(task.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 结果预览弹窗 ─────────────────────────────────── */}
      <Dialog
        open={!!viewingTask?.result}
        onOpenChange={(open) => {
          if (!open) setViewingTaskId(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              AI 专题草稿预览
            </DialogTitle>
          </DialogHeader>
          {viewingTask?.result && (
            <TopicResultPreview
              task={viewingTask}
              result={viewingTask.result}
              onSaveAsDraft={(editedResult) => handleSaveAsDraft(viewingTask.id, editedResult)}
              onDiscard={() => setViewingTaskId(null)}
              saving={saving}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// [修复] 带自定义新增入口的标签选择组件
// ============================================================

function TagSectionWithCustomInput({
  label,
  hint,
  presets,
  selected,
  onToggle,
  onAdd,
  colorScheme,
}: {
  label: string;
  hint?: string;
  presets: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onAdd: (value: string) => void;
  colorScheme: 'blue' | 'green' | 'red';
}) {
  const [inputValue, setInputValue] = useState('');
  const [showInput, setShowInput] = useState(false);

  const colorMap = {
    blue: { active: 'bg-blue-100 border-blue-300 text-blue-700', hover: 'hover:bg-blue-50' },
    green: { active: 'bg-green-100 border-green-300 text-green-700', hover: 'hover:bg-green-50' },
    red: { active: 'bg-red-100 border-red-300 text-red-700', hover: 'hover:bg-red-50' },
  };
  const colors = colorMap[colorScheme];

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    if (selected.includes(trimmed) || presets.includes(trimmed)) {
      toast.error('该选项已存在');
      return;
    }
    onAdd(trimmed);
    setInputValue('');
    setShowInput(false);
  };

  // 合并预设和自定义标签
  const allTags = [...presets, ...selected.filter(s => !presets.includes(s))];

  return (
    <div>
      <Label className="font-medium">{label}</Label>
      {hint && <p className="text-xs text-gray-400 mb-1">{hint}</p>}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {allTags.map(tag => (
          <button
            key={tag}
            onClick={() => onToggle(tag)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              selected.includes(tag)
                ? colors.active
                : `bg-white border-gray-200 text-gray-600 hover:bg-gray-50`
            }`}
          >
            {tag}
          </button>
        ))}
        {/* 自定义新增入口 */}
        {showInput ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
                if (e.key === 'Escape') { setShowInput(false); setInputValue(''); }
              }}
              placeholder="输入自定义..."
              className="px-2 py-1 rounded-full text-xs border border-gray-300 w-28 focus:outline-none focus:border-blue-400"
              autoFocus
            />
            <button
              onClick={handleAdd}
              className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={() => { setShowInput(false); setInputValue(''); }}
              className="px-1 py-1 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowInput(true)}
            className="px-2.5 py-1 rounded-full text-xs border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            自定义
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 任务进度卡片
// ============================================================

function TopicTaskCard({
  task,
  onViewResult,
  onRetry,
  onDelete,
}: {
  task: AITopicTask;
  onViewResult: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    queued: { label: '排队中', color: 'bg-gray-100 text-gray-600', icon: <Clock className="w-3.5 h-3.5" /> },
    processing: { label: '生成中', color: 'bg-blue-100 text-blue-600', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
    recovering: { label: '恢复中', color: 'bg-yellow-100 text-yellow-600', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
    done: { label: '已完成', color: 'bg-green-100 text-green-600', icon: <CheckCircle className="w-3.5 h-3.5" /> },
    partial: { label: '部分完成', color: 'bg-yellow-100 text-yellow-600', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    error: { label: '失败', color: 'bg-red-100 text-red-600', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  };

  const config = statusConfig[task.status] || statusConfig.queued;

  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{task.request.topic_goal}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {task.request.selected_products.length} 个商品 · {new Date(task.createdAt).toLocaleTimeString()}
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${config.color}`}>
            {config.icon}
            {config.label}
          </span>
          {task.savedAsDraft && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-600">
              <Save className="w-3 h-3" />
              已保存
            </span>
          )}
        </div>
      </div>

      {/* 进度条 */}
      {(task.status === 'processing' || (task.status as string) === 'recovering') && (
        <div className="mb-2">
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <div className="text-xs text-gray-400 mt-1">{task.stage}</div>
        </div>
      )}

      {/* 错误信息 */}
      {task.status === 'error' && task.errorMessage && (
        <div className="text-xs text-red-500 bg-red-50 rounded p-2 mb-2">
          {task.errorMessage}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        {(task.status === 'done' || task.status === 'partial') && !task.savedAsDraft && (
          <Button variant="outline" size="sm" onClick={onViewResult} className="text-xs">
            <BookOpen className="w-3.5 h-3.5 mr-1" />
            查看结果
          </Button>
        )}
        {task.savedAsDraft && (
          <Button variant="outline" size="sm" onClick={onViewResult} className="text-xs text-purple-600">
            <BookOpen className="w-3.5 h-3.5 mr-1" />
            查看草稿
          </Button>
        )}
        {task.status === 'error' && (
          <Button variant="outline" size="sm" onClick={onRetry} className="text-xs text-orange-600">
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            重试
          </Button>
        )}
        {task.status !== 'processing' && (task.status as string) !== 'recovering' && (
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-xs text-gray-400 ml-auto">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 结果预览与编辑组件
// ============================================================

function TopicResultPreview({
  task,
  result,
  onSaveAsDraft,
  onDiscard,
  saving,
}: {
  task: AITopicTask;
  result: AITopicDraftResult;
  onSaveAsDraft: (editedResult: AITopicDraftResult) => void;
  onDiscard: () => void;
  saving: boolean;
}) {
  // 可编辑的本地状态
  const [editedResult, setEditedResult] = useState<AITopicDraftResult>(() => ({ ...result }));
  const [activeSection, setActiveSection] = useState<'understanding' | 'content' | 'products'>('content');

  const updateField = (field: string, value: any) => {
    setEditedResult(prev => ({ ...prev, [field]: value }));
  };

  const updateI18nField = (field: string, lang: string, value: string) => {
    setEditedResult(prev => ({
      ...prev,
      [field]: { ...(prev as any)[field], [lang]: value },
    }));
  };

  const updateStoryBlock = (index: number, lang: string, value: string) => {
    setEditedResult(prev => {
      const blocks = [...(prev.story_blocks_i18n || [])];
      blocks[index] = { ...blocks[index], [lang]: value };
      return { ...prev, story_blocks_i18n: blocks };
    });
  };

  return (
    <div className="space-y-4">
      {/* 质量警告 */}
      {editedResult.quality_warnings && editedResult.quality_warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-yellow-700 font-medium text-sm mb-1">
            <AlertTriangle className="w-4 h-4" />
            质量警告
          </div>
          <ul className="text-xs text-yellow-600 space-y-0.5">
            {editedResult.quality_warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 切换标签 */}
      <div className="flex gap-1 border-b">
        {[
          { key: 'understanding', label: '商品理解', icon: <Lightbulb className="w-4 h-4" /> },
          { key: 'content', label: '专题内容', icon: <FileText className="w-4 h-4" /> },
          { key: 'products', label: '商品说明', icon: <Package className="w-4 h-4" /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key as any)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
              activeSection === tab.key
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── 商品理解层 ─────────────────────────────────────── */}
      {activeSection === 'understanding' && editedResult.understanding && (
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-lg p-4 space-y-3">
            <div>
              <Label className="text-xs text-blue-600 font-medium">整体主题</Label>
              <p className="text-sm mt-0.5">{editedResult.understanding.overall_theme}</p>
            </div>
            <div>
              <Label className="text-xs text-blue-600 font-medium">叙事角度</Label>
              <p className="text-sm mt-0.5">{editedResult.understanding.story_angle}</p>
            </div>
            <div>
              <Label className="text-xs text-blue-600 font-medium">本地生活锚点</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {(editedResult.understanding.local_anchors_used || []).map((anchor, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                    {anchor}
                  </span>
                ))}
              </div>
            </div>
            {editedResult.understanding.risk_notes && editedResult.understanding.risk_notes.length > 0 && (
              <div>
                <Label className="text-xs text-red-600 font-medium">风险提示</Label>
                <ul className="text-xs text-red-500 mt-1 space-y-0.5">
                  {editedResult.understanding.risk_notes.map((note, i) => (
                    <li key={i}>• {note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 推荐配置 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <Label className="text-xs text-gray-500">推荐专题类型</Label>
              <p className="text-sm font-medium mt-0.5">{editedResult.understanding.recommended_topic_type}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <Label className="text-xs text-gray-500">推荐卡片样式</Label>
              <p className="text-sm font-medium mt-0.5">{editedResult.understanding.recommended_card_style}</p>
            </div>
          </div>

          {/* 单品分析 */}
          {editedResult.understanding.products_analysis && editedResult.understanding.products_analysis.length > 0 && (
            <div>
              <Label className="text-xs text-gray-500 font-medium mb-2 block">单品分析</Label>
              <div className="space-y-2">
                {editedResult.understanding.products_analysis.map((pa, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                    <div className="font-medium text-sm">{pa.product_name}</div>
                    <div><span className="text-gray-500">最佳场景：</span>{pa.best_scene}</div>
                    <div><span className="text-gray-500">目标人群：</span>{pa.target_people}</div>
                    <div><span className="text-gray-500">本地关联：</span>{pa.local_life_connection}</div>
                    <div><span className="text-gray-500">卖点角度：</span>{pa.selling_angle}</div>
                    <div><span className="text-gray-500">推荐标签：</span>{pa.recommended_badge}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 专题内容 ───────────────────────────────────────── */}
      {activeSection === 'content' && (
        <div className="space-y-4">
          {/* 三语标题 */}
          <div>
            <Label className="text-xs text-gray-500 font-medium">专题标题</Label>
            <div className="space-y-2 mt-1">
              {['zh', 'ru', 'tg'].map(lang => (
                <div key={lang} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-8">{lang.toUpperCase()}</span>
                  <Input
                    value={editedResult.title_i18n?.[lang] || ''}
                    onChange={(e) => updateI18nField('title_i18n', lang, e.target.value)}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 三语副标题 */}
          <div>
            <Label className="text-xs text-gray-500 font-medium">副标题</Label>
            <div className="space-y-2 mt-1">
              {['zh', 'ru', 'tg'].map(lang => (
                <div key={lang} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-8">{lang.toUpperCase()}</span>
                  <Input
                    value={editedResult.subtitle_i18n?.[lang] || ''}
                    onChange={(e) => updateI18nField('subtitle_i18n', lang, e.target.value)}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 三语导语 */}
          <div>
            <Label className="text-xs text-gray-500 font-medium">导语</Label>
            <div className="space-y-2 mt-1">
              {['zh', 'ru', 'tg'].map(lang => (
                <div key={lang} className="flex items-start gap-2">
                  <span className="text-xs text-gray-400 w-8 mt-2">{lang.toUpperCase()}</span>
                  <Textarea
                    value={editedResult.intro_i18n?.[lang] || ''}
                    onChange={(e) => updateI18nField('intro_i18n', lang, e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 正文段落 */}
          {editedResult.story_blocks_i18n && editedResult.story_blocks_i18n.length > 0 && (
            <div>
              <Label className="text-xs text-gray-500 font-medium">正文段落</Label>
              {editedResult.story_blocks_i18n.map((block, idx) => (
                <div key={idx} className="mt-3 border rounded-lg p-3 bg-gray-50">
                  <div className="text-xs text-gray-400 mb-2">段落 {idx + 1}: {block.block_key}</div>
                  {['zh', 'ru', 'tg'].map(lang => (
                    <div key={lang} className="flex items-start gap-2 mb-1">
                      <span className="text-xs text-gray-400 w-8 mt-2">{lang.toUpperCase()}</span>
                      <Textarea
                        value={(block as any)[lang] || ''}
                        onChange={(e) => updateStoryBlock(idx, lang, e.target.value)}
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── 商品说明 ───────────────────────────────────────── */}
      {activeSection === 'products' && (
        <div className="space-y-3">
          {(editedResult.product_notes || []).map((note, idx) => (
            <div key={idx} className="border rounded-lg p-3 bg-gray-50">
              <div className="text-xs text-gray-400 mb-2">
                商品 ID: {note.product_id?.slice(0, 8)}...
              </div>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-gray-500">场景说明</Label>
                  {['zh', 'ru', 'tg'].map(lang => (
                    <div key={lang} className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400 w-8">{lang.toUpperCase()}</span>
                      <Input
                        value={note.note_i18n?.[lang] || ''}
                        onChange={(e) => {
                          setEditedResult(prev => {
                            const notes = [...(prev.product_notes || [])];
                            notes[idx] = {
                              ...notes[idx],
                              note_i18n: { ...notes[idx].note_i18n, [lang]: e.target.value },
                            };
                            return { ...prev, product_notes: notes };
                          });
                        }}
                        className="text-sm"
                      />
                    </div>
                  ))}
                </div>
                {note.badge_text_i18n && (
                  <div>
                    <Label className="text-xs text-gray-500">角标文案</Label>
                    {['zh', 'ru', 'tg'].map(lang => (
                      <div key={lang} className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400 w-8">{lang.toUpperCase()}</span>
                        <Input
                          value={note.badge_text_i18n?.[lang] || ''}
                          onChange={(e) => {
                            setEditedResult(prev => {
                              const notes = [...(prev.product_notes || [])];
                              notes[idx] = {
                                ...notes[idx],
                                badge_text_i18n: { ...(notes[idx].badge_text_i18n || {}), [lang]: e.target.value },
                              };
                              return { ...prev, product_notes: notes };
                            });
                          }}
                          className="text-sm"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {(!editedResult.product_notes || editedResult.product_notes.length === 0) && (
            <div className="text-center py-8 text-gray-400 text-sm">
              AI 未生成商品说明
            </div>
          )}
        </div>
      )}

      {/* ─── 底部操作栏 ─────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="ghost" onClick={onDiscard} className="text-gray-500">
          关闭
        </Button>
        <div className="flex items-center gap-3">
          {/* 解释信息 */}
          {editedResult.explanation && (
            <div className="text-xs text-gray-400 max-w-xs truncate">
              角度: {editedResult.explanation.selected_story_angle}
            </div>
          )}
          {task.savedAsDraft ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <CheckCircle className="w-4 h-4" />
              已创建为专题草稿
            </span>
          ) : (
            <Button
              onClick={() => onSaveAsDraft(editedResult)}
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              创建为专题草稿
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 统计小卡片
// ============================================================

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-lg border p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}
