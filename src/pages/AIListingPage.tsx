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
 * [修复 v3.0] 任务持久化改造：
 *   - 使用 localStorage 替代 sessionStorage（跨 tab 持久，切换页面不丢失）
 *   - 恢复时 processing 状态的任务自动重新排队执行
 *   - 已完成的任务始终保留在列表中，随时可查看结果
 *   - processing 超时从 15 分钟降为 5 分钟（匹配 Edge Function 150s 限制）
 *   - processing_images 超时从 60 分钟降为 30 分钟
 *   - 增强卡死任务检测和自动恢复机制
 *
 * 状态管理：
 *   - tasks: AITask[] — 所有任务列表（localStorage 持久化）
 *   - selectedIds: Set<string> — 批量选中的任务 ID
 *   - viewingTaskId: string | null — 当前查看结果的任务 ID
 *   - abortControllers: Map<string, AbortController> — SSE 连接管理
 *
 * 并发控制：
 *   - 最多同时执行 2 个 SSE 请求（考虑万相 API 的 2QPS 限制）
 *   - 超出的任务处于排队状态，前面的任务完成后自动触发
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

import { adminSSEFetch, adminInsert, adminDelete, adminQuery, adminUpdate } from '@/lib/adminApi';
import { auditLog } from '@/lib/auditLogger';
import { TaskCreationForm } from '@/components/AIListing/TaskCreationForm';
import { TaskProgressCard } from '@/components/AIListing/TaskProgressCard';
import { TaskResultPreview } from '@/components/AIListing/TaskResultPreview';
import { BatchActionBar } from '@/components/AIListing/BatchActionBar';
import type { AITask, AIListingResult, SSEEventData } from '@/types/aiListing';

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || '';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-listing-generate`;
// [修复] 使用 localStorage 替代 sessionStorage
const STORAGE_KEY = 'ai_listing_tasks';
const MAX_CONCURRENT = 2; // 最多同时处理 2 个任务
const DB_POLL_INTERVAL = 5000;
// [修复 v3.0] 区分两种超时：
//   - processing 阶段（Edge Function 最多 150s，加缓冲给 5 分钟）
//   - processing_images 阶段（后台 cron 异步海报生成）：30 分钟
const TASK_TIMEOUT_MS = 5 * 60 * 1000;
const IMAGE_TASK_TIMEOUT_MS = 30 * 60 * 1000;

// ============================================================
// 主组件
// ============================================================

export default function AIListingPage() {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();

  // ─── 核心状态 ──────────────────────────────────────────────
  // [修复] 使用 localStorage 替代 sessionStorage
  const [tasks, setTasks] = useState<AITask[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as any[];
        return parsed.map((t: any) => {
          const hasServerTask = !!t.taskId;
          const shouldRecoverProcessing = t.status === 'processing' && hasServerTask;
          const shouldRecoverImages = t.status === 'processing_images' && hasServerTask;
          const shouldRequeue = t.status === 'processing' && !hasServerTask;

          return {
            ...t,
            createdAt: new Date(t.createdAt),
            completedAt: t.completedAt ? new Date(t.completedAt) : undefined,
            status: shouldRecoverProcessing
              ? 'processing'
              : (shouldRecoverImages ? 'processing_images' : (shouldRequeue ? 'queued' : t.status)),
            progress: (shouldRecoverProcessing || shouldRecoverImages)
              ? (t.progress || 0)
              : (shouldRequeue ? 0 : t.progress),
            stage: shouldRecoverProcessing
              ? '正在从服务器恢复任务状态...'
              : (shouldRecoverImages
                  ? '正在从服务器恢复海报生成状态...'
                  : (shouldRequeue ? '排队中（自动恢复）...' : t.stage)),
          };
        });
      }
    } catch {
      // 解析失败忽略
    }
    return [];
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewTask, setPreviewTask] = useState<{
    id: string;
    productName: string;
    result: AIListingResult;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);

  // SSE 连接管理
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  // 当前正在处理的任务数量
  const processingCountRef = useRef(0);
  // 使用 ref 持有最新任务，避免 SSE 回调闭包陈旧
  const tasksRef = useRef<AITask[]>(tasks);
  // 标记是否已收到当前任务的 SSE 终态（done / partial / processing_images / error）
  const taskReceivedFinalEventRef = useRef<Set<string>>(new Set());
  // 标记当前是否仍占用并发槽位，避免重复释放导致计数异常
  const activeExecutionIdsRef = useRef<Set<string>>(new Set());
  // SSE 中断后使用 DB 轮询恢复任务状态
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // [修复 v3.1] Realtime channel 管理：避免频繁重建 channel 导致 DOM 崩溃
  const realtimeChannelRef = useRef<any>(null);
  const watchingParentTaskIdsRef = useRef<Set<string>>(new Set());
  const realtimeReconnectCountRef = useRef(0); // Realtime 重连计数
  const realtimeAlertShownRef = useRef(false); // Realtime 告警是否已显示

  // 错误日志节流
  const lastImgQueryErrorRef = useRef<{msg: string; time: number; count: number}>({msg: '', time: 0, count: 0});
  const lastPollErrorRef = useRef<{msg: string; time: number; count: number}>({msg: '', time: 0, count: 0});

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // ─── [修复] 持久化到 localStorage ─────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // 存储满时忽略
    }
  }, [tasks]);

  // ─── beforeunload 事件拦截 ────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsaved = tasks.some(
        (t) => ((t.status === 'done' || t.status === 'partial') || (t.status === 'error' && !!t.result)) && !t.savedToInventory
      );
      const hasProcessing = tasks.some(
        (t) => t.status === 'processing' || t.status === 'processing_images' || t.status === 'queued'
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

    // ─── 组件卸载时中止所有 SSE 连接 ─────────────────────
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

  // ─── v2.0: 订阅 ai_image_tasks 表的 Realtime 变更 ─────────────────────
  //   将后台陆续生成的营销海报实时推入对应任务的 marketing_images
  //   完成条件：任务下的所有行均 completed/failed → status 升级为 done
  //
  // [修复 v3.1] 不再将 tasks 放入 deps，改用 ref 对比 watchingIds 是否变化，
  //   避免每次 tasks 变化都销毁/重建 channel 导致 React DOM 崩溃。
  useEffect(() => {
    if (!supabase) {return;}
    // 收集当前需要监听的 parent_task_id
    const currentWatchingIds = new Set<string>();
    tasksRef.current.forEach((t) => {
      const pid = t.result?.parent_task_id;
      if (pid && (t.status === 'processing_images' || t.status === 'done' || t.status === 'partial')) {
        currentWatchingIds.add(pid);
      }
    });
    // 只在 watchingIds 集合真正变化时才重新订阅
    const oldSerialized = JSON.stringify(Array.from(watchingParentTaskIdsRef.current).sort());
    const newSerialized = JSON.stringify(Array.from(currentWatchingIds).sort());
    if (oldSerialized === newSerialized) {return;}
    // 清理旧 channel
    if (realtimeChannelRef.current) {
      try { supabase.removeChannel(realtimeChannelRef.current); } catch { /* ignore */ }
      realtimeChannelRef.current = null;
    }
    watchingParentTaskIdsRef.current = currentWatchingIds;
    if (currentWatchingIds.size === 0) {return;}
    realtimeChannelRef.current = supabase
      .channel(`ai_image_tasks_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ai_image_tasks' },
        (payload: any) => {
          const row = payload?.new;
          if (!row || !row.parent_task_id || !watchingParentTaskIdsRef.current.has(row.parent_task_id)) {return;}
          setTasks((prev) => prev.map((tk) => {
            if (tk.result?.parent_task_id !== row.parent_task_id) {return tk;}
            const prevImgs = tk.result?.marketing_images ? [...tk.result.marketing_images] : [];
            const idx = prevImgs.findIndex(
              (m) => m.id === row.id || m.display_order === row.display_order
            );
            const updatedItem = {
              id: row.id,
              url: row.marketing_image_url || '',
              ru_caption: row.ru_caption,
              display_order: row.display_order ?? 0,
              status: row.status as 'pending' | 'processing' | 'completed' | 'failed',
            };
            if (idx >= 0) {prevImgs[idx] = updatedItem;} else {prevImgs.push(updatedItem);}
            prevImgs.sort((a, b) => a.display_order - b.display_order);
            const enqueued = tk.result?.enqueued_images || prevImgs.length;
            const terminalCount = prevImgs.filter(
              (m) => m.status === 'completed' || m.status === 'failed'
            ).length;
            const allDone = terminalCount >= enqueued && enqueued > 0;
            const nextStatus: AITask['status'] = allDone
              ? (prevImgs.some((m) => m.status === 'completed') ? 'done' : 'partial')
              : 'processing_images';
            return {
              ...tk,
              status: nextStatus,
              stage: allDone
                ? (nextStatus === 'done' ? '全部完成' : '部分完成')
                : `后台海报生成中（${
                    prevImgs.filter((m) => m.status === 'completed').length
                  }/${enqueued}）…`,
              completedAt: allDone ? new Date() : tk.completedAt,
              result: tk.result
                ? { ...tk.result, marketing_images: prevImgs }
                : tk.result,
            };
          }));
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          realtimeReconnectCountRef.current = 0;
          realtimeAlertShownRef.current = false;
          console.log('[AIListing] Realtime channel SUBSCRIBED.');
        } else if (status === 'CHANNEL_ERROR') {
          realtimeReconnectCountRef.current++;
          console.warn(`[AIListing] Realtime channel ERROR: ${err?.message}. Reconnect count: ${realtimeReconnectCountRef.current}`);
          if (realtimeReconnectCountRef.current > 5 && !realtimeAlertShownRef.current) {
            toast.error('Realtime 连接不稳定，海报进度可能延迟', { duration: 5000 });
            realtimeAlertShownRef.current = true;
          }
        } else if (status === 'TIMED_OUT') {
          console.error('[AIListing] Realtime channel TIMED_OUT. Connection might be lost.');
        }
      });
    return () => {
      if (realtimeChannelRef.current) {
        try { supabase.removeChannel(realtimeChannelRef.current); } catch { /* ignore */ }
        realtimeChannelRef.current = null;
      }
    };
  });  // [修复 v3.1] 无 deps — 每次 render 检查 watchingIds 是否变化，内部自行决定是否重建

  // ─── 更新单个任务 ──────────────────────────────────────────
  const updateTask = useCallback((taskId: string, updates: Partial<AITask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
    );
  }, []);

  const normalizeListingResult = useCallback((raw: any): AIListingResult => {
    const enqueued = raw?.enqueued_images || 0;
    const initialMarketingImages: NonNullable<AIListingResult['marketing_images']> =
      Array.isArray(raw?.marketing_images) && raw?.marketing_images.length > 0
        ? raw.marketing_images
        : Array.from({ length: enqueued }, (_, i) => ({
            id: `placeholder-${i}`,
            url: '',
            display_order: i,
            status: 'pending' as const,
          }));

    return {
      title_ru: raw?.title_ru || '',
      title_zh: raw?.title_zh || '',
      title_tg: raw?.title_tg || '',
      bullets_ru: raw?.bullets_ru || [],
      bullets_zh: raw?.bullets_zh || [],
      bullets_tg: raw?.bullets_tg || [],
      description_ru: raw?.description_ru || '',
      description_zh: raw?.description_zh || '',
      description_tg: raw?.description_tg || '',
      background_images: raw?.background_images || [],
      marketing_images: initialMarketingImages,
      parent_task_id: raw?.parent_task_id || null,
      enqueued_images: enqueued,
      segmented_image: raw?.segmented_image || null,
      original_images: raw?.original_images || [],
      analysis: {
        product_type: raw?.analysis?.product_type,
        main_color: raw?.analysis?.main_color,
        material_guess: raw?.material_guess || raw?.analysis?.material_guess || null,
        key_features: raw?.analysis?.key_features,
        use_scenes: raw?.analysis?.use_scenes,
        target_audience: raw?.analysis?.target_audience,
        selling_points: raw?.analysis?.selling_points,
        ai_understanding: raw?.analysis?.ai_understanding || undefined,
      },
    };
  }, []);

  // [修复 v3.1] 安全的 Date 转换辅助函数
  const ensureDate = useCallback((val: any): Date => {
    if (val instanceof Date && !isNaN(val.getTime())) return val;
    if (val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date(); // fallback to now
  }, []);

  useEffect(() => {
    const now = Date.now();
    // [修复] 轮询判断逻辑优化：
    //   - processing 状态：无 SSE 连接或超时 15 分钟时需要轮询
    //   - processing_images 状态：始终需要轮询（后台 cron 异步处理，不依赖 SSE），仅在超过 60 分钟时超时
    const needsPoll = tasks.some((t) => {
      if (!t.taskId) return false;
      if (t.status === 'processing_images') {
        // processing_images 始终需要轮询来检查后台海报进度
        return true;
      }
      if (t.status === 'processing') {
        const noSSE = !abortControllersRef.current.has(t.id);
        const timedOut = (now - new Date(t.createdAt).getTime()) > TASK_TIMEOUT_MS;
        return noSSE || timedOut;
      }
      return false;
    });

    if (!needsPoll) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    if (!pollTimerRef.current) {
      const pollFn = async () => {
        const currentTasks = tasksRef.current;
        const now2 = Date.now();
        const pollCandidates = currentTasks.filter((t) => {
          if (!t.taskId) return false;
          if (t.status === 'processing_images') return true;
          if (t.status === 'processing') {
            const noSSE = !abortControllersRef.current.has(t.id);
            const timedOut = (now2 - new Date(t.createdAt).getTime()) > TASK_TIMEOUT_MS;
            return noSSE || timedOut;
          }
          return false;
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
            const dbTasks = await adminQuery<any>(supabase, 'ai_listing_generation_tasks', {
              select: 'id, status, result_payload, error_message, completed_at, created_at',
              filters: [{ col: 'id', op: 'eq', val: task.taskId! }],
              limit: 1,
            });

            if (!dbTasks || dbTasks.length === 0) continue;

            const dbTask = dbTasks[0];
            if (dbTask.status === 'done' || dbTask.status === 'partial') {
              updateTask(task.id, {
                status: dbTask.status,
                progress: 100,
                stage: dbTask.status === 'done' ? '全部完成' : '部分完成（仅文案）',
                result: normalizeListingResult(dbTask.result_payload || {}),
                completedAt: dbTask.completed_at ? new Date(dbTask.completed_at) : new Date(),
              });
              if (activeExecutionIdsRef.current.has(task.id)) {
                activeExecutionIdsRef.current.delete(task.id);
                abortControllersRef.current.delete(task.id);
                processingCountRef.current = Math.max(0, processingCountRef.current - 1);
              }
              toast.success(`"${task.productName}" AI 生成完成！`);
              continue;
            }

            if (dbTask.status === 'processing_images') {
              // [修复] 从 ai_image_tasks 表查询实时海报进度（而不仅依赖父任务的 result_payload）
              const recoveredResult = normalizeListingResult(dbTask.result_payload || {});
              let recoveredImages = recoveredResult.marketing_images || [];
              let completedCount = recoveredImages.filter((img) => img.status === 'completed').length;
              let totalCount = recoveredResult.enqueued_images || recoveredImages.length || 0;

              // 尝试直接查询 ai_image_tasks 获取最新状态
              try {
                const imgTasks = await adminQuery<any>(supabase, 'ai_image_tasks', {
                  select: 'id, status, marketing_image_url, ru_caption, display_order, error_message',
                  filters: [{ col: 'parent_task_id', op: 'eq', val: task.taskId! }],
                  orderBy: 'display_order',
                  orderAsc: true,
                });
                if (imgTasks && imgTasks.length > 0) {
                  recoveredImages = imgTasks.map((row: any) => ({
                    id: row.id,
                    url: row.marketing_image_url || '',
                    ru_caption: row.ru_caption,
                    display_order: row.display_order ?? 0,
                    status: row.status as 'pending' | 'processing' | 'completed' | 'failed',
                  }));
                  completedCount = recoveredImages.filter((img) => img.status === 'completed').length;
                  const failedCount = recoveredImages.filter((img) => img.status === 'failed').length;
                  totalCount = imgTasks.length;
                  const terminalCount = completedCount + failedCount;

                  // 检查是否所有子任务都已终态
                  if (terminalCount >= totalCount && totalCount > 0) {
                    const finalStatus = completedCount > 0 ? 'done' : 'partial';
                    updateTask(task.id, {
                      status: finalStatus as any,
                      progress: 100,
                      stage: finalStatus === 'done' ? '全部完成' : '部分完成',
                      result: { ...recoveredResult, marketing_images: recoveredImages },
                      completedAt: new Date(),
                    });
                    if (activeExecutionIdsRef.current.has(task.id)) {
                      activeExecutionIdsRef.current.delete(task.id);
                      abortControllersRef.current.delete(task.id);
                      processingCountRef.current = Math.max(0, processingCountRef.current - 1);
                    }
                    toast.success(`"${task.productName}" AI 生成完成！`);
                    continue;
                  }
                }
              } catch (imgQueryErr: any) {
                const now3 = Date.now();
                const lastError = lastImgQueryErrorRef.current;
                const errorMessage = imgQueryErr.message || String(imgQueryErr);

                if (errorMessage === lastError.msg && (now3 - lastError.time < 30000)) {
                  lastError.count++;
                } else {
                  if (lastError.count > 0) {
                    console.warn(`[AIListing] 查询 ai_image_tasks 失败（已抑制 ${lastError.count} 次相同错误），使用父任务数据: ${lastError.msg}`);
                  }
                  console.warn(`[AIListing] 查询 ai_image_tasks 失败，使用父任务数据: ${errorMessage}`);
                  lastImgQueryErrorRef.current = { msg: errorMessage, time: now3, count: 0 };
                }
              }

              updateTask(task.id, {
                status: 'processing_images',
                progress: 100,
                stage: totalCount > 0
                  ? `文案完成，后台海报生成中（${completedCount}/${totalCount}）…`
                  : '文案完成，后台营销海报生成中…',
                result: { ...recoveredResult, marketing_images: recoveredImages },
              });
              if (activeExecutionIdsRef.current.has(task.id)) {
                activeExecutionIdsRef.current.delete(task.id);
                abortControllersRef.current.delete(task.id);
                processingCountRef.current = Math.max(0, processingCountRef.current - 1);
              }

              // [修复] processing_images 状态使用独立的 60 分钟超时
              const imageTaskAge = now2 - new Date(dbTask.created_at || task.createdAt).getTime();
              if (imageTaskAge > IMAGE_TASK_TIMEOUT_MS) {
                // [修复] 超时时根据已有结果智能判定状态，而非一律标记 error
                const hasResult = !!recoveredResult?.title_ru;
                const timeoutStatus = completedCount > 0 ? 'done' : (hasResult ? 'partial' : 'error');
                const timeoutStage = completedCount > 0
                  ? `已完成（${completedCount}/${totalCount} 张海报，其余超时）`
                  : (hasResult ? '部分完成（仅文案，海报生成超时）' : '海报生成超时');
                updateTask(task.id, {
                  status: timeoutStatus as any,
                  progress: timeoutStatus === 'error' ? 0 : 100,
                  stage: timeoutStage,
                  errorMessage: `后台海报生成超时（超过 30 分钟），已完成 ${completedCount}/${totalCount} 张`,
                  completedAt: new Date(),
                  result: recoveredResult ? { ...recoveredResult, marketing_images: recoveredImages } : undefined,
                });
                if (timeoutStatus === 'error') {
                  toast.error(`"${task.productName}" 海报生成超时`);
                } else {
                  toast(`"${task.productName}" 海报生成超时，但已有部分结果可用`, { icon: '⚠️' });
                }
              }
              continue;
            }

            if (dbTask.status === 'error') {
              // [修复] 如果数据库标记 error 但已有文案结果，标记为 partial 而非 error
              const hasPartialResult = dbTask.result_payload?.title_ru;
              if (hasPartialResult) {
                const partialResult = normalizeListingResult(dbTask.result_payload);
                updateTask(task.id, {
                  status: 'partial',
                  progress: 100,
                  stage: '部分完成（生成过程中出错，但文案可用）',
                  errorMessage: dbTask.error_message || undefined,
                  result: partialResult,
                  completedAt: dbTask.completed_at ? new Date(dbTask.completed_at) : new Date(),
                });
              } else {
                updateTask(task.id, {
                  status: 'error',
                  progress: 0,
                  stage: '生成失败',
                  errorMessage: dbTask.error_message || '未知错误',
                  completedAt: dbTask.completed_at ? new Date(dbTask.completed_at) : new Date(),
                });
              }
              if (activeExecutionIdsRef.current.has(task.id)) {
                activeExecutionIdsRef.current.delete(task.id);
                abortControllersRef.current.delete(task.id);
                processingCountRef.current = Math.max(0, processingCountRef.current - 1);
              }
              toast.error(`"${task.productName}" 生成失败`);
              continue;
            }

            if (dbTask.status === 'processing') {
              const taskAge = now2 - new Date(dbTask.created_at || task.createdAt).getTime();
              if (taskAge > TASK_TIMEOUT_MS) {
                try {
                  await adminUpdate(supabase, 'ai_listing_generation_tasks', {
                    status: 'error',
                    error_message: '任务超时（超过5分钟未完成，可能 Edge Function 被平台强制终止）',
                    completed_at: new Date().toISOString(),
                  }, [
                    { col: 'id', op: 'eq', val: task.taskId! },
                  ]);
                } catch (persistError) {
                  console.error('[AIListing] 更新超时任务状态失败:', persistError);
                }

                updateTask(task.id, {
                  status: 'error',
                  progress: 0,
                  stage: '生成超时',
                  errorMessage: '任务超时（超过5分钟未完成），请重新尝试',
                });
                if (activeExecutionIdsRef.current.has(task.id)) {
                  activeExecutionIdsRef.current.delete(task.id);
                  abortControllersRef.current.delete(task.id);
                  processingCountRef.current = Math.max(0, processingCountRef.current - 1);
                }
                toast.error(`"${task.productName}" 生成超时，请重试`);
              }
            }
          }
        } catch (error: any) {
          const now3 = Date.now();
          const lastError = lastPollErrorRef.current;
          const errorMessage = error.message || String(error);

          if (errorMessage === lastError.msg && (now3 - lastError.time < 30000)) {
            lastError.count++;
          } else {
            if (lastError.count > 0) {
              console.error(`[AIListing] DB 轮询失败（已抑制 ${lastError.count} 次相同错误）: ${lastError.msg}`);
            }
            console.error('[AIListing] DB 轮询失败:', error);
            lastPollErrorRef.current = { msg: errorMessage, time: now3, count: 0 };
          }
        }
      };

      pollTimerRef.current = setInterval(pollFn, DB_POLL_INTERVAL);
      pollFn();
    }

    return () => {
      // 由上方定时器统一管理生命周期
    };
  }, [tasks, supabase, normalizeListingResult, updateTask]);

  const finalizeTaskExecution = useCallback((taskId: string) => {
    if (!activeExecutionIdsRef.current.has(taskId)) {
      return;
    }

    activeExecutionIdsRef.current.delete(taskId);
    abortControllersRef.current.delete(taskId);
    processingCountRef.current = Math.max(0, processingCountRef.current - 1);
  }, []);

  // ─── SSE 执行单个任务 ──────────────────────────────────────
  const executeTask = useCallback(
    (task: AITask) => {
      taskReceivedFinalEventRef.current.delete(task.id);
      activeExecutionIdsRef.current.add(task.id);

      updateTask(task.id, {
        status: 'processing',
        progress: 5,
        stage: '正在连接 AI 服务...',
        errorMessage: undefined,
        taskId: undefined,
        result: undefined,
        savedToInventory: false,
        completedAt: undefined,
        createdAt: new Date(),
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
            const updates: Partial<AITask> = {
              status: 'processing',
              progress: data.progress || 0,
              stage: data.stage || '处理中...',
            };
            if (data.task_id) {
              updates.taskId = data.task_id;
            }
            updateTask(task.id, updates);
            return;
          }

          if (
            data.status === 'done' ||
            data.status === 'partial' ||
            data.status === 'processing_images'
          ) {
            taskReceivedFinalEventRef.current.add(task.id);

            const result = normalizeListingResult(data.result || {});
            const enqueued = result.enqueued_images || 0;
            const isImageProcessing = data.status === 'processing_images';
            updateTask(task.id, {
              status: isImageProcessing ? 'processing_images' : (data.status as any),
              progress: 100,
              stage: isImageProcessing
                ? `文案完成，正在后台生成 ${enqueued} 张俄文营销海报…`
                : (data.status === 'done' ? '全部完成' : '部分完成（仅文案）'),
              result,
              taskId: data.task_id,
              completedAt: isImageProcessing ? undefined : new Date(),
            });

            finalizeTaskExecution(task.id);
            processNextTask();

            if (data.status === 'done') {
              toast.success(`"${task.productName}" AI 生成完成！`);
            } else if (data.status === 'partial') {
              toast(`"${task.productName}" 部分完成`, { icon: '⚠️' });
            } else {
              toast.success(`"${task.productName}" 文案已完成，后台海报正在继续生成`);
            }
            return;
          }

          if (data.status === 'error') {
            taskReceivedFinalEventRef.current.add(task.id);
            // [修复] SSE 返回 error 时，检查是否已有部分结果（如文案）
            const currentTaskState = tasksRef.current.find((t) => t.id === task.id);
            const existingResult = currentTaskState?.result;
            const hasPartialResult = existingResult?.title_ru || data.result?.title_ru;
            if (hasPartialResult) {
              const partialResult = data.result
                ? normalizeListingResult(data.result)
                : existingResult;
              updateTask(task.id, {
                status: 'partial',
                progress: 100,
                stage: '部分完成（生成过程中出错，但已有结果可用）',
                errorMessage: data.error || '部分步骤失败',
                result: partialResult,
                taskId: data.task_id,
              });
            } else {
              updateTask(task.id, {
                status: 'error',
                progress: 0,
                stage: '生成失败',
                errorMessage: data.error || '未知错误',
                taskId: data.task_id,
              });
            }

            finalizeTaskExecution(task.id);
            processNextTask();
            toast.error(`"${task.productName}" 生成失败`);
          }
        },
        // onError
        (error: Error) => {
          const currentTask = tasksRef.current.find((t) => t.id === task.id);

          if (currentTask?.result?.parent_task_id || currentTask?.status === 'processing_images') {
            updateTask(task.id, {
              status: 'processing_images',
              progress: 100,
              stage: 'SSE 连接中断，后台海报仍在生成中…',
            });
          } else if (currentTask?.taskId) {
            updateTask(task.id, {
              status: 'processing',
              stage: '连接中断，正在从服务器恢复结果...',
            });
          } else {
            updateTask(task.id, {
              status: 'error',
              progress: 0,
              stage: '连接失败',
              errorMessage: error.message || '网络连接中断，请重试',
            });
            toast.error(`"${task.productName}" 连接失败`);
          }

          finalizeTaskExecution(task.id);
          processNextTask();
        },
        // onStreamEnd
        () => {
          const currentTask = tasksRef.current.find((t) => t.id === task.id);
          const receivedFinal = taskReceivedFinalEventRef.current.has(task.id);

          finalizeTaskExecution(task.id);
          processNextTask();

          if (receivedFinal) {
            return;
          }

          if (currentTask?.result?.parent_task_id || currentTask?.status === 'processing_images') {
            updateTask(task.id, {
              status: 'processing_images',
              progress: 100,
              stage: '连接已关闭，后台海报仍在生成中，等待实时回传…',
            });
            return;
          }

          if (currentTask?.taskId) {
            updateTask(task.id, {
              status: 'processing',
              stage: 'SSE 连接已关闭，正在从服务器查询结果...',
            });
            return;
          }

          updateTask(task.id, {
            status: 'error',
            progress: 0,
            stage: '生成失败',
            errorMessage: '服务器连接已关闭但未返回结果，请重试',
          });
          toast.error(`"${task.productName}" 未收到最终结果，请重试`);
        }
      );

      abortControllersRef.current.set(task.id, controller);
    },
    [updateTask, finalizeTaskExecution, normalizeListingResult]
  );

  // ─── 处理队列中的下一个任务（支持 2 并发） ─────────────────

  const processNextTask = useCallback(() => {
    // 如果已达到最大并发数，不启动新任务
    if (processingCountRef.current >= MAX_CONCURRENT) return;

    setTasks((prev) => {
      const queuedTasks = prev.filter((t) => t.status === 'queued' && !activeExecutionIdsRef.current.has(t.id));
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
      taskId: undefined,
      result: undefined,
      completedAt: undefined,
      savedToInventory: false,
      createdAt: new Date(),
    });
  }, [updateTask]);

  // ─── 查看结果 ──────────────────────────────────────────────
  const handleViewResult = useCallback((taskId: string) => {
    const task = tasksRef.current.find((t) => t.id === taskId);
    if (!task?.result) {
      toast.error('该任务暂无可查看结果');
      return;
    }

    // 使用快照驱动弹窗，避免任务列表后续重渲染直接改写 Dialog 子树，
    // 从而降低 React 19 + Radix Portal 在卸载阶段触发 removeChild 的概率。
    setPreviewTask({
      id: task.id,
      productName: task.productName,
      result: task.result,
    });
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

  // ─── 已完成但未入库的任务列表 ─────────────────────────────
  const completedUnsavedTasks = tasks.filter(
    (t) => ((t.status === 'done' || t.status === 'partial') || (t.status === 'error' && !!t.result)) && !t.savedToInventory
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
        // [修复] 将 image_urls 转为 PostgreSQL text[] 字面量字符串
        image_urls: `{${allImages.map(u => `"${u.replace(/"/g, '\\"')}"`).join(',')}}`,
        original_price: task.price,
        currency: 'TJS',
        stock: task.stock,
        reserved_stock: 0,
        sku: null,
        barcode: null,
        status: 'ACTIVE',
        // 新增：保存 AI 商品理解数据（直接使用 Edge Function 返回的完整数据，不再覆盖元数据）
        ai_understanding: editedResult.analysis?.ai_understanding || null,
      };

      // [修复] 使用 adminInsert RPC 绕过 RLS 限制
      const insertResult = await adminInsert(supabase, 'inventory_products', productData);
      const insertedId = insertResult?.id || (Array.isArray(insertResult) ? insertResult[0]?.id : null) || 'unknown';

      // [v2.1] 创建 product_categories 关联（如果有分类 ID）
      if (task.categoryId && insertedId !== 'unknown') {
        try {
          await adminInsert(supabase, 'product_categories', {
            product_id: insertedId,
            category_id: task.categoryId,
          });
          console.log(`[AIListing] 已创建 product_categories 关联: product=${insertedId}, category=${task.categoryId}`);
        } catch (catErr: any) {
          // 分类关联失败不影响主流程，仅记录警告
          console.warn('[AIListing] 创建 product_categories 关联失败:', catErr.message);
        }
      }

      const duration = Date.now() - startTime;

      // 审计日志
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
          ai_model_used: (task.result?.analysis?.ai_understanding?.model_used || 'qwen3.6-plus(fallback)') + ' + wanx-background-generation-v2',
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
      if (!previewTask) return;

      const previewTaskId = previewTask.id;
      const task = tasks.find((t) => t.id === previewTaskId);
      if (!task) return;

      setSaving(true);
      try {
        await saveTaskToInventory(task, editedResult, selectedImages);

        // 先关闭 Dialog，再延迟更新任务状态，避免 React 列表重渲染与 Radix Portal 卸载竞争
        // 导致 removeChild / insertBefore 一类 DOM 异常。
        setPreviewTask(null);
        toast.success(`"${task.productName}" 已成功入库！`);

        requestAnimationFrame(() => {
          setTimeout(() => {
            updateTask(previewTaskId, { savedToInventory: true });
          }, 300);
        });
      } catch (error: any) {
        console.error('[AIListing] 入库失败:', error);
        toast.error('入库失败: ' + (error.message || '未知错误'));
      } finally {
        setSaving(false);
      }
    },
    [previewTask, tasks, saveTaskToInventory, updateTask]
  );

  // ─── 批量入库 ──────────────────────────────────────────────
  const handleBatchSave = useCallback(async () => {
    const selectedTasks = tasks.filter(
      (t) => selectedIds.has(t.id) && t.result && !t.savedToInventory
    );
    if (selectedTasks.length === 0) return;

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
    if (previewTask?.id === taskId) {
      setPreviewTask(null);
    }
  }, [previewTask]);

  // ─── 统计 ──────────────────────────────────────────────────
  const stats = {
    total: tasks.length,
    queued: tasks.filter((t) => t.status === 'queued').length,
    processing: tasks.filter((t) => t.status === 'processing' || t.status === 'processing_images').length,
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
                      onDelete={handleDeleteTask}
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
        open={!!previewTask}
        onOpenChange={(open) => {
          if (!open) setPreviewTask(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {previewTask?.productName} — AI 生成结果
            </DialogTitle>
          </DialogHeader>
          {previewTask?.result && (
            <TaskResultPreview
              result={previewTask.result}
              onSave={handleSaveFromPreview}
              onDiscard={() => setPreviewTask(null)}
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