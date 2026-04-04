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
 *   - 最多同时执行 1 个 SSE 请求（串行处理队列中的任务）
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

import { adminSSEFetch } from '@/lib/adminApi';
import { auditLog } from '@/lib/auditLogger';
import { TaskCreationForm } from '@/components/AIListing/TaskCreationForm';
import { TaskProgressCard } from '@/components/AIListing/TaskProgressCard';
import { TaskResultPreview } from '@/components/AIListing/TaskResultPreview';
import { BatchActionBar } from '@/components/AIListing/BatchActionBar';
import type { AITask, AIListingResult, SSEEventData } from '@/types/aiListing';

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || '';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-listing-generate`;
const SESSION_STORAGE_KEY = 'ai_listing_tasks';

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
  // 标记当前是否有正在执行的任务
  const isProcessingRef = useRef(false);

  // ─── 持久化到 sessionStorage ──────────────────────────────
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // 存储满时忽略
    }
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
                material_guess: data.result?.material_guess || null,
              },
            };

            updateTask(task.id, {
              status: data.status,
              progress: 100,
              stage: data.status === 'done' ? '全部完成' : '部分完成（仅文案）',
              result,
              completedAt: new Date(),
            });

            // 清理 controller
            abortControllersRef.current.delete(task.id);
            isProcessingRef.current = false;

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
            isProcessingRef.current = false;
            processNextTask();
          }
        },
        // onError
        (error: Error) => {
          updateTask(task.id, {
            status: 'error',
            progress: 0,
            stage: '连接失败',
            errorMessage: error.message,
          });

          abortControllersRef.current.delete(task.id);
          isProcessingRef.current = false;
          processNextTask();
        }
      );

      abortControllersRef.current.set(task.id, controller);
    },
    [updateTask]
  );

  // ─── 处理队列中的下一个任务 ────────────────────────────────
  const processNextTask = useCallback(() => {
    if (isProcessingRef.current) return;

    setTasks((prev) => {
      const nextTask = prev.find((t) => t.status === 'queued');
      if (nextTask) {
        isProcessingRef.current = true;
        // 使用 setTimeout 避免在 setState 回调中触发副作用
        setTimeout(() => executeTask(nextTask), 0);
      }
      return prev;
    });
  }, [executeTask]);

  // ─── 当 tasks 变化时检查是否有待处理任务 ──────────────────
  useEffect(() => {
    if (!isProcessingRef.current) {
      const hasQueued = tasks.some((t) => t.status === 'queued');
      if (hasQueued) {
        processNextTask();
      }
    }
  }, [tasks, processNextTask]);

  // ─── 添加新任务 ────────────────────────────────────────────
  const handleAddTask = useCallback((task: AITask) => {
    setTasks((prev) => [...prev, task]);
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

  // ─── 单个任务入库 ──────────────────────────────────────────
  const saveTaskToInventory = useCallback(
    async (task: AITask, editedResult: AIListingResult, selectedImages: string[]) => {
      if (!admin) throw new Error('未登录');

      // 合并图片：选中的背景图 + 原始商品图
      const allImages = [...selectedImages, ...task.imageUrls];

      const productData = {
        name: editedResult.title_zh || task.productName,
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
          ru: '',
          tg: '',
        },
        material: editedResult.analysis?.material_guess || '',
        material_i18n: {
          zh: editedResult.analysis?.material_guess || '',
          ru: '',
          tg: '',
        },
        details: editedResult.bullets_zh?.join('；') || '',
        details_i18n: {
          zh: editedResult.bullets_zh?.join('；') || '',
          ru: editedResult.bullets_ru?.join('; ') || '',
          tg: editedResult.bullets_tg?.join('; ') || '',
        },
        image_url: allImages[0] || '',
        image_urls: allImages,
        original_price: task.price,
        currency: 'TJS',
        stock: task.stock,
        status: 'ACTIVE',
      };

      const { data, error } = await supabase
        .from('inventory_products')
        .insert([productData])
        .select('id')
        .single();

      if (error) throw error;

      // 审计日志
      await auditLog(supabase, {
        adminId: admin.id,
        action: 'AI_CREATE_PRODUCT',
        targetType: 'inventory_product',
        targetId: data.id,
        newData: productData,
        details: {
          source: 'ai_listing',
          category: task.category,
          background_images_count: selectedImages.length,
          original_images_count: task.imageUrls.length,
        },
      });

      return data.id;
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
        toast.success('商品已成功入库！');
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
    const selectedTasks = tasks.filter((t) => selectedIds.has(t.id) && t.result && !t.savedToInventory);
    if (selectedTasks.length === 0) return;

    const confirmed = window.confirm(
      `确定要将 ${selectedTasks.length} 个商品批量入库吗？\n\n注意：批量入库将使用 AI 生成的默认文案和全部背景图，不会逐个编辑。`
    );
    if (!confirmed) return;

    setBatchSaving(true);
    let successCount = 0;
    let failCount = 0;

    for (const task of selectedTasks) {
      try {
        const result = task.result!;
        const selectedImages = result.background_images; // 批量入库默认选择全部背景图
        await saveTaskToInventory(task, result, selectedImages);
        updateTask(task.id, { savedToInventory: true });
        successCount++;
      } catch (error: any) {
        console.error(`[AIListing] 批量入库失败 (${task.productName}):`, error);
        failCount++;
      }
    }

    setBatchSaving(false);
    setSelectedIds(new Set());

    if (failCount === 0) {
      toast.success(`${successCount} 个商品全部入库成功！`);
    } else {
      toast.error(`入库完成：${successCount} 成功，${failCount} 失败`);
    }
  }, [tasks, selectedIds, saveTaskToInventory, updateTask]);

  // ─── 清除已完成且已入库的任务 ──────────────────────────────
  const handleClearSaved = useCallback(() => {
    setTasks((prev) => prev.filter((t) => !t.savedToInventory));
    toast.success('已清除已入库的任务');
  }, []);

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
          <TaskCreationForm onSubmit={handleAddTask} />
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
