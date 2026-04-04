/**
 * BatchActionBar — 批量操作工具栏
 *
 * 底部固定的批量操作区域，包含：
 *   1. 已选中任务计数
 *   2. 全选已完成任务复选框
 *   3. 批量入库按钮
 *
 * 参考 OrderShipmentPage.tsx 的批量操作 UI 模式。
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Package, Loader2 } from 'lucide-react';

interface BatchActionBarProps {
  selectedCount: number;
  completedCount: number;       // 可选中的任务总数（done/partial 且未入库）
  allSelected: boolean;
  onSelectAll: () => void;
  onBatchSave: () => void;
  saving?: boolean;
}

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedCount,
  completedCount,
  allSelected,
  onSelectAll,
  onBatchSave,
  saving = false,
}) => {
  // 没有可操作的任务时不显示
  if (completedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={onSelectAll}
            />
            <span className="text-sm text-gray-600">
              全选已完成
            </span>
          </div>
          <span className="text-sm font-medium">
            已选中 <span className="text-purple-600">{selectedCount}</span> / {completedCount} 个任务
          </span>
        </div>

        <Button
          onClick={onBatchSave}
          disabled={selectedCount === 0 || saving}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              批量入库中...
            </>
          ) : (
            <>
              <Package className="w-4 h-4 mr-2" />
              批量入库 ({selectedCount})
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
