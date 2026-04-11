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
import { adminQuery, adminInsert, adminUpdate, adminDelete } from '../lib/adminApi';
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
import { SingleImageUpload } from '@/components/SingleImageUpload';

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
// [v4 修复] 任务超时时间（毫秒）—— 超过此时间仍在 processing 的任务将被强制检查
const TASK_TIMEOUT_MS = 15 * 60 * 1000; // 15 分钟

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
  // [修复v2] 恢复时直接重置 processing 为 queued，重新进入执行队列（避免 recovering 伪状态卡死）
  const [tasks, setTasks] = useState<AITopicTask[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as any[];
        return parsed.map((t: any) => ({
          ...t,
          createdAt: new Date(t.createdAt),
          completedAt: t.completedAt ? new Date(t.completedAt) : undefined,
          // 恢复时：processing / recovering → queued（重新排队执行），其他状态保持不变
          status: (t.status === 'processing' || t.status === 'recovering') ? 'queued' : t.status,
          progress: (t.status === 'processing' || t.status === 'recovering') ? 0 : t.progress,
          stage: (t.status === 'processing' || t.status === 'recovering') ? '排队中（自动恢复）...' : t.stage,
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

  // 封面图生成选项
  const [generateCover, setGenerateCover] = useState(true);
  const [coverMode, setCoverMode] = useState<'ai_generate' | 'product_collage'>('ai_generate');

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

  // ─── [修复] 从 DB 加载历史已完成任务（补充本地没有的记录）─────────────────────
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

        // [自动清理] 彻底删除 error 状态超过 24 小时的任务，不占资源
        const now = Date.now();
        const ERROR_TTL_MS = 24 * 60 * 60 * 1000; // 24 小时
        const expiredErrorIds: string[] = [];
        for (const dbTask of dbTasks) {
          if (dbTask.status === 'error') {
            const taskAge = now - new Date(dbTask.completed_at || dbTask.created_at).getTime();
            if (taskAge > ERROR_TTL_MS) {
              expiredErrorIds.push(dbTask.id);
            }
          }
        }
        if (expiredErrorIds.length > 0) {
          console.log(`[AITopic] 自动清理 ${expiredErrorIds.length} 个过期 error 任务`);
          for (const eid of expiredErrorIds) {
            try {
              await adminDelete(supabase, 'ai_topic_generation_tasks', eid);
            } catch (e) {
              console.error('[AITopic] 删除过期任务失败:', eid, e);
            }
          }
        }

        setTasks(prev => {
          const existingTaskIds = new Set(prev.map(t => t.taskId).filter(Boolean));
          const existingLocalIds = new Set(prev.map(t => t.id));
          const updated = [...prev];

          // 已删除的过期 error 任务 ID 集合，不再加载
          const deletedIds = new Set(expiredErrorIds);

          // 从 DB 加载本地不存在的已完成任务（跨设备/跨会话历史记录）
          for (const dbTask of dbTasks) {
            if (deletedIds.has(dbTask.id)) continue;
            if (existingTaskIds.has(dbTask.id) || existingLocalIds.has(dbTask.id)) continue;
            if (dbTask.status !== 'done' && dbTask.status !== 'partial') continue;
            if (!dbTask.result_payload) continue;

            const request = dbTask.request_payload || {};
            updated.push({
              id: dbTask.id,
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
        setDbLoaded(true);
      }
    };

    loadFromDB();
  }, [supabase, dbLoaded]);

  // ─── [v4 修复] 跟踪每个任务是否已收到终态事件 ───────────────────
  // 用于判断 SSE 流正常结束时是否需要启动 DB 轮询兜底
  const taskReceivedFinalEventRef = useRef<Set<string>>(new Set());

  // ─── [v4 修复] DB 轮询：用于 SSE 断开后有 taskId 的任务，以及超时任务 ───────
  // 改进：
  //   1. 也轮询有活跃 SSE 但已超时的任务（兜底）
  //   2. 使用 ref 读取最新 tasks，避免闭包陈旧问题
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    // 轮询候选：
    //   A. 有 taskId 且 processing 且没有活跃 SSE 连接（SSE 断开后的兜底）
    //   B. 有 taskId 且 processing 且已超时（SSE 可能卡死）
    const now = Date.now();
    const needsPoll = tasks.filter(t => {
      if (t.status !== 'processing' || !t.taskId) return false;
      const noSSE = !abortControllersRef.current.has(t.id);
      const timedOut = (now - new Date(t.createdAt).getTime()) > TASK_TIMEOUT_MS;
      return noSSE || timedOut;
    });

    if (needsPoll.length === 0) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    if (!pollTimerRef.current) {
      const pollFn = async () => {
        // [v4 修复] 从 ref 读取最新 tasks，避免闭包陈旧
        const currentTasks = tasksRef.current;
        const now2 = Date.now();
        const pollCandidates = currentTasks.filter(t => {
          if (t.status !== 'processing' || !t.taskId) return false;
          const noSSE = !abortControllersRef.current.has(t.id);
          const timedOut = (now2 - new Date(t.createdAt).getTime()) > TASK_TIMEOUT_MS;
          return noSSE || timedOut;
        });

        if (pollCandidates.length === 0) {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          return;
        }

        try {
          for (const task of pollCandidates) {
            const taskId = task.taskId!;
            const dbTasks = await adminQuery<any>(supabase, 'ai_topic_generation_tasks', {
              select: 'id, status, result_payload, error_message, completed_at, topic_id',
              filters: [{ col: 'id', op: 'eq', val: taskId }],
              limit: 1,
            });

            if (dbTasks && dbTasks.length > 0) {
              const dbTask = dbTasks[0];
              if (dbTask.status === 'done' || dbTask.status === 'partial') {
                // [v4 修复] 如果还有活跃 SSE 连接，主动中断它
                const ctrl = abortControllersRef.current.get(task.id);
                if (ctrl) {
                  ctrl.abort();
                  abortControllersRef.current.delete(task.id);
                }

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
                const ctrl = abortControllersRef.current.get(task.id);
                if (ctrl) {
                  ctrl.abort();
                  abortControllersRef.current.delete(task.id);
                }

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
              // 如果 DB 中仍然是 processing，检查是否超过硬超时
              if (dbTask.status === 'processing') {
                const taskAge = now2 - new Date(dbTask.created_at || task.createdAt).getTime();
                if (taskAge > TASK_TIMEOUT_MS) {
                  // 硬超时：强制标记为 error
                  console.warn('[AITopic] 任务超时，强制标记为失败:', taskId);
                  const ctrl = abortControllersRef.current.get(task.id);
                  if (ctrl) {
                    ctrl.abort();
                    abortControllersRef.current.delete(task.id);
                  }
                  // 更新 DB 中的状态
                  try {
                    await adminUpdate(supabase, 'ai_topic_generation_tasks', taskId, {
                      status: 'error',
                      error_message: '任务超时（超过15分钟未完成）',
                      completed_at: new Date().toISOString(),
                    });
                  } catch (e) {
                    console.error('[AITopic] 更新超时任务状态失败:', e);
                  }
                  setTasks(prev => prev.map(t => {
                    if (t.taskId === taskId) {
                      return {
                        ...t,
                        status: 'error',
                        progress: 0,
                        stage: '生成超时',
                        errorMessage: '任务超时（超过15分钟未完成），请重新尝试',
                      };
                    }
                    return t;
                  }));
                  toast.error('任务超时，请重新生成');
                }
              }
            }
          }
        } catch (error) {
          console.error('[AITopic] DB 轮询失败:', error);
        }
      };

      pollTimerRef.current = setInterval(pollFn, DB_POLL_INTERVAL);
      pollFn(); // 立即执行一次
    }

    return () => {
      // 不在 cleanup 中清除，避免频繁触发时中断轮询
    };
  }, [tasks, supabase]);

  // ─── [v4 修复] SSE 执行单个任务 ──────────────────────────────
  // 改进：
  //   1. 不再依赖 tasks 闭包，改用 tasksRef 读取最新状态
  //   2. processing 事件也保存 task_id（如果有的话）
  //   3. 新增 onStreamEnd 回调，实现 SSE 流结束兜底
  const executeTask = useCallback(
    (task: AITopicTask) => {
      // 重置终态跟踪
      taskReceivedFinalEventRef.current.delete(task.id);

      updateTask(task.id, {
        status: 'processing',
        progress: 5,
        stage: '正在连接 AI 服务...',
        taskId: undefined,
        errorMessage: undefined,
        result: undefined,
        completedAt: undefined,
        createdAt: new Date(),
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
          generate_cover: task.request.generate_cover ?? true,
          cover_mode: task.request.cover_mode ?? 'ai_generate',
        },
        // onEvent
        (data: AITopicSSEEventData) => {
          if (data.status === 'processing') {
            // [v4 修复] processing 事件也保存 task_id（后端在创建任务记录后就会发送）
            const updates: Partial<AITopicTask> = {
              status: 'processing',
              progress: data.progress || 0,
              stage: data.stage || '处理中...',
            };
            if (data.task_id) {
              updates.taskId = data.task_id;
            }
            updateTask(task.id, updates);
          } else if (data.status === 'done' || data.status === 'partial') {
            // 标记已收到终态事件
            taskReceivedFinalEventRef.current.add(task.id);

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
            // 标记已收到终态事件
            taskReceivedFinalEventRef.current.add(task.id);

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
          // [v4 修复] 使用 tasksRef 读取最新状态，避免闭包陈旧
          const currentTask = tasksRef.current.find(t => t.id === task.id);
          if (currentTask?.taskId) {
            // 有 taskId，保持 processing 状态，让 DB 轮询兜底
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
        },
        // [v4 新增] onStreamEnd —— SSE 流正常结束的兜底处理
        () => {
          // 清理 controller
          abortControllersRef.current.delete(task.id);

          // 如果已经收到了终态事件，不需要兜底
          if (taskReceivedFinalEventRef.current.has(task.id)) {
            return;
          }

          // [v4 修复 核心] SSE 流正常结束但未收到终态事件
          // 检查任务是否有 taskId，如果有则保持 processing 让 DB 轮询兜底
          const currentTask = tasksRef.current.find(t => t.id === task.id);
          console.warn('[AITopic] SSE 流正常结束但未收到终态事件，任务:', task.id, 'taskId:', currentTask?.taskId);

          if (currentTask?.taskId) {
            // 有 taskId，保持 processing，DB 轮询会接管恢复
            updateTask(task.id, {
              status: 'processing',
              stage: 'SSE 连接已关闭，正在从服务器查询结果...',
            });
          } else {
            // 没有 taskId，无法通过 DB 恢复，标记为错误
            updateTask(task.id, {
              status: 'error',
              progress: 0,
              stage: '生成失败',
              errorMessage: '服务器连接已关闭但未返回结果，请重试',
            });
            toast.error('生成失败：服务器未返回结果，请重试');
          }
        }
      );

      abortControllersRef.current.set(task.id, controller);
    },
    [updateTask]  // [v4 修复] 移除 tasks 依赖，改用 tasksRef
  );

  // ─── 当 tasks 变化时检查是否有待处理任务（一次只处理一个）──
  // [v4 修复] 包含 queued 状态（含自动恢复的任务）
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
      generate_cover: generateCover,
      cover_mode: coverMode,
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
    const ctrl = abortControllersRef.current.get(taskId);
    if (ctrl) {
      ctrl.abort();
      abortControllersRef.current.delete(taskId);
    }
    taskReceivedFinalEventRef.current.delete(taskId);

    updateTask(taskId, {
      status: 'queued',
      progress: 0,
      stage: '排队中（重试）...',
      errorMessage: undefined,
      result: undefined,
      taskId: undefined,
      completedAt: undefined,
    });
  };

  // ─── 删除任务 ──────────────────────────────────────────────
  // [BUG-FIX-1] 删除任务时同时从数据库 ai_topic_generation_tasks 表删除，
  // 避免刷新页面后从 DB 加载历史任务导致已删除的任务重新出现
  const handleDeleteTask = async (taskId: string) => {
    // 找到要删除的任务，获取其后端 taskId（用于 DB 删除）
    const taskToDelete = tasks.find(t => t.id === taskId);

    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(taskId);
    }
    // 立即从本地状态移除（UI 即时响应）
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (viewingTaskId === taskId) setViewingTaskId(null);

    // 如果任务有后端 taskId，同步从数据库删除
    if (taskToDelete?.taskId) {
      try {
        await adminDelete(supabase, 'ai_topic_generation_tasks', [
          { col: 'id', op: 'eq', val: taskToDelete.taskId },
        ]);
      } catch (error) {
        console.error('[AITopic] 从 DB 删除任务失败:', error);
        // DB 删除失败不影响本地删除，但给用户提示
        toast.error('任务已从列表移除，但服务器记录删除失败，刷新后可能重新出现');
      }
    }
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
      // [BUG-FIX-3] 生成 slug 并确保唯一性
      // slug 只允许小写英文字母、数字和连字符，不允许中文
      // 优先使用俄语标题（可转写为拉丁字符），中文标题则跳过直接用 UUID
      const rawTitle = editedResult.title_i18n?.ru || editedResult.title_i18n?.tg || '';
      const slugBase = rawTitle
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30) || 'topic';
      const uniqueSuffix = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const slug = `ai-${slugBase}-${uniqueSuffix}`;

      // 映射 topic_type 和 card_style
      const aiTopicType = editedResult.understanding?.recommended_topic_type || 'story';
      const aiCardStyle = editedResult.understanding?.recommended_card_style || 'story_card';
      const topicType = TOPIC_TYPE_MAP[aiTopicType] || 'story';
      const cardStyle = CARD_STYLE_MAP[aiCardStyle] || 'standard';

      // [v2 + BUG-06/07 修复] 从 sections 构建 story_blocks_i18n，确保 block_key 唯一且 block_type 有效
      const sections = editedResult.sections || [];
      const validBlockTypes = ['paragraph', 'heading', 'callout'];
      const storyBlocks = sections.length > 0
        ? sections.map((section, i) => {
            const uniqueKey = typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID().slice(0, 8)
              : `${Date.now().toString(36)}_${i}`;
            // [BUG-FIX-4] 使用扁平格式 { zh, ru, tg } 而非嵌套 content_i18n，
            // 与 HomepageTopicManagementPage 保存格式保持一致
            return {
              block_key: `section_${i}_${uniqueKey}`,
              block_type: 'paragraph' as string,
              zh: section.story_text_i18n?.zh || '',
              ru: section.story_text_i18n?.ru || '',
              tg: section.story_text_i18n?.tg || '',
            };
          })
        : (editedResult.story_blocks_i18n || []).map((block, idx) => {
            const blockType = validBlockTypes.includes(block.block_type || '') ? block.block_type : 'paragraph';
            // [BUG-FIX-4] 使用扁平格式，与 HomepageTopicManagementPage 保持一致
            return {
              block_key: block.block_key || `block_${idx}_${Date.now().toString(36)}`,
              block_type: blockType,
              zh: block.zh || '',
              ru: block.ru || '',
              tg: block.tg || '',
            };
          });

      // 构建专题数据（含封面图）
      const topicData: Record<string, any> = {
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

      // v2: 封面图
      // [BUG-FIX-2] AI生成的封面图同时写入 cover_image_url 和 cover_image_default，
      // 确保专题管理页面能正确显示和使用封面图。
      // cover_image_url 用于标记AI来源，cover_image_default 用于前端通用展示回退。
      if (editedResult.cover_image_url) {
        topicData.cover_image_url = editedResult.cover_image_url;
        topicData.cover_image_default = editedResult.cover_image_url;
      }

      // [RLS 修复] 插入 homepage_topics
      const topicResult = await adminInsert<{ id: string }>(supabase, 'homepage_topics', topicData);
      const topicId = topicResult?.id;
      if (!topicId) throw new Error('创建专题失败，未返回 ID');

      // v2: 按 sections 插入 topic_products（带 story_group + story_text_i18n）
      const productInserts: any[] = [];
      let globalSortOrder = 0;

      // [修复] 统一空 i18n 对象处理，确保 {} 转为 null 入库
      const normalizeI18n = (obj: any) => {
        if (!obj) return null;
        if (typeof obj === 'object' && Object.keys(obj).length === 0) return null;
        // 检查所有值是否都为空字符串
        if (typeof obj === 'object' && Object.values(obj).every(v => !v || (typeof v === 'string' && v.trim() === ''))) return null;
        return obj;
      };

      for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
        const section = sections[sectionIdx];
        for (const sp of (section.products || [])) {
          productInserts.push({
            topic_id: topicId,
            product_id: sp.product_id,
            sort_order: globalSortOrder++,
            story_group: sectionIdx,
            story_text_i18n: normalizeI18n(section.story_text_i18n),
            note_i18n: normalizeI18n(sp.note_i18n),
            badge_text_i18n: normalizeI18n(sp.badge_text_i18n),
          });
        }
      }

      // [v8 修复] 如果 sections 中没有商品（可能是旧格式），从 product_notes 补充
      if (productInserts.length === 0 && (editedResult.product_notes || []).length > 0) {
        // 构建占位符 → 真实 ID 映射
        const pidMap: Record<string, string> = {};
        task.request.selected_products.forEach((p, i) => {
          pidMap[`商品${i + 1}`] = p.id;
          pidMap[`product_${i + 1}`] = p.id;
        });

        for (const note of editedResult.product_notes) {
          const realId = pidMap[note.product_id] || note.product_id;
          // 验证 product_id 是否在选中商品列表中
          const isValid = task.request.selected_products.some(p => p.id === realId);
          if (isValid) {
            productInserts.push({
              topic_id: topicId,
              product_id: realId,
              sort_order: globalSortOrder++,
              story_group: 0,
              story_text_i18n: null,
              note_i18n: normalizeI18n(note.note_i18n),
              badge_text_i18n: normalizeI18n(note.badge_text_i18n),
            });
          }
        }
      }

      // 处理未分配到 section 的商品
      const sectionProductIds = new Set(productInserts.map(p => p.product_id));
      for (const p of task.request.selected_products) {
        if (!sectionProductIds.has(p.id)) {
          productInserts.push({
            topic_id: topicId,
            product_id: p.id,
            sort_order: globalSortOrder++,
            story_group: sections.length || 0,
            note_i18n: null,
            badge_text_i18n: null,
          });
        }
      }

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

      // [v6 修复] 先关闭 Dialog，再更新任务状态
      // 避免 React DOM reconciliation 与 Radix Dialog Portal 卸载的竞争条件
      // （savedAsDraft 切换会在 Dialog 内部将 <Button> 替换为 <span>，
      //  同时 Portal 正在卸载子树，导致 insertBefore 错误）
      setViewingTaskId(null);
      toast.success('专题草稿创建成功！请到专题管理页面继续编辑和发布。');

      // [修复] 使用 requestAnimationFrame + setTimeout 确保 Dialog 完全卸载后再更新任务状态
      // requestAnimationFrame 确保在下一帧渲染后执行，300ms 延迟确保 Radix Dialog 动画完成
      requestAnimationFrame(() => {
        setTimeout(() => {
          updateTask(taskId, {
            savedAsDraft: true,
            savedTopicId: topicId,
          });
        }, 300);
      });

      // 审计日志（异步，不阻塞 UI）
      const duration = Date.now() - startTime;
      auditLog(supabase, {
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
      }).catch(e => console.error('[AITopic] 审计日志写入失败:', e));
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
    processing: tasks.filter(t => t.status === 'processing').length,
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

            {/* 封面图生成选项 */}
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <Label className="font-medium">自动生成封面图</Label>
                <button
                  type="button"
                  onClick={() => setGenerateCover(!generateCover)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    generateCover ? 'bg-purple-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      generateCover ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {generateCover && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCoverMode('ai_generate')}
                    className={`flex-1 px-3 py-1.5 rounded text-xs border transition-colors ${
                      coverMode === 'ai_generate'
                        ? 'bg-purple-100 border-purple-300 text-purple-700'
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    AI 场景图
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoverMode('product_collage')}
                    className={`flex-1 px-3 py-1.5 rounded text-xs border transition-colors ${
                      coverMode === 'product_collage'
                        ? 'bg-purple-100 border-purple-300 text-purple-700'
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    商品合成图
                  </button>
                </div>
              )}
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
      {task.status === 'processing' && (
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
        {task.status !== 'processing' && (
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
  // [BUG-24 修复 + v2 + v8 向后兼容] 深拷贝初始化，自动从旧格式构建 sections
  const [editedResult, setEditedResult] = useState<AITopicDraftResult>(() => {
    let parsed: AITopicDraftResult;
    try {
      parsed = JSON.parse(JSON.stringify(result));
    } catch {
      parsed = { ...result };
    }

    // [v8 向后兼容] 如果 sections 为空，从 story_blocks_i18n + product_notes 自动构建
    if (!parsed.sections || parsed.sections.length === 0) {
      const blocks = parsed.story_blocks_i18n || [];
      const notes = parsed.product_notes || [];

      // 构建 "商品N" → 真实 ID 的映射表
      const productIdMap: Record<string, string> = {};
      (task.request.selected_products || []).forEach((p, i) => {
        productIdMap[`商品${i + 1}`] = p.id;
        productIdMap[`product_${i + 1}`] = p.id;
      });

      // 修复 product_notes 中的占位符 product_id
      const fixedNotes = notes.map(n => ({
        ...n,
        product_id: productIdMap[n.product_id] || n.product_id,
      }));

      if (blocks.length > 0) {
        const productsPerBlock = Math.ceil(fixedNotes.length / Math.max(blocks.length, 1));
        parsed.sections = blocks.map((block, blockIdx) => {
          const startIdx = blockIdx * productsPerBlock;
          const endIdx = Math.min(startIdx + productsPerBlock, fixedNotes.length);
          const blockProducts = fixedNotes.slice(startIdx, endIdx).map(note => ({
            product_id: note.product_id,
            note_i18n: note.note_i18n || {},
            badge_text_i18n: note.badge_text_i18n || {},
          }));
          return {
            story_text_i18n: {
              zh: block.zh || '',
              ru: block.ru || '',
              tg: block.tg || '',
            },
            products: blockProducts,
          };
        });
      } else if (fixedNotes.length > 0) {
        // 没有段落但有商品备注，创建一个默认段落
        parsed.sections = [{
          story_text_i18n: { zh: '', ru: '', tg: '' },
          products: fixedNotes.map(note => ({
            product_id: note.product_id,
            note_i18n: note.note_i18n || {},
            badge_text_i18n: note.badge_text_i18n || {},
          })),
        }];
      }

      // 同时修复 product_notes
      parsed.product_notes = fixedNotes;
    }

    // [v9 修复] 确保 selected_products 中的所有商品都出现在 sections 中
    // 无论 sections 来自 AI 直接输出还是向后兼容构建，都需要检查是否有遗漏的商品
    if (parsed.sections && parsed.sections.length > 0) {
      const allSectionProductIds = new Set<string>();
      for (const sec of parsed.sections) {
        for (const sp of (sec.products || [])) {
          allSectionProductIds.add(sp.product_id);
        }
      }

      const missingProducts = (task.request.selected_products || []).filter(
        p => !allSectionProductIds.has(p.id)
      );

      if (missingProducts.length > 0) {
        // 将缺失的商品添加到一个新的"其他商品"段落
        const missingProductEntries = missingProducts.map(p => ({
          product_id: p.id,
          note_i18n: { zh: `${p.name_i18n?.zh || p.name || '未知商品'}（AI 未生成说明，请手动编辑）`, ru: '', tg: '' },
          badge_text_i18n: { zh: '待编辑', ru: '', tg: '' },
        }));
        parsed.sections.push({
          story_text_i18n: {
            zh: '其他推荐商品',
            ru: 'Другие рекомендуемые товары',
            tg: 'Дигар молҳои тавсияшаванда',
          },
          products: missingProductEntries,
        });
      }
    } else if (!parsed.sections || parsed.sections.length === 0) {
      // sections 仍然为空（没有 story_blocks 也没有 product_notes），
      // 但有 selected_products，创建一个包含所有商品的默认段落
      const allProducts = (task.request.selected_products || []);
      if (allProducts.length > 0) {
        parsed.sections = [{
          story_text_i18n: { zh: '推荐商品', ru: 'Рекомендуемые товары', tg: 'Молҳои тавсияшаванда' },
          products: allProducts.map(p => ({
            product_id: p.id,
            note_i18n: { zh: `${p.name_i18n?.zh || p.name || '未知商品'}（AI 未生成说明，请手动编辑）`, ru: '', tg: '' },
            badge_text_i18n: { zh: '待编辑', ru: '', tg: '' },
          })),
        }];
      }
    }

    return parsed;
  });
  const [activeSection, setActiveSection] = useState<'understanding' | 'content' | 'sections'>('content');

  const updateField = (field: string, value: any) => {
    setEditedResult(prev => ({ ...prev, [field]: value }));
  };

  const updateI18nField = (field: string, lang: string, value: string) => {
    setEditedResult(prev => ({
      ...prev,
      [field]: { ...(prev as any)[field], [lang]: value },
    }));
  };

  // v2: 更新 section 的场景文案
  const updateSectionStoryText = (sectionIdx: number, lang: string, value: string) => {
    setEditedResult(prev => {
      const sections = [...(prev.sections || [])];
      sections[sectionIdx] = {
        ...sections[sectionIdx],
        story_text_i18n: { ...sections[sectionIdx].story_text_i18n, [lang]: value },
      };
      return { ...prev, sections };
    });
  };

  // v2: 更新 section 内商品的 note
  const updateSectionProductNote = (sectionIdx: number, productIdx: number, lang: string, value: string) => {
    setEditedResult(prev => {
      const sections = [...(prev.sections || [])];
      const products = [...(sections[sectionIdx].products || [])];
      products[productIdx] = {
        ...products[productIdx],
        note_i18n: { ...products[productIdx].note_i18n, [lang]: value },
      };
      sections[sectionIdx] = { ...sections[sectionIdx], products };
      return { ...prev, sections };
    });
  };

  // v2: 更新 section 内商品的 badge
  const updateSectionProductBadge = (sectionIdx: number, productIdx: number, lang: string, value: string) => {
    setEditedResult(prev => {
      const sections = [...(prev.sections || [])];
      const products = [...(sections[sectionIdx].products || [])];
      products[productIdx] = {
        ...products[productIdx],
        badge_text_i18n: { ...(products[productIdx].badge_text_i18n || {}), [lang]: value },
      };
      sections[sectionIdx] = { ...sections[sectionIdx], products };
      return { ...prev, sections };
    });
  };

  // v2: 选择封面图
  const selectCoverImage = (url: string) => {
    setEditedResult(prev => ({ ...prev, cover_image_url: url }));
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

      {/* v2: 封面图选择 + 手动上传 */}
      <div className="bg-gray-50 rounded-lg p-3">
        <Label className="text-xs text-gray-500 font-medium mb-2 block">专题封面图</Label>
        {/* AI生成的封面图候选（如果有） */}
        {(editedResult.cover_image_urls && editedResult.cover_image_urls.length > 0) && (
          <div className="mb-3">
            <p className="text-xs text-gray-400 mb-2">AI 生成的封面图（点击选择）：</p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {editedResult.cover_image_urls.map((url, i) => (
                <button
                  key={i}
                  onClick={() => selectCoverImage(url)}
                  className={`relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                    editedResult.cover_image_url === url
                      ? 'border-purple-500 ring-2 ring-purple-200'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <img src={url} alt={`封面图 ${i + 1}`} className="w-40 h-24 object-cover" />
                  {editedResult.cover_image_url === url && (
                    <div className="absolute top-1 right-1 bg-purple-600 text-white rounded-full p-0.5">
                      <CheckCircle className="w-3.5 h-3.5" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* 手动上传封面图 */}
        <div className="border border-dashed border-gray-300 rounded-lg p-3 bg-white">
          <p className="text-xs text-gray-400 mb-2">手动上传封面图：</p>
          <SingleImageUpload
            bucket="topics"
            folder="covers"
            imageUrl={editedResult.cover_image_url || ''}
            onImageUrlChange={(url) => selectCoverImage(url)}
          />
        </div>
        {editedResult.cover_image_url && (
          <div className="mt-2 flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
            <span className="text-xs text-green-600">已选择封面图</span>
          </div>
        )}
      </div>

      {/* 切换标签 */}
      <div className="flex gap-1 border-b">
        {[
          { key: 'understanding', label: '商品理解', icon: <Lightbulb className="w-4 h-4" /> },
          { key: 'content', label: '专题内容', icon: <FileText className="w-4 h-4" /> },
          { key: 'sections', label: '段落与商品', icon: <Package className="w-4 h-4" /> },
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

        </div>
      )}

      {/* ─── v2: 段落与商品（Sections）───────────────────── */}
      {activeSection === 'sections' && (
        <div className="space-y-4">
          {(editedResult.sections || []).length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              AI 未生成段落分组
            </div>
          ) : (
            editedResult.sections.map((section, sIdx) => (
              <div key={sIdx} className="border rounded-lg overflow-hidden">
                {/* Section 头部 */}
                <div className="bg-orange-50 px-4 py-2 border-b">
                  <div className="text-sm font-medium text-orange-700">
                    段落 {sIdx + 1} · {section.products?.length || 0} 个商品
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {/* 场景文案 */}
                  <div>
                    <Label className="text-xs text-gray-500 font-medium">场景化文案</Label>
                    {['zh', 'ru', 'tg'].map(lang => (
                      <div key={lang} className="flex items-start gap-2 mt-1">
                        <span className="text-xs text-gray-400 w-8 mt-2">{lang.toUpperCase()}</span>
                        <Textarea
                          value={section.story_text_i18n?.[lang] || ''}
                          onChange={(e) => updateSectionStoryText(sIdx, lang, e.target.value)}
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                    ))}
                  </div>

                  {/* 关联商品 */}
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500 font-medium">关联商品</Label>
                    {(section.products || []).map((sp, pIdx) => {
                      const productInfo = task.request.selected_products.find(p => p.id === sp.product_id);
                      return (
                        <div key={pIdx} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            {productInfo?.image_url && (
                              <img src={productInfo.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {productInfo?.name_i18n?.zh || productInfo?.name || sp.product_id.slice(0, 8)}
                              </div>
                              <div className="text-xs text-gray-400">{sp.product_id.slice(0, 8)}...</div>
                            </div>
                          </div>

                          {/* 场景说明 */}
                          <div className="mb-2">
                            <Label className="text-xs text-gray-400">场景说明</Label>
                            {['zh', 'ru', 'tg'].map(lang => (
                              <div key={lang} className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-gray-400 w-8">{lang.toUpperCase()}</span>
                                <Input
                                  value={sp.note_i18n?.[lang] || ''}
                                  onChange={(e) => updateSectionProductNote(sIdx, pIdx, lang, e.target.value)}
                                  className="text-sm h-8"
                                />
                              </div>
                            ))}
                          </div>

                          {/* 角标 */}
                          <div>
                            <Label className="text-xs text-gray-400">角标文案</Label>
                            {['zh', 'ru', 'tg'].map(lang => (
                              <div key={lang} className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-gray-400 w-8">{lang.toUpperCase()}</span>
                                <Input
                                  value={sp.badge_text_i18n?.[lang] || ''}
                                  onChange={(e) => updateSectionProductBadge(sIdx, pIdx, lang, e.target.value)}
                                  className="text-sm h-8"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))
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
