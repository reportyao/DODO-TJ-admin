/**
 * B2B 对账中心页面 (P1-2 / P1-3 / P1-4)
 *
 * 功能:
 *   P1-2: 对账批次列表 — 查看待对账、已匹配、差异、锁账批次
 *   P1-3: 差异处理 — 支持短款、长款、手续费、折让、人工调整（必须有原因和凭证）
 *   P1-4: 锁账与反锁账 — 锁账后禁止普通修改；反锁账需填写原因，审计日志完整
 *
 * 路由: /b2b-reconciliation
 */
import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { adminRpc } from '../lib/adminApi';
import toast from 'react-hot-toast';

// ============================================================================
// Types
// ============================================================================
interface ReconciliationBatch {
  id: string;
  batch_number: string;
  title: string;
  scope: string;
  status: string;
  payment_method: string | null;
  date_from: string | null;
  date_to: string | null;
  order_count: number;
  payment_count: number;
  expected_amount: number;
  actual_amount: number | null;
  matched_amount: number;
  difference_amount: number;
  adjustment_total: number;
  final_difference: number;
  note: string | null;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ReconciliationItem {
  id: string;
  item_type: string;
  expected_amount: number;
  actual_amount: number;
  matched_status: string;
  difference_amount: number;
  note: string | null;
  created_at: string;
  // Order info
  order_number: string | null;
  fulfillment_status: string | null;
  financial_status: string | null;
  receivable_total: number | null;
  paid_total: number | null;
  balance_due: number | null;
  // Payment info
  transaction_type: string | null;
  payment_method: string | null;
  payment_amount: number | null;
  payment_status: string | null;
  paid_at: string | null;
  payer_name: string | null;
  proof_url: string | null;
}

interface Adjustment {
  id: string;
  adjustment_type: string;
  amount: number;
  direction: string;
  reason: string;
  proof_url: string | null;
  status: string;
  created_at: string;
  order_number: string | null;
}

// ============================================================================
// Constants
// ============================================================================
const BATCH_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:      { label: '草稿',   color: 'bg-gray-100 text-gray-700' },
  reviewing:  { label: '审核中', color: 'bg-blue-100 text-blue-700' },
  matched:    { label: '已匹配', color: 'bg-green-100 text-green-700' },
  mismatched: { label: '有差异', color: 'bg-yellow-100 text-yellow-800' },
  locked:     { label: '已锁账', color: 'bg-purple-100 text-purple-700' },
  closed:     { label: '已关闭', color: 'bg-gray-200 text-gray-600' },
};

const ADJUSTMENT_TYPE_MAP: Record<string, string> = {
  short_payment: '短款',
  over_payment:  '长款',
  fee:           '手续费',
  discount:      '折让',
  manual:        '人工调整',
  return_refund: '退款调整',
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  cod_cash:     '货到付款（现金）',
  bank_transfer:'银行转账',
  card:         '刷卡',
  online:       '线上支付',
  credit:       '赊账',
};

function formatAmount(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('zh-CN');
}

function generateIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================================
// Sub-component: Create Batch Modal
// ============================================================================
function CreateBatchModal({
  onClose,
  onCreated,
  supabase,
}: {
  onClose: () => void;
  onCreated: () => void;
  supabase: any;
}) {
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('manual');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actualAmount, setActualAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const result = await adminRpc<{ success: boolean; batch_number: string; message: string }>(
        supabase, 'admin_b2b_create_reconciliation_batch', {
          p_title: title || null,
          p_scope: scope,
          p_payment_method: paymentMethod || null,
          p_date_from: dateFrom || null,
          p_date_to: dateTo || null,
          p_actual_amount: actualAmount ? parseFloat(actualAmount) : null,
          p_note: note || null,
          p_idempotency_key: generateIdempotencyKey('create_batch'),
        }
      );
      if (result.success) {
        toast.success(`对账批次 ${result.batch_number} 创建成功`);
        onCreated();
        onClose();
      }
    } catch (err: any) {
      toast.error(`创建失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">创建对账批次</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">批次标题（可选）</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="如：5月第一周对账"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">对账范围</label>
              <select
                value={scope}
                onChange={e => setScope(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="manual">手动</option>
                <option value="daily">日对账</option>
                <option value="weekly">周对账</option>
                <option value="monthly">月对账</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">收款方式（可选）</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部方式</option>
                {Object.entries(PAYMENT_METHOD_MAP).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">起始日期</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">截止日期</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">实际收到金额（TJS）</label>
            <input
              type="number"
              step="0.01"
              value={actualAmount}
              onChange={e => setActualAmount(e.target.value)}
              placeholder="留空则等于系统应收"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">取消</button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '创建中...' : '创建批次'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-component: Add Adjustment Modal (P1-3)
// ============================================================================
function AddAdjustmentModal({
  batchId,
  onClose,
  onAdded,
  supabase,
}: {
  batchId: string;
  onClose: () => void;
  onAdded: () => void;
  supabase: any;
}) {
  const [orderId, setOrderId] = useState('');
  const [adjType, setAdjType] = useState('short_payment');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!reason.trim()) { toast.error('调整原因不能为空'); return; }
    if (!amount || isNaN(parseFloat(amount))) { toast.error('请输入有效金额'); return; }
    setLoading(true);
    try {
      const result = await adminRpc<{ success: boolean; message: string }>(
        supabase, 'admin_b2b_add_adjustment', {
          p_batch_id: batchId,
          p_order_id: orderId || null,
          p_adjustment_type: adjType,
          p_amount: parseFloat(amount),
          p_reason: reason,
          p_proof_url: proofUrl || null,
          p_idempotency_key: generateIdempotencyKey('adj'),
        }
      );
      if (result.success) {
        toast.success(result.message || '调整记录已添加');
        onAdded();
        onClose();
      }
    } catch (err: any) {
      toast.error(`添加失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">添加差异调整</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">调整类型</label>
            <select
              value={adjType}
              onChange={e => setAdjType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(ADJUSTMENT_TYPE_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">金额（TJS，正数=增加，负数=减少）</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="如：-50.00"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              调整原因 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="必须填写详细原因，如：银行手续费 50 TJS"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">凭证 URL（可选）</label>
            <input
              type="text"
              value={proofUrl}
              onChange={e => setProofUrl(e.target.value)}
              placeholder="https://..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">取消</button>
          <button
            onClick={handleAdd}
            disabled={loading}
            className="px-5 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? '添加中...' : '确认添加'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-component: Unlock Modal (P1-4)
// ============================================================================
function UnlockModal({
  batchId,
  onClose,
  onUnlocked,
  supabase,
}: {
  batchId: string;
  onClose: () => void;
  onUnlocked: () => void;
  supabase: any;
}) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = async () => {
    if (!reason.trim()) { toast.error('反锁账原因不能为空'); return; }
    setLoading(true);
    try {
      const result = await adminRpc<{ success: boolean; message: string }>(
        supabase, 'admin_b2b_unlock_reconciliation_batch', {
          p_batch_id: batchId,
          p_reason: reason,
          p_idempotency_key: generateIdempotencyKey('unlock'),
        }
      );
      if (result.success) {
        toast.success(result.message || '已反锁账');
        onUnlocked();
        onClose();
      }
    } catch (err: any) {
      toast.error(`反锁账失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-red-700">反锁账确认</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            ⚠️ 反锁账将允许重新修改对账批次，此操作会被完整记录在审计日志中。
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              反锁账原因 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="必须填写反锁账原因"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">取消</button>
          <button
            onClick={handleUnlock}
            disabled={loading}
            className="px-5 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? '处理中...' : '确认反锁账'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-component: Batch Detail Panel
// ============================================================================
function BatchDetailPanel({
  batch,
  onClose,
  onRefresh,
  supabase,
}: {
  batch: ReconciliationBatch;
  onClose: () => void;
  onRefresh: () => void;
  supabase: any;
}) {
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [detailBatch, setDetailBatch] = useState<ReconciliationBatch>(batch);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'adjustments'>('items');

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRpc<{
        success: boolean;
        batch: ReconciliationBatch;
        items: ReconciliationItem[];
        adjustments: Adjustment[];
      }>(supabase, 'admin_b2b_get_reconciliation_detail', { p_batch_id: batch.id });
      if (result.success) {
        setDetailBatch(result.batch);
        setItems(result.items || []);
        setAdjustments(result.adjustments || []);
      }
    } catch (err: any) {
      toast.error(`加载详情失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase, batch.id]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const handleLock = async () => {
    if (!confirm(`确认锁定对账批次 ${detailBatch.batch_number}？锁账后将禁止修改相关订单金额。`)) return;
    setActionLoading(true);
    try {
      const result = await adminRpc<{ success: boolean; message: string }>(
        supabase, 'admin_b2b_lock_reconciliation_batch', {
          p_batch_id: batch.id,
          p_idempotency_key: generateIdempotencyKey('lock'),
        }
      );
      if (result.success) {
        toast.success(result.message || '已锁账');
        loadDetail();
        onRefresh();
      }
    } catch (err: any) {
      toast.error(`锁账失败: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async () => {
    if (!confirm(`确认关闭对账批次 ${detailBatch.batch_number}？关闭后不可重新开启。`)) return;
    setActionLoading(true);
    try {
      const result = await adminRpc<{ success: boolean; message: string }>(
        supabase, 'admin_b2b_close_reconciliation_batch', { p_batch_id: batch.id }
      );
      if (result.success) {
        toast.success(result.message || '已关闭');
        loadDetail();
        onRefresh();
      }
    } catch (err: any) {
      toast.error(`关闭失败: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const statusInfo = BATCH_STATUS_MAP[detailBatch.status] || { label: detailBatch.status, color: 'bg-gray-100 text-gray-700' };
  const isLocked = detailBatch.status === 'locked';
  const isClosed = detailBatch.status === 'closed';

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-start justify-end">
      <div className="bg-white h-full w-full max-w-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b bg-gray-50">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-gray-900">{detailBatch.batch_number}</h2>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{detailBatch.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none p-1">&times;</button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-3 p-4 border-b bg-white">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="text-xs text-blue-600 font-medium">系统应收</div>
            <div className="text-lg font-bold text-blue-800">{formatAmount(detailBatch.expected_amount)}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <div className="text-xs text-green-600 font-medium">实际收到</div>
            <div className="text-lg font-bold text-green-800">{formatAmount(detailBatch.actual_amount)}</div>
          </div>
          <div className={`rounded-lg p-3 text-center ${Math.abs(detailBatch.difference_amount) < 0.01 ? 'bg-gray-50' : 'bg-yellow-50'}`}>
            <div className={`text-xs font-medium ${Math.abs(detailBatch.difference_amount) < 0.01 ? 'text-gray-500' : 'text-yellow-700'}`}>差异金额</div>
            <div className={`text-lg font-bold ${Math.abs(detailBatch.difference_amount) < 0.01 ? 'text-gray-700' : 'text-yellow-800'}`}>
              {formatAmount(detailBatch.difference_amount)}
            </div>
          </div>
          <div className={`rounded-lg p-3 text-center ${Math.abs(detailBatch.final_difference) < 0.01 ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className={`text-xs font-medium ${Math.abs(detailBatch.final_difference) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>最终差异</div>
            <div className={`text-lg font-bold ${Math.abs(detailBatch.final_difference) < 0.01 ? 'text-green-800' : 'text-red-800'}`}>
              {formatAmount(detailBatch.final_difference)}
            </div>
          </div>
        </div>

        {/* Action Bar */}
        {!isClosed && (
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-gray-50">
            {!isLocked && (
              <>
                <button
                  onClick={() => setShowAdjModal(true)}
                  className="px-3 py-1.5 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600"
                >
                  + 添加差异调整
                </button>
                <button
                  onClick={handleLock}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  🔒 锁账
                </button>
                <button
                  onClick={handleClose}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-gray-500 text-white text-sm rounded-lg hover:bg-gray-600 disabled:opacity-50"
                >
                  关闭批次
                </button>
              </>
            )}
            {isLocked && (
              <button
                onClick={() => setShowUnlockModal(true)}
                className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
              >
                🔓 反锁账（高权限）
              </button>
            )}
            <div className="ml-auto text-xs text-gray-500">
              {detailBatch.payment_count} 条流水 · {detailBatch.order_count} 笔订单
              {detailBatch.date_from && ` · ${formatDate(detailBatch.date_from)} ~ ${formatDate(detailBatch.date_to)}`}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b px-4">
          <button
            onClick={() => setActiveTab('items')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${activeTab === 'items' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            对账明细 ({items.length})
          </button>
          <button
            onClick={() => setActiveTab('adjustments')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${activeTab === 'adjustments' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            差异调整 ({adjustments.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">加载中...</div>
          ) : activeTab === 'items' ? (
            <div className="space-y-2">
              {items.length === 0 ? (
                <div className="text-center text-gray-400 py-8">暂无对账明细</div>
              ) : items.map(item => (
                <div key={item.id} className="border rounded-lg p-3 bg-white hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {item.item_type === 'payment' ? '付款流水' : item.item_type === 'order' ? '订单' : '调整'}
                        </span>
                        {item.order_number && (
                          <span className="text-sm font-medium text-gray-800">{item.order_number}</span>
                        )}
                        {item.payer_name && (
                          <span className="text-sm text-gray-600">{item.payer_name}</span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-gray-500 space-x-3">
                        {item.payment_method && <span>{PAYMENT_METHOD_MAP[item.payment_method] || item.payment_method}</span>}
                        {item.paid_at && <span>{new Date(item.paid_at).toLocaleString('zh-CN')}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-gray-900">
                        {formatAmount(item.expected_amount)} TJS
                      </div>
                      {Math.abs(item.difference_amount) > 0.01 && (
                        <div className="text-xs text-red-600">差异: {formatAmount(item.difference_amount)}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {adjustments.length === 0 ? (
                <div className="text-center text-gray-400 py-8">暂无差异调整记录</div>
              ) : adjustments.map(adj => (
                <div key={adj.id} className="border rounded-lg p-3 bg-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-medium">
                          {ADJUSTMENT_TYPE_MAP[adj.adjustment_type] || adj.adjustment_type}
                        </span>
                        {adj.order_number && (
                          <span className="text-sm text-gray-600">订单 {adj.order_number}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{adj.reason}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(adj.created_at).toLocaleString('zh-CN')}</p>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${adj.direction === 'credit' ? 'text-green-700' : 'text-red-700'}`}>
                        {adj.direction === 'credit' ? '+' : '-'}{formatAmount(adj.amount)} TJS
                      </div>
                      <div className="text-xs text-gray-500">{adj.status === 'approved' ? '已审批' : adj.status}</div>
                    </div>
                  </div>
                  {adj.proof_url && (
                    <a href={adj.proof_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline mt-1 block">
                      查看凭证
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAdjModal && (
        <AddAdjustmentModal
          batchId={batch.id}
          onClose={() => setShowAdjModal(false)}
          onAdded={() => { loadDetail(); onRefresh(); }}
          supabase={supabase}
        />
      )}
      {showUnlockModal && (
        <UnlockModal
          batchId={batch.id}
          onClose={() => setShowUnlockModal(false)}
          onUnlocked={() => { loadDetail(); onRefresh(); }}
          supabase={supabase}
        />
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================
export default function B2BReconciliationPage() {
  const { supabase } = useSupabase();
  const [batches, setBatches] = useState<ReconciliationBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 20;
  const [selectedBatch, setSelectedBatch] = useState<ReconciliationBatch | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRpc<{
        success: boolean;
        data: ReconciliationBatch[];
        total: number;
      }>(supabase, 'admin_b2b_get_reconciliation_list', {
        p_status: statusFilter || null,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_page: page,
        p_page_size: PAGE_SIZE,
      });
      if (result.success) {
        setBatches(result.data || []);
        setTotalCount(result.total || 0);
      }
    } catch (err: any) {
      toast.error(`加载失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase, statusFilter, dateFrom, dateTo, page]);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Summary stats from current page
  const stats = {
    total: batches.length,
    matched: batches.filter(b => b.status === 'matched').length,
    mismatched: batches.filter(b => b.status === 'mismatched').length,
    locked: batches.filter(b => b.status === 'locked').length,
    totalExpected: batches.reduce((s, b) => s + (b.expected_amount || 0), 0),
    totalDiff: batches.reduce((s, b) => s + (b.final_difference || 0), 0),
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">对账中心</h1>
          <p className="text-sm text-gray-500 mt-1">管理收款对账批次、处理差异、锁账与反锁账</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium"
        >
          + 新建对账批次
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
          <div className="text-xs text-gray-500 mt-0.5">本页批次</div>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-green-700">{stats.matched}</div>
          <div className="text-xs text-green-600 mt-0.5">已匹配</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-yellow-700">{stats.mismatched}</div>
          <div className="text-xs text-yellow-600 mt-0.5">有差异</div>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-purple-700">{stats.locked}</div>
          <div className="text-xs text-purple-600 mt-0.5">已锁账</div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center col-span-1">
          <div className="text-lg font-bold text-blue-700">{formatAmount(stats.totalExpected)}</div>
          <div className="text-xs text-blue-600 mt-0.5">应收合计 TJS</div>
        </div>
        <div className={`border rounded-xl p-3 text-center col-span-1 ${Math.abs(stats.totalDiff) < 0.01 ? 'bg-gray-50 border-gray-100' : 'bg-red-50 border-red-100'}`}>
          <div className={`text-lg font-bold ${Math.abs(stats.totalDiff) < 0.01 ? 'text-gray-700' : 'text-red-700'}`}>
            {formatAmount(stats.totalDiff)}
          </div>
          <div className={`text-xs mt-0.5 ${Math.abs(stats.totalDiff) < 0.01 ? 'text-gray-500' : 'text-red-600'}`}>最终差异 TJS</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全部状态</option>
          {Object.entries(BATCH_STATUS_MAP).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          placeholder="起始日期"
        />
        <span className="text-gray-400 text-sm">至</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          placeholder="截止日期"
        />
        <button
          onClick={() => { setStatusFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border rounded-lg"
        >
          重置
        </button>
        <div className="ml-auto text-sm text-gray-500">共 {totalCount} 个批次</div>
      </div>

      {/* Batch List */}
      <div className="bg-white border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">加载中...</div>
        ) : batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <div className="text-4xl mb-2">📋</div>
            <div>暂无对账批次</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">批次号</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">标题</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">状态</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">应收</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">实收</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">最终差异</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">流水/订单</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">创建时间</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batches.map(batch => {
                const statusInfo = BATCH_STATUS_MAP[batch.status] || { label: batch.status, color: 'bg-gray-100 text-gray-700' };
                const hasDiff = Math.abs(batch.final_difference) > 0.01;
                return (
                  <tr key={batch.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedBatch(batch)}>
                    <td className="px-4 py-3 font-mono text-blue-600 font-medium">{batch.batch_number}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">{batch.title}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">{formatAmount(batch.expected_amount)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatAmount(batch.actual_amount)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${hasDiff ? 'text-red-600' : 'text-green-600'}`}>
                      {hasDiff ? formatAmount(batch.final_difference) : '✓ 平账'}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 text-xs">
                      {batch.payment_count}条 / {batch.order_count}笔
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(batch.created_at)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedBatch(batch); }}
                        className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50"
          >
            上一页
          </button>
          <span className="text-sm text-gray-600">第 {page} / {totalPages} 页</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50"
          >
            下一页
          </button>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateBatchModal
          onClose={() => setShowCreateModal(false)}
          onCreated={fetchBatches}
          supabase={supabase}
        />
      )}
      {selectedBatch && (
        <BatchDetailPanel
          batch={selectedBatch}
          onClose={() => setSelectedBatch(null)}
          onRefresh={fetchBatches}
          supabase={supabase}
        />
      )}
    </div>
  );
}
