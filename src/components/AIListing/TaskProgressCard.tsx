/**
 * TaskProgressCard — AI 任务进度卡片
 *
 * 展示单个 AI 任务的状态、进度条、阶段描述。
 * 根据不同状态显示不同的徽章颜色和操作按钮。
 *
 * [修复] 添加 processing_images 状态支持：
 *   - STATUS_CONFIG 新增 processing_images 映射
 *   - 添加海报生成进度条（已完成/总数）
 *   - processing_images 状态下可查看已完成的文案结果
 *   - 添加防御性 fallback，避免未知状态导致崩溃
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  RotateCcw,
  Package,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react';
import type { AITask, AITaskStatus } from '@/types/aiListing';

interface TaskProgressCardProps {
  task: AITask;
  isSelected: boolean;
  onSelect: (taskId: string) => void;
  onViewResult: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
}

// 状态配置映射（完整覆盖所有 AITaskStatus）
const STATUS_CONFIG: Record<
  AITaskStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  queued: {
    label: '排队中',
    color: 'bg-gray-100 text-gray-700',
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  processing: {
    label: '生成中',
    color: 'bg-blue-100 text-blue-800',
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  },
  processing_images: {
    label: '海报生成中',
    color: 'bg-purple-100 text-purple-800',
    icon: <ImageIcon className="w-3.5 h-3.5 animate-pulse" />,
  },
  done: {
    label: '已完成',
    color: 'bg-green-100 text-green-800',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  partial: {
    label: '部分完成',
    color: 'bg-yellow-100 text-yellow-800',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  error: {
    label: '失败',
    color: 'bg-red-100 text-red-800',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

// 防御性 fallback：避免未知状态导致崩溃
const FALLBACK_CONFIG = {
  label: '未知',
  color: 'bg-gray-200 text-gray-600',
  icon: <AlertTriangle className="w-3.5 h-3.5" />,
};

export const TaskProgressCard: React.FC<TaskProgressCardProps> = ({
  task,
  isSelected,
  onSelect,
  onViewResult,
  onRetry,
  onDelete,
}) => {
  const config = STATUS_CONFIG[task.status] || FALLBACK_CONFIG;
  const canSelect = ((task.status === 'done' || task.status === 'partial') || (task.status === 'error' && !!task.result)) && !task.savedToInventory;

  // 计算海报生成进度（processing_images 状态）
  const marketingImages = task.result?.marketing_images || [];
  const enqueuedCount = task.result?.enqueued_images || marketingImages.length || 0;
  const completedCount = marketingImages.filter(
    (img) => img.status === 'completed'
  ).length;
  const failedCount = marketingImages.filter(
    (img) => img.status === 'failed'
  ).length;
  const processingCount = marketingImages.filter(
    (img) => img.status === 'processing'
  ).length;

  return (
    <Card className={`transition-all ${isSelected ? 'ring-2 ring-purple-500' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* 复选框（仅已完成且未入库的任务可选） */}
          <div className="pt-1">
            {canSelect ? (
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onSelect(task.id)}
              />
            ) : (
              <div className="w-4 h-4" /> // 占位
            )}
          </div>

          {/* 主体内容 */}
          <div className="flex-1 min-w-0">
            {/* 第一行：商品名 + 状态徽章 */}
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-medium text-sm truncate">{task.productName}</h4>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${config.color}`}>
                {config.icon}
                {config.label}
              </span>
            </div>

            {/* 第二行：品类 + 时间 */}
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
              <span>{task.category}</span>
              <span>·</span>
              <span>{task.price} TJS</span>
              <span>·</span>
              <span>{(() => {
                try {
                  const d = task.createdAt instanceof Date ? task.createdAt : new Date(task.createdAt as any);
                  return isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                } catch { return '--:--'; }
              })()}</span>
            </div>

            {/* 进度条（processing 状态） */}
            {task.status === 'processing' && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                  <span>{task.stage}</span>
                  <span>{task.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* 海报生成进度（processing_images 状态） */}
            {task.status === 'processing_images' && enqueuedCount > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                  <span>
                    {task.stage || `后台海报生成中（${completedCount}/${enqueuedCount}）`}
                  </span>
                  <span className="text-purple-600 font-medium">
                    {completedCount}/{enqueuedCount}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${enqueuedCount > 0 ? (completedCount / enqueuedCount) * 100 : 0}%` }}
                  />
                </div>
                {/* 详细状态 */}
                <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
                  {completedCount > 0 && (
                    <span className="text-green-600">{completedCount} 已完成</span>
                  )}
                  {processingCount > 0 && (
                    <span className="text-blue-600">{processingCount} 生成中</span>
                  )}
                  {failedCount > 0 && (
                    <span className="text-red-500">{failedCount} 失败</span>
                  )}
                </div>
              </div>
            )}

            {/* processing_images 但无 enqueued 信息时的简单提示 */}
            {task.status === 'processing_images' && enqueuedCount === 0 && (
              <div className="mt-2 text-xs text-purple-600">
                {task.stage || '文案已完成，后台正在生成营销海报...'}
              </div>
            )}

            {/* 错误信息（error 状态） */}
            {task.status === 'error' && task.errorMessage && (
              <p className={`mt-2 text-xs rounded p-2 ${task.result ? 'text-orange-600 bg-orange-50' : 'text-red-600 bg-red-50'}`}>
                {task.result ? '⚠️ ' : ''}{task.errorMessage}
                {task.result && <span className="block mt-1 text-green-700">已有部分结果可用，点击"查看结果"使用</span>}
              </p>
            )}

            {/* 已入库标记 */}
            {task.savedToInventory && (
              <div className="mt-2 inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                <Package className="w-3 h-3" />
                已入库
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2 mt-3">
              {/* done / partial / processing_images 都可以查看结果 */}
              {(task.status === 'done' || task.status === 'partial' || task.status === 'processing_images' || (task.status === 'error' && task.result)) && task.result && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewResult(task.id)}
                  className="text-xs"
                >
                  <Eye className="w-3.5 h-3.5 mr-1" />
                  {task.status === 'processing_images' ? '查看文案' : '查看结果'}
                </Button>
              )}
              {task.status === 'error' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRetry(task.id)}
                  className="text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  重试
                </Button>
              )}
              {/* 删除按钮：所有状态均可删除（已入库除外） */}
              {onDelete && !task.savedToInventory && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(task.id)}
                  className="text-xs text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
