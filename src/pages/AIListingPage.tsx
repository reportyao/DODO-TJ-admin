/**
 * AIListingPage — AI 商品上架助手主页面
 *
 * 功能：
 *   1. 左侧：任务创建表单（TaskCreationForm）
 *   2. 右侧：任务队列列表（TaskProgressCard × N）
 *   3. 弹窗/抽屉：结果预览与编辑（TaskResultPreview）
 *   4. 底部：批量操作栏（BatchActionBar）
 *   5. SSE 联调：通过 adminSSEFetch 调用 Edge Function
 *   6. 入库逻辑：写入 inventory_products 表 + 审计日志
 *
 * 状态管理：
 *   - tasks: AITask[] — 所有任务列表（sessionStorage 持久化）
 *   - selectedIds: Set<string> — 批量选中的任务 ID
 *   - viewingTaskId: string | null — 当前查看结果的任务 ID
 *   - abortControllers: Map<string, AbortController> — SSE 连接管理
 *
 * 并发控制：
 *   - 最多同时执行 2 个 SSE 请求（考虑万相 API 的 2QPS 限制）
 *   - 超出的任务处于排队状态，前面的任务完成后自动触发
 *
 * 状态持久化：
 *   - sessionStorage 保存任务列表
 *   - beforeunload 事件拦截，提示"有未保存的生成结果"
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sparkles, ListTodo, Trash2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

import { adminSSEFetch, adminInsert } from '@/lib/adminApi';
import { auditLog } from '@/lib/auditLogger';
import { TaskCreationForm } from '@/components/AIListing/TaskCreationForm';
import { TaskProgressCard } from '@/components/AIListing/TaskProgressCard';
import { TaskResultPreview } from '@/components/AIListing/TaskResultPreview';
import { BatchActionBar } from '@/components/AIListing/BatchActionBar';
import type { AITask, AIListingResult, SSEEventData } from '@/types/aiListing';

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || '';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-listing-generate`;
const SESSION_STORAGE_KEY = 'ai_listing_tasks';
const MAX_CONCURRENT = 2; // 最多同时处理 2 个任务

// ============================================================
// 主组件
// ============================================================

export default function AIListingPage() {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();

  // ─── 核心状态 ──────────────────────────────────────────────
  const [tasks, setTasks] = useState<AITask[]>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as any[];
        return parsed.map((t) => ({
          ...t,
          createdAt: new Date(t.createdAt),
          completedAt: t.completedAt ? new Date(t.completedAt) : undefined,
          // 恢复时将 processing 状态重置为 queued（因为 SSE 连接已断开）
          status: t.status === 'processing' ? 'queued' : t.status,
          progress: t.status === 'processing' ? 0 : t.progress,
          stage: t.status === 'processing' ? '排队中（已恢复）...' : t.stage,
        }));
      }
    } catch {
      // 解析失败忽略
    }
    return [];
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewingTaskId, setViewingTaskId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);

  // SSE 连接管理
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  // 当前正在处理的任务数量
  const processingCountRef = useRef(0);

  // ─── 持久化到 sessionStorage ──────────────────────────────
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // 存储满时忽略
    }
  }, [tasks]);

  // ─── beforeunload 事件拦截 ────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsaved = tasks.some(
        (t) => (t.status === 'done' || t.status === 'partial') && !t.savedToInventory
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

  // ─── 组件卸载时中止所有 SSE 连接 ─────────────────────────
  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach((ctrl) => ctrl.abort());
      abortControllersRef.current.clear();
    };
  }, []);

  // ─── 更新单个任务 ──────────────────────────────────────────
  const updateTask = useCallback((taskId: string, updates: Partial<AITask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
    );
  }, []);

  // ─── SSE 执行单个任务 ──────────────────────────────────────
  const executeTask = useCallback(
    (task: AITask) => {
      // 标记为 processing
      updateTask(task.id, {
        status: 'processing',
        progress: 5,
        stage: '正在连接 AI 服务...',
      });

      const controller = adminSSEFetch(
        EDGE_FUNCTION_URL,
        {
          image_urls: task.imageUrls,
          category: task.category,
          product_name: task.productName,
          specs: task.specs,
          price: task.price,
          notes: task.notes,
        },
        // onEvent
        (data: SSEEventData) => {
          if (data.status === 'processing') {
            updateTask(task.id, {
              status: 'processing',
              progress: data.progress || 0,
              stage: data.stage || '处理中...',
            });
          } else if (data.status === 'done' || data.status === 'partial') {
            const result: AIListingResult = {
              title_ru: data.result?.title_ru || '',
              title_zh: data.result?.title_zh || '',
              title_tg: data.result?.title_tg || '',
              bullets_ru: data.result?.bullets_ru || [],
              bullets_zh: data.result?.bullets_zh || [],
              bullets_tg: data.result?.bullets_tg || [],
              description_ru: data.result?.description_ru || '',
              description_zh: data.result?.description_zh || '',
              description_tg: data.result?.description_tg || '',
              background_images: data.result?.background_images || [],
              analysis: {
                product_type: data.result?.analysis?.product_type,
                main_color: data.result?.analysis?.main_color,
                material_guess: data.result?.material_guess || data.result?.analysis?.material_guess || null,
                key_features: data.result?.analysis?.key_features,
                use_scenes: data.result?.analysis?.use_scenes,
                target_audience: data.result?.analysis?.target_audience,
              },
            };

            updateTask(task.id, {
              status: data.status,
              progress: 100,
              stage: data.status === 'done' ? '全部完成' : '部分完成（仅文案）',
              result,
              completedAt: new Date(),
            });

            // 清理 controller，减少计数
            abortControllersRef.current.delete(task.id);
            processingCountRef.current = Math.max(0, processingCountRef.current - 1);

            // 触发下一个任务
            processNextTask();
          } else if (data.status === 'error') {
            updateTask(task.id, {
              status: 'error',
              progress: 0,
              stage: '生成失败',
              errorMessage: data.error || '未知错误',
            });

            abortControllersRef.current.delete(task.id);
            processingCountRef.current = Math.max(0, processingCountRef.current - 1);
            processNextTask();
          }
        },
        // onError
        (error: Error) => {
          updateTask(task.id, {
            status: 'error',
            progress: 0,
            stage: '连接失败',
            errorMessage: error.message || '网络连接中断，请重试',
          });

          abortControllersRef.current.delete(task.id);
          processingCountRef.current = Math.max(0, processingCountRef.current - 1);
          processNextTask();
        }
      );

      abortControllersRef.current.set(task.id, controller);
    },
    [updateTask]
  );

  // ─── 处理队列中的下一个任务（支持 2 并发） ─────────────────
  const processNextTask = useCallback(() => {
    // 如果已达到最大并发数，不启动新任务
    if (processingCountRef.current >= MAX_CONCURRENT) return;

    setTasks((prev) => {
      const queuedTasks = prev.filter((t) => t.status === 'queued');
      // 可以启动的任务数量
      const slotsAvailable = MAX_CONCURRENT - processingCountRef.current;
      const tasksToStart = queuedTasks.slice(0, slotsAvailable);

      for (const task of tasksToStart) {
        processingCountRef.current++;
        // 使用 setTimeout 避免在 setState 回调中触发副作用
        setTimeout(() => executeTask(task), 0);
      }
      return prev;
    });
  }, [executeTask]);

  // ─── 当 tasks 变化时检查是否有待处理任务 ──────────────────
  useEffect(() => {
    if (processingCountRef.current < MAX_CONCURRENT) {
      const hasQueued = tasks.some((t) => t.status === 'queued');
      if (hasQueued) {
        processNextTask();
      }
    }
  }, [tasks, processNextTask]);

  // ─── 添加新任务 ────────────────────────────────────────────
  const handleAddTask = useCallback((task: AITask) => {
    setTasks((prev) => [...prev, task]);
    toast.success(`"${task.productName}" 已添加到生成队列`);
  }, []);

  // ─── 重试失败任务 ──────────────────────────────────────────
  const handleRetry = useCallback((taskId: string) => {
    updateTask(taskId, {
      status: 'queued',
      progress: 0,
      stage: '排队中（重试）...',
      errorMessage: undefined,
    });
  }, [updateTask]);

  // ─── 查看结果 ──────────────────────────────────────────────
  const handleViewResult = useCallback((taskId: string) => {
    setViewingTaskId(taskId);
  }, []);

  // ─── 选择/取消选择任务 ─────────────────────────────────────
  const handleSelect = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  // ─── 全选/取消全选 ─────────────────────────────────────────
  const completedUnsavedTasks = tasks.filter(
    (t) => (t.status === 'done' || t.status === 'partial') && !t.savedToInventory
  );

  const allSelected =
    completedUnsavedTasks.length > 0 &&
    completedUnsavedTasks.every((t) => selectedIds.has(t.id));

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(completedUnsavedTasks.map((t) => t.id)));
    }
  }, [allSelected, completedUnsavedTasks]);

  // ─── 单个任务入库（严格按照开发文档字段映射） ──────────────
  const saveTaskToInventory = useCallback(
    async (task: AITask, editedResult: AIListingResult, selectedImages: string[]) => {
      if (!admin) throw new Error('未登录');

      const startTime = Date.now();

      // 合并图片：选中的背景图 + 原始商品图
      const allImages = [...selectedImages, ...task.imageUrls];

      // 材质推测
      const materialGuess = editedResult.analysis?.material_guess || '';

      /**
       * 字段映射严格按照开发文档第五章 3.6 节：
       *
       * name          → 用户输入的商品名称
       * name_i18n     → {zh: title_zh, ru: title_ru, tg: title_tg}
       * description   → AI 生成的中文描述
       * description_i18n → {zh: description_zh, ru: description_ru, tg: description_tg}
       * specifications → 用户输入的规格
       * specifications_i18n → {zh: specs, ru: specs, tg: specs}
       * material      → AI 提取的 material_guess 或留空
       * material_i18n → {zh: material, ru: material, tg: material}
       * details       → AI 生成的中文描述（与 description 相同）
       * details_i18n  → {zh: description_zh, ru: description_ru, tg: description_tg}
       * image_url     → 主图 URL（第一张图）
       * image_urls    → 所有选中图片的 URL 数组
       * original_price → 用户输入的售价
       * currency      → 'TJS'
       * stock         → 用户输入的库存
       * reserved_stock → 0
       * sku           → null
       * barcode       → null
       * status        → 'ACTIVE'
       */
      const productData = {
        name: task.productName,
        name_i18n: {
          zh: editedResult.title_zh || task.productName,
          ru: editedResult.title_ru || '',
          tg: editedResult.title_tg || '',
        },
        description: editedResult.description_zh || '',
        description_i18n: {
          zh: editedResult.description_zh || '',
          ru: editedResult.description_ru || '',
          tg: editedResult.description_tg || '',
        },
        specifications: task.specs || '',
        specifications_i18n: {
          zh: task.specs || '',
          ru: task.specs || '',
          tg: task.specs || '',
        },
        material: materialGuess,
        material_i18n: {
          zh: materialGuess,
          ru: materialGuess,
          tg: materialGuess,
        },
        details: editedResult.description_zh || '',
        details_i18n: {
          zh: editedResult.description_zh || '',
          ru: editedResult.description_ru || '',
          tg: editedResult.description_tg || '',
        },
        image_url: allImages[0] || '',
        image_urls: allImages,
        original_price: task.price,
        currency: 'TJS',
        stock: task.stock,
        reserved_stock: 0,
        sku: null,
        barcode: null,
        status: 'ACTIVE',
      };

      // [修复] 使用 adminInsert RPC 绕过 RLS 限制（anon key 无 INSERT 权限）
      const insertResult = await adminInsert(supabase, 'inventory_products', productData);
      const insertedId = insertResult?.id || (Array.isArray(insertResult) ? insertResult[0]?.id : null) || 'unknown';

      const duration = Date.now() - startTime;

      // 审计日志（使用 AI_CREATE_PRODUCT 与 AuditLogsPage 中已有的标签一致）
      await auditLog(supabase, {
        adminId: admin.id,
        action: 'AI_CREATE_PRODUCT',
        targetType: 'inventory_product',
        targetId: insertedId,
        newData: productData,
        details: {
          source: 'ai_listing',
          category: task.category,
          product_name: task.productName,
          ai_images_count: selectedImages.length,
          original_images_count: task.imageUrls.length,
          ai_model_used: 'qwen-vl-max + qwen-plus + wanx-background-generation-v2',
          generation_duration_ms: task.completedAt
            ? task.completedAt.getTime() - task.createdAt.getTime()
            : undefined,
        },
        source: 'admin_ui',
        status: 'success',
        durationMs: duration,
      });

      return insertedId;
    },
    [supabase, admin]
  );

  // ─── 从预览弹窗入库 ────────────────────────────────────────
  const handleSaveFromPreview = useCallback(
    async (editedResult: AIListingResult, selectedImages: string[]) => {
      if (!viewingTaskId) return;

      const task = tasks.find((t) => t.id === viewingTaskId);
      if (!task) return;

      setSaving(true);
      try {
        await saveTaskToInventory(task, editedResult, selectedImages);
        updateTask(viewingTaskId, { savedToInventory: true });
        setViewingTaskId(null);
        toast.success(`"${task.productName}" 已成功入库！`);
      } catch (error: any) {
        console.error('[AIListing] 入库失败:', error);
        toast.error('入库失败: ' + (error.message || '未知错误'));
      } finally {
        setSaving(false);
      }
    },
    [viewingTaskId, tasks, saveTaskToInventory, updateTask]
  );

  // ─── 批量入库 ──────────────────────────────────────────────
  const handleBatchSave = useCallback(async () => {
    const selectedTasks = tasks.filter(
      (t) => selectedIds.has(t.id) && t.result && !t.savedToInventory
    );
    if (selectedTasks.length === 0) return;

    // 构建确认信息，展示即将入库的商品名称列表
    const nameList = selectedTasks.map((t) => `  · ${t.productName}`).join('\n');
    const confirmed = window.confirm(
      `确定要将以下 ${selectedTasks.length} 个商品批量入库吗？\n\n${nameList}\n\n注意：批量入库将使用 AI 生成的默认文案和全部背景图，不会逐个编辑。`
    );
    if (!confirmed) return;

    setBatchSaving(true);
    let successCount = 0;
    let failCount = 0;
    const failedNames: string[] = [];

    for (const task of selectedTasks) {
      try {
        const result = task.result!;
        // 批量入库默认选择全部背景图
        const selectedImages = result.background_images;
        await saveTaskToInventory(task, result, selectedImages);
        updateTask(task.id, { savedToInventory: true });
        successCount++;
      } catch (error: any) {
        console.error(`[AIListing] 批量入库失败 (${task.productName}):`, error);
        failCount++;
        failedNames.push(task.productName);
      }
    }

    setBatchSaving(false);
    setSelectedIds(new Set());

    if (failCount === 0) {
      toast.success(`${successCount} 个商品全部入库成功！`);
    } else {
      toast.error(
        `入库完成：${successCount} 成功，${failCount} 失败\n失败商品：${failedNames.join('、')}`
      );
    }
  }, [tasks, selectedIds, saveTaskToInventory, updateTask]);

  // ─── 清除已完成且已入库的任务 ──────────────────────────────
  const handleClearSaved = useCallback(() => {
    const savedCount = tasks.filter((t) => t.savedToInventory).length;
    if (savedCount === 0) return;
    setTasks((prev) => prev.filter((t) => !t.savedToInventory));
    toast.success(`已清除 ${savedCount} 个已入库的任务`);
  }, [tasks]);

  // ─── 删除单个任务 ──────────────────────────────────────────
  const handleDeleteTask = useCallback((taskId: string) => {
    // 如果任务正在处理中，先中止 SSE 连接
    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(taskId);
      processingCountRef.current = Math.max(0, processingCountRef.current - 1);
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
    if (viewingTaskId === taskId) {
      setViewingTaskId(null);
    }
  }, [viewingTaskId]);

  // ─── 当前查看的任务 ────────────────────────────────────────
  const viewingTask = viewingTaskId ? tasks.find((t) => t.id === viewingTaskId) : null;

  // ─── 统计 ──────────────────────────────────────────────────
  const stats = {
    total: tasks.length,
    queued: tasks.filter((t) => t.status === 'queued').length,
    processing: tasks.filter((t) => t.status === 'processing').length,
    done: tasks.filter((t) => t.status === 'done' || t.status === 'partial').length,
    error: tasks.filter((t) => t.status === 'error').length,
    saved: tasks.filter((t) => t.savedToInventory).length,
  };

  return (
    <div className="space-y-6 pb-20">
      {/* ─── 页面标题 ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-purple-600" />
            AI 商品上架助手
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            上传商品图片，AI 自动生成三语文案和精美背景图，一键入库
          </p>
        </div>
        {stats.saved > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearSaved}
            className="text-gray-500"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            清除已入库 ({stats.saved})
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
          <StatCard label="已入库" value={stats.saved} color="text-purple-600" />
        </div>
      )}

      {/* ─── 主体：左右分栏 ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：任务创建表单 */}
        <div>
          <TaskCreationForm
            onSubmit={handleAddTask}
            disabled={batchSaving}
          />
        </div>

        {/* 右侧：任务队列 */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ListTodo className="w-5 h-5" />
                  任务队列 ({stats.total})
                </span>
                <div className="flex items-center gap-2">
                  {stats.error > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        tasks
                          .filter((t) => t.status === 'error')
                          .forEach((t) => handleRetry(t.id));
                      }}
                      className="text-xs text-orange-600"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1" />
                      全部重试
                    </Button>
                  )}
                  {stats.total > 0 && stats.total === stats.saved && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearSaved}
                      className="text-xs text-gray-500"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      清空
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>暂无任务</p>
                  <p className="text-sm mt-1">在左侧填写信息并添加到队列</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  {tasks.map((task) => (
                    <TaskProgressCard
                      key={task.id}
                      task={task}
                      isSelected={selectedIds.has(task.id)}
                      onSelect={handleSelect}
                      onViewResult={handleViewResult}
                      onRetry={handleRetry}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── 结果预览弹窗 ─────────────────────────────────── */}
      <Dialog
        open={!!viewingTask?.result}
        onOpenChange={(open) => {
          if (!open) setViewingTaskId(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewingTask?.productName} — AI 生成结果
            </DialogTitle>
          </DialogHeader>
          {viewingTask?.result && (
            <TaskResultPreview
              result={viewingTask.result}
              onSave={handleSaveFromPreview}
              onDiscard={() => setViewingTaskId(null)}
              saving={saving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ─── 批量操作栏 ───────────────────────────────────── */}
      <BatchActionBar
        selectedCount={selectedIds.size}
        completedCount={completedUnsavedTasks.length}
        allSelected={allSelected}
        onSelectAll={handleSelectAll}
        onBatchSave={handleBatchSave}
        saving={batchSaving}
      />
    </div>
  );
}

// ─── 统计小卡片 ──────────────────────────────────────────────
function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg border p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}
