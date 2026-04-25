import React, { useState, useEffect, useCallback } from 'react';
import {
  Package, RefreshCw, AlertCircle, CheckCircle2, Clock, XCircle,
  ChevronDown, ChevronUp, Loader2, RotateCcw, Ban, Eye, ArrowLeft,
  Upload, Zap, BarChart3
} from 'lucide-react';
import { useSupabase } from '@/contexts/SupabaseContext';
import { adminQuery, adminUpdate } from '@/lib/adminApi';
import toast from 'react-hot-toast';

// ============================================================
// 类型定义
// ============================================================
interface BatchTask {
  id: string;
  admin_id: string | null;
  batch_name: string;
  total_items: number;
  processed_items: number;
  success_items: number;
  error_items: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  default_category_id: string | null;
  default_price: number | null;
  default_stock: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface BatchItem {
  id: string;
  batch_id: string;
  image_urls: string[];
  category_id: string | null;
  product_name: string | null;
  price: number | null;
  stock: number | null;
  specs: string | null;
  status: string;
  inventory_product_id: string | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// 状态配置
// ============================================================
const TASK_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: '等待中', color: 'bg-gray-100 text-gray-700', icon: <Clock className="w-3.5 h-3.5" /> },
  processing: { label: '处理中', color: 'bg-blue-100 text-blue-700', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  failed: { label: '全部失败', color: 'bg-red-100 text-red-700', icon: <XCircle className="w-3.5 h-3.5" /> },
  cancelled: { label: '已取消', color: 'bg-yellow-100 text-yellow-700', icon: <Ban className="w-3.5 h-3.5" /> },
};

const ITEM_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  queued: { label: '排队中', color: 'bg-gray-100 text-gray-700' },
  processing: { label: '处理中', color: 'bg-blue-100 text-blue-700' },
  ai_analyzing: { label: 'AI分析中', color: 'bg-purple-100 text-purple-700' },
  ai_generating: { label: 'AI生成中', color: 'bg-indigo-100 text-indigo-700' },
  saving: { label: '入库中', color: 'bg-cyan-100 text-cyan-700' },
  success: { label: '成功', color: 'bg-green-100 text-green-700' },
  error: { label: '失败', color: 'bg-red-100 text-red-700' },
  skipped: { label: '已跳过', color: 'bg-yellow-100 text-yellow-700' },
};

// ============================================================
// 辅助函数
// ============================================================
function formatTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(startStr: string | null, endStr: string | null): string {
  if (!startStr || !endStr) return '-';
  const ms = new Date(endStr).getTime() - new Date(startStr).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

// ============================================================
// 进度条组件
// ============================================================
function ProgressBar({ task }: { task: BatchTask }) {
  const total = task.total_items || 1;
  const successPct = (task.success_items / total) * 100;
  const errorPct = (task.error_items / total) * 100;
  const pendingPct = 100 - successPct - errorPct;

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{task.processed_items}/{task.total_items} 已处理</span>
        <span>{successPct.toFixed(0)}% 成功</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden flex">
        {successPct > 0 && <div className="bg-green-500 h-full transition-all" style={{ width: `${successPct}%` }} />}
        {errorPct > 0 && <div className="bg-red-400 h-full transition-all" style={{ width: `${errorPct}%` }} />}
        {pendingPct > 0 && task.status === 'processing' && (
          <div className="bg-blue-300 h-full transition-all animate-pulse" style={{ width: `${pendingPct}%` }} />
        )}
      </div>
      <div className="flex gap-3 mt-1 text-xs text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> 成功 {task.success_items}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> 失败 {task.error_items}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> 待处理 {task.total_items - task.processed_items}</span>
      </div>
    </div>
  );
}

// ============================================================
// 批次详情面板
// ============================================================
function BatchDetailPanel({
  task,
  items,
  loading,
  onRetryItem,
  onRetryAll,
  onBack,
}: {
  task: BatchTask;
  items: BatchItem[];
  loading: boolean;
  onRetryItem: (itemId: string) => void;
  onRetryAll: () => void;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<string>('all');
  const filteredItems = filter === 'all' ? items : items.filter(i => i.status === filter);
  const errorCount = items.filter(i => i.status === 'error').length;

  return (
    <div>
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
        {errorCount > 0 && (
          <button
            onClick={onRetryAll}
            className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600"
          >
            <RotateCcw className="w-3.5 h-3.5" /> 重试全部失败 ({errorCount})
          </button>
        )}
      </div>

      {/* 批次信息卡片 */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-lg">{task.batch_name || '未命名批次'}</h3>
            <p className="text-xs text-gray-400 mt-0.5">ID: {task.id.slice(0, 8)}... | 创建: {formatTime(task.created_at)}</p>
          </div>
          <StatusBadge status={task.status} config={TASK_STATUS_CONFIG} />
        </div>
        <ProgressBar task={task} />
      </div>

      {/* 筛选标签 */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {[
          { key: 'all', label: `全部 (${items.length})` },
          { key: 'success', label: `成功 (${items.filter(i => i.status === 'success').length})` },
          { key: 'error', label: `失败 (${errorCount})` },
          { key: 'queued', label: `排队 (${items.filter(i => i.status === 'queued').length})` },
          { key: 'ai_analyzing', label: `分析中 (${items.filter(i => ['ai_analyzing', 'ai_generating', 'saving', 'processing'].includes(i.status)).length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key === 'ai_analyzing' ? 'ai_analyzing' : tab.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 子项列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span className="ml-2 text-gray-500">加载中...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无数据</div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map(item => (
            <ItemCard key={item.id} item={item} onRetry={onRetryItem} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 子项卡片
// ============================================================
function ItemCard({ item, onRetry }: { item: BatchItem; onRetry: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const statusCfg = ITEM_STATUS_CONFIG[item.status] || { label: item.status, color: 'bg-gray-100 text-gray-600' };
  const firstImage = item.image_urls?.[0];

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        {/* 缩略图 */}
        <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
          {firstImage ? (
            <img src={firstImage} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300"><Package className="w-5 h-5" /></div>
          )}
        </div>

        {/* 信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{item.product_name || '(待识别)'}</span>
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {item.image_urls?.length || 0} 张图 | 重试 {item.retry_count}/{item.max_retries} | 耗时 {formatDuration(item.processing_started_at, item.processing_completed_at)}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1">
          {item.status === 'error' && (
            <button
              onClick={(e) => { e.stopPropagation(); onRetry(item.id); }}
              className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-500"
              title="重试"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {item.inventory_product_id && (
            <a
              href={`/inventory-products?highlight=${item.inventory_product_id}`}
              className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500"
              title="查看商品"
            >
              <Eye className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="border-t px-3 py-2 bg-gray-50 text-xs space-y-1.5">
          <div className="flex gap-4">
            <span className="text-gray-400">ID:</span>
            <span className="font-mono text-gray-600">{item.id}</span>
          </div>
          {item.error_message && (
            <div className="flex gap-4">
              <span className="text-gray-400 flex-shrink-0">错误:</span>
              <span className="text-red-600 break-all">{item.error_message}</span>
            </div>
          )}
          {item.image_urls && item.image_urls.length > 0 && (
            <div>
              <span className="text-gray-400">图片:</span>
              <div className="flex gap-1 mt-1 flex-wrap">
                {item.image_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`img-${i}`} className="w-16 h-16 rounded object-cover border hover:border-blue-400" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </a>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-4">
            <span className="text-gray-400">价格:</span>
            <span>{item.price ?? '-'}</span>
            <span className="text-gray-400 ml-2">库存:</span>
            <span>{item.stock ?? '-'}</span>
            <span className="text-gray-400 ml-2">规格:</span>
            <span>{item.specs || '-'}</span>
          </div>
          <div className="flex gap-4">
            <span className="text-gray-400">开始:</span>
            <span>{formatTime(item.processing_started_at)}</span>
            <span className="text-gray-400 ml-2">完成:</span>
            <span>{formatTime(item.processing_completed_at)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 状态徽章
// ============================================================
function StatusBadge({ status, config }: { status: string; config: Record<string, { label: string; color: string; icon?: React.ReactNode }> }) {
  const cfg = config[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ============================================================
// 主页面组件
// ============================================================
export default function BatchUploadPage() {
  const { supabase } = useSupabase();
  const [tasks, setTasks] = useState<BatchTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<BatchTask | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 加载批次列表
  const loadTasks = useCallback(async () => {
    try {
      const data = await adminQuery<BatchTask>(supabase, 'batch_upload_tasks', {
        select: '*',
        orderBy: 'created_at',
        orderAsc: false,
        limit: 50,
      });
      setTasks(data || []);
    } catch (err: any) {
      console.error('加载批次列表失败:', err);
      toast.error('加载批次列表失败: ' + (err.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // 加载子项
  const loadItems = useCallback(async (batchId: string) => {
    setItemsLoading(true);
    try {
      const data = await adminQuery<BatchItem>(supabase, 'batch_upload_items', {
        select: '*',
        filters: [{ col: 'batch_id', op: 'eq', val: batchId }],
        orderBy: 'created_at',
        orderAsc: true,
        limit: 500,
      });
      setItems(data || []);
    } catch (err: any) {
      console.error('加载子项失败:', err);
      toast.error('加载子项失败');
    } finally {
      setItemsLoading(false);
    }
  }, [supabase]);

  // 加载健康状态
  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch('https://tezbarakat.com/batch-api/health');
      if (res.ok) {
        setHealthStatus(await res.json());
      }
    } catch {
      // 健康检查失败时尝试直接访问
      try {
        const res = await fetch('/batch-api/health');
        if (res.ok) setHealthStatus(await res.json());
      } catch {
        setHealthStatus(null);
      }
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadTasks();
    loadHealth();
  }, [loadTasks, loadHealth]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadTasks();
      if (selectedTask) {
        loadItems(selectedTask.id);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedTask, loadTasks, loadItems]);

  // 选择批次
  const handleSelectTask = (task: BatchTask) => {
    setSelectedTask(task);
    loadItems(task.id);
  };

  // 重试单个子项
  const handleRetryItem = async (itemId: string) => {
    try {
      await adminUpdate(supabase, 'batch_upload_items', {
        status: 'queued',
        error_message: null,
        retry_count: 0,
        next_retry_at: null,
        processing_started_at: null,
        processing_completed_at: null,
      }, [{ col: 'id', op: 'eq', val: itemId }]);
      toast.success('已重新加入队列');
      if (selectedTask) loadItems(selectedTask.id);
    } catch (err: any) {
      toast.error('重试失败: ' + err.message);
    }
  };

  // 重试所有失败项
  const handleRetryAll = async () => {
    if (!selectedTask) return;
    const errorItems = items.filter(i => i.status === 'error');
    if (errorItems.length === 0) {
      toast('没有需要重试的失败任务');
      return;
    }
    try {
      let successCount = 0;
      for (const item of errorItems) {
        try {
          await adminUpdate(supabase, 'batch_upload_items', {
            status: 'queued',
            error_message: null,
            retry_count: 0,
            next_retry_at: null,
            processing_started_at: null,
            processing_completed_at: null,
          }, [{ col: 'id', op: 'eq', val: item.id }]);
          successCount++;
        } catch (e) {
          console.warn(`重试 ${item.id} 失败:`, e);
        }
      }
      // 更新主表状态
      await adminUpdate(supabase, 'batch_upload_tasks', {
        status: 'processing',
      }, [{ col: 'id', op: 'eq', val: selectedTask.id }]);
      toast.success(`已将 ${successCount} 个失败任务重新加入队列`);
      loadItems(selectedTask.id);
      loadTasks();
    } catch (err: any) {
      toast.error('批量重试失败: ' + err.message);
    }
  };

  // 取消批次
  const handleCancelBatch = async (taskId: string) => {
    if (!confirm('确定要取消此批次吗？正在处理的任务将不会被中断。')) return;
    try {
      await adminUpdate(supabase, 'batch_upload_tasks', {
        status: 'cancelled',
      }, [{ col: 'id', op: 'eq', val: taskId }]);
      toast.success('批次已取消');
      loadTasks();
    } catch (err: any) {
      toast.error('取消失败: ' + err.message);
    }
  };

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="max-w-6xl mx-auto">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Upload className="w-6 h-6 text-blue-600" />
            批量商品上架
          </h1>
          <p className="text-sm text-gray-500 mt-1">管理批量上架任务，查看处理进度和结果</p>
        </div>
        <div className="flex items-center gap-3">
          {/* 处理器状态 */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
            healthStatus?.status === 'running' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${healthStatus?.status === 'running' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            处理器 {healthStatus?.status === 'running' ? '运行中' : '离线'}
          </div>
          {/* 自动刷新 */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              autoRefresh ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} style={autoRefresh ? { animationDuration: '3s' } : {}} />
            {autoRefresh ? '自动刷新' : '已暂停'}
          </button>
          {/* 手动刷新 */}
          <button
            onClick={() => { loadTasks(); if (selectedTask) loadItems(selectedTask.id); }}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            title="刷新"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      {!selectedTask && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<Package className="w-5 h-5 text-blue-500" />}
            label="总批次"
            value={tasks.length}
            color="blue"
          />
          <StatCard
            icon={<Loader2 className="w-5 h-5 text-orange-500" />}
            label="处理中"
            value={tasks.filter(t => t.status === 'processing').length}
            color="orange"
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
            label="已完成"
            value={tasks.filter(t => t.status === 'completed').length}
            color="green"
          />
          <StatCard
            icon={<AlertCircle className="w-5 h-5 text-red-500" />}
            label="有失败"
            value={tasks.filter(t => t.error_items > 0).length}
            color="red"
          />
        </div>
      )}

      {/* 主内容区 */}
      {selectedTask ? (
        <BatchDetailPanel
          task={selectedTask}
          items={items}
          loading={itemsLoading}
          onRetryItem={handleRetryItem}
          onRetryAll={handleRetryAll}
          onBack={() => { setSelectedTask(null); setItems([]); }}
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="ml-3 text-gray-500">加载批次列表...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-20">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-lg">暂无批量上架任务</p>
          <p className="text-gray-300 text-sm mt-1">通过服务器 CLI 工具创建批量上架任务</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <div
              key={task.id}
              className="bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => handleSelectTask(task)}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{task.batch_name || '未命名批次'}</h3>
                    <StatusBadge status={task.status} config={TASK_STATUS_CONFIG} />
                  </div>
                  <div className="flex items-center gap-2">
                    {task.status === 'processing' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCancelBatch(task.id); }}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600"
                        title="取消批次"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                    <span className="text-xs text-gray-400">{formatTime(task.created_at)}</span>
                  </div>
                </div>
                <ProgressBar task={task} />
                {task.default_price && (
                  <div className="flex gap-4 mt-2 text-xs text-gray-400">
                    <span>默认价格: {task.default_price}</span>
                    <span>默认库存: {task.default_stock}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 统计卡片
// ============================================================
function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-${color}-50`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
