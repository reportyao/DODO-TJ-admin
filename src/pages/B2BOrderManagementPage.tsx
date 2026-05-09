/**
 * B2B 订单管理页面 (P0-6 改造版)
 *
 * 核心改造:
 *   1. 所有写操作通过专用 RPC，不再使用 adminUpdate 多步写入
 *   2. 履约状态与财务状态分离，送达不再自动标记已付款
 *   3. 订单详情展示中文商品名、图片、SKU、单位、数量、成本（权限控制）
 *   4. 收款流水展示与操作（登记、确认、驳回）
 *   5. 操作日志展示
 *
 * 状态流转:
 *   履约: pending → confirmed → picking/shortage → ready_to_ship → shipping → delivered → closed
 *   财务: unpaid → partial_paid → paid (由确认的收款流水聚合驱动)
 */
import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { adminRpc } from '../lib/adminApi';
import toast from 'react-hot-toast';

// ============================================================================
// Types
// ============================================================================

interface B2BOrder {
  id: string;
  order_number: string;
  user_id: string;
  total_amount: number;
  item_count: number;
  total_quantity: number;
  fulfillment_status: string;
  financial_status: string;
  reconciliation_status: string;
  subtotal_amount: number;
  receivable_total: number;
  paid_total: number;
  balance_due: number;
  cost_total_snapshot: number | null;
  expected_gross_profit: number | null;
  cost_status: string;
  estimated_delivery_date: string | null;
  delivery_address: string | null;
  delivery_note: string | null;
  admin_note: string | null;
  payment_method: string;
  version: number;
  locked_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
  legacy_status: string;
  legacy_payment_status: string;
  wholesaler_company: string | null;
  wholesaler_phone: string | null;
  wholesaler_address?: string | null;
  user_phone: string | null;
}

interface B2BOrderItem {
  id: string;
  product_id: string;
  product_name_zh: string;
  product_name_original: string;
  sku: string;
  barcode: string | null;
  image_url: string;
  specifications_zh: string | null;
  unit_measure: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  cost_price_snapshot: number | null;
  wholesale_price_snapshot: number | null;
  ordered_quantity: number;
  picked_quantity: number;
  shipped_quantity: number;
  delivered_quantity: number;
  returned_quantity: number;
  shortage_quantity: number;
  line_expected_profit: number | null;
  item_status: string;
}

interface PaymentTransaction {
  id: string;
  transaction_type: string;
  payment_method: string;
  amount: number;
  status: string;
  paid_at: string | null;
  confirmed_at: string | null;
  proof_url: string | null;
  payer_name: string | null;
  note: string | null;
  reject_reason: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  idempotency_key: string | null;
  created_at: string;
}

interface OperationLog {
  id: string;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  admin_id: string | null;
  source: string;
  created_at: string;
}

// ============================================================================
// Constants
// ============================================================================

const FULFILLMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待确认', color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: '已确认', color: 'bg-blue-100 text-blue-800' },
  picking: { label: '备货中', color: 'bg-indigo-100 text-indigo-800' },
  shortage: { label: '缺货', color: 'bg-red-100 text-red-800' },
  ready_to_ship: { label: '待发货', color: 'bg-purple-100 text-purple-800' },
  shipping: { label: '配送中', color: 'bg-purple-100 text-purple-800' },
  delivered: { label: '已送达', color: 'bg-green-100 text-green-800' },
  cancelled: { label: '已取消', color: 'bg-gray-100 text-gray-800' },
  returned: { label: '已退货', color: 'bg-orange-100 text-orange-800' },
  closed: { label: '已关闭', color: 'bg-gray-100 text-gray-600' },
};

const FINANCIAL_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unpaid: { label: '未收款', color: 'bg-red-100 text-red-800' },
  partial_paid: { label: '部分收款', color: 'bg-orange-100 text-orange-800' },
  paid: { label: '已结清', color: 'bg-green-100 text-green-800' },
  overpaid: { label: '多收款', color: 'bg-blue-100 text-blue-800' },
  refunded: { label: '已退款', color: 'bg-gray-100 text-gray-800' },
};

const ITEM_STATUS_MAP: Record<string, { label: string; color: string }> = {
  ordered: { label: '待处理', color: 'text-gray-600' },
  picking: { label: '备货中', color: 'text-blue-600' },
  shortage: { label: '缺货', color: 'text-red-600' },
  shipped: { label: '已发货', color: 'text-purple-600' },
  delivered: { label: '已签收', color: 'text-green-600' },
  returned: { label: '已退货', color: 'text-orange-600' },
  cancelled: { label: '已取消', color: 'text-gray-400' },
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  cod_cash: '现金',
  cod_transfer: '转账',
  deposit_transfer: '定金转账',
  mixed: '混合支付',
  credit_terms: '账期',
  cod: '货到付款',
  other: '其他',
};

const PAYMENT_TX_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待确认', color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: '已确认', color: 'bg-green-100 text-green-800' },
  rejected: { label: '已驳回', color: 'bg-red-100 text-red-800' },
  voided: { label: '已作废', color: 'bg-gray-100 text-gray-800' },
};

// ============================================================================
// Helper: Generate idempotency key
// ============================================================================
function generateIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================================
// Main Component
// ============================================================================

export default function B2BOrderManagementPage() {
  const { supabase } = useSupabase();

  // List state
  const [orders, setOrders] = useState<B2BOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>('');
  const [financialFilter, setFinancialFilter] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Detail state
  const [detailOrder, setDetailOrder] = useState<B2BOrder | null>(null);
  const [orderItems, setOrderItems] = useState<B2BOrderItem[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'payments' | 'logs'>('items');

  // Action modals
  const [actionLoading, setActionLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPickingModal, setShowPickingModal] = useState(false);
  const [showShipModal, setShowShipModal] = useState(false);

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cod_cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentProofUrl, setPaymentProofUrl] = useState('');

  // Ship form
  const [shipDeliveryDate, setShipDeliveryDate] = useState('');
  const [shipNote, setShipNote] = useState('');

  // ============================================================================
  // Fetch Orders List
  // ============================================================================

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRpc<{
        success: boolean;
        data: B2BOrder[];
        total: number;
        page: number;
        page_size: number;
      }>(supabase, 'admin_b2b_order_list', {
        p_fulfillment_status: fulfillmentFilter || null,
        p_financial_status: financialFilter || null,
        p_search: searchText || null,
        p_page: page,
        p_page_size: PAGE_SIZE,
      });

      if (result.success) {
        setOrders(result.data || []);
        setTotalCount(result.total || 0);
      } else {
        toast.error('加载订单失败');
      }
    } catch (err: any) {
      toast.error(`加载失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase, fulfillmentFilter, financialFilter, searchText, page]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // ============================================================================
  // Fetch Order Detail
  // ============================================================================

  const openDetail = async (order: B2BOrder) => {
    setDetailOrder(order);
    setDetailLoading(true);
    setActiveTab('items');
    try {
      const result = await adminRpc<{
        success: boolean;
        order: B2BOrder;
        items: B2BOrderItem[];
        payments: PaymentTransaction[];
        logs: OperationLog[];
      }>(supabase, 'admin_b2b_order_detail', {
        p_order_id: order.id,
      });

      if (result.success) {
        setDetailOrder(result.order);
        setOrderItems(result.items || []);
        setPayments(result.payments || []);
        setLogs(result.logs || []);
      }
    } catch (err: any) {
      toast.error(`加载详情失败: ${err.message}`);
    } finally {
      setDetailLoading(false);
    }
  };

  // ============================================================================
  // Order Actions
  // ============================================================================

  const handleConfirmOrder = async () => {
    if (!detailOrder) return;
    if (!confirm(`确认订单 ${detailOrder.order_number}？将进入备货流程。`)) return;

    setActionLoading(true);
    try {
      const result = await adminRpc<{ success: boolean; message: string }>(
        supabase, 'admin_b2b_confirm_order', {
          p_order_id: detailOrder.id,
          p_idempotency_key: generateIdempotencyKey('confirm'),
        }
      );
      if (result.success) {
        toast.success(result.message || '订单已确认');
        await openDetail(detailOrder);
        fetchOrders();
      }
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleShipOrder = async () => {
    if (!detailOrder) return;
    setActionLoading(true);
    try {
      const result = await adminRpc<{ success: boolean; message: string }>(
        supabase, 'admin_b2b_ship_order', {
          p_order_id: detailOrder.id,
          p_delivery_date: shipDeliveryDate || null,
          p_note: shipNote || null,
          p_idempotency_key: generateIdempotencyKey('ship'),
        }
      );
      if (result.success) {
        toast.success(result.message || '订单已发货');
        setShowShipModal(false);
        await openDetail(detailOrder);
        fetchOrders();
      }
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkDelivered = async () => {
    if (!detailOrder) return;
    if (!confirm(`确认订单 ${detailOrder.order_number} 已签收？（不会自动标记付款）`)) return;

    setActionLoading(true);
    try {
      const result = await adminRpc<{ success: boolean; message: string }>(
        supabase, 'admin_b2b_mark_delivered', {
          p_order_id: detailOrder.id,
          p_idempotency_key: generateIdempotencyKey('deliver'),
        }
      );
      if (result.success) {
        toast.success(result.message || '订单已签收');
        await openDetail(detailOrder);
        fetchOrders();
      }
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!detailOrder) return;
    const reason = prompt('请输入取消原因（选填）:');
    if (reason === null) return; // User clicked cancel

    setActionLoading(true);
    try {
      const result = await adminRpc<{ success: boolean; message: string }>(
        supabase, 'admin_b2b_cancel_order', {
          p_order_id: detailOrder.id,
          p_reason: reason || null,
          p_idempotency_key: generateIdempotencyKey('cancel'),
        }
      );
      if (result.success) {
        toast.success(result.message || '订单已取消');
        await openDetail(detailOrder);
        fetchOrders();
      }
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // ============================================================================
  // Payment Actions
  // ============================================================================

  const handleRecordPayment = async () => {
    if (!detailOrder) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('请输入有效金额');
      return;
    }

    setActionLoading(true);
    try {
      const result = await adminRpc<{ success: boolean; message: string; transaction_id: string }>(
        supabase, 'admin_b2b_record_payment', {
          p_order_id: detailOrder.id,
          p_payment_method: paymentMethod,
          p_amount: amount,
          p_proof_url: paymentProofUrl || null,
          p_note: paymentNote || null,
          p_idempotency_key: generateIdempotencyKey('payment'),
        }
      );
      if (result.success) {
        toast.success(result.message || '收款已登记');
        setShowPaymentModal(false);
        setPaymentAmount('');
        setPaymentNote('');
        setPaymentProofUrl('');
        await openDetail(detailOrder);
      }
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmPayment = async (txId: string) => {
    if (!confirm('确认此笔收款？确认后将计入已收金额。')) return;
    setActionLoading(true);
    try {
      const result = await adminRpc<{ success: boolean; message: string; financial_status: string }>(
        supabase, 'admin_b2b_confirm_payment_tx', {
          p_transaction_id: txId,
          p_decision: 'confirm',
          p_idempotency_key: generateIdempotencyKey('confirm_pay'),
        }
      );
      if (result.success) {
        toast.success(result.message || '收款已确认');
        if (detailOrder) await openDetail(detailOrder);
        fetchOrders();
      }
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectPayment = async (txId: string) => {
    const reason = prompt('请输入驳回原因:');
    if (!reason) return;
    setActionLoading(true);
    try {
      const result = await adminRpc<{ success: boolean; message: string }>(
        supabase, 'admin_b2b_confirm_payment_tx', {
          p_transaction_id: txId,
          p_decision: 'reject',
          p_reason: reason,
          p_idempotency_key: generateIdempotencyKey('reject_pay'),
        }
      );
      if (result.success) {
        toast.success(result.message || '收款已驳回');
        if (detailOrder) await openDetail(detailOrder);
        fetchOrders();
      }
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // ============================================================================
  // Picking Modal
  // ============================================================================

  const [pickingItems, setPickingItems] = useState<Array<{ item_id: string; picked_quantity: number; shortage_quantity: number }>>([]);

  const openPickingModal = () => {
    setPickingItems(
      orderItems
        .filter(i => i.item_status !== 'cancelled' && i.item_status !== 'delivered')
        .map(i => ({
          item_id: i.id,
          picked_quantity: i.picked_quantity || i.ordered_quantity,
          shortage_quantity: i.shortage_quantity || 0,
        }))
    );
    setShowPickingModal(true);
  };

  const handleUpdatePicking = async () => {
    if (!detailOrder) return;
    setActionLoading(true);
    try {
      const result = await adminRpc<{ success: boolean; message: string }>(
        supabase, 'admin_b2b_update_picking', {
          p_order_id: detailOrder.id,
          p_items: JSON.stringify(pickingItems),
          p_idempotency_key: generateIdempotencyKey('picking'),
        }
      );
      if (result.success) {
        toast.success(result.message || '备货数量已更新');
        setShowPickingModal(false);
        await openDetail(detailOrder);
        fetchOrders();
      }
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">B2B 订单管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理批发订单：确认、备货、发货、签收、收款</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="搜索订单号/公司名..."
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
            className="border rounded px-3 py-1.5 text-sm w-48"
          />
          <select
            value={fulfillmentFilter}
            onChange={(e) => { setFulfillmentFilter(e.target.value); setPage(1); }}
            className="border rounded px-3 py-1.5 text-sm"
          >
            <option value="">全部履约状态</option>
            <option value="pending">待确认</option>
            <option value="confirmed">已确认</option>
            <option value="picking">备货中</option>
            <option value="shortage">缺货</option>
            <option value="ready_to_ship">待发货</option>
            <option value="shipping">配送中</option>
            <option value="delivered">已送达</option>
            <option value="cancelled">已取消</option>
          </select>
          <select
            value={financialFilter}
            onChange={(e) => { setFinancialFilter(e.target.value); setPage(1); }}
            className="border rounded px-3 py-1.5 text-sm"
          >
            <option value="">全部财务状态</option>
            <option value="unpaid">未收款</option>
            <option value="partial_paid">部分收款</option>
            <option value="paid">已结清</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-gray-500">暂无订单</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">订单号</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">批发商</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">履约状态</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">财务状态</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">应收</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">已收</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">欠款</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">商品</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">下单时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {orders.map((order) => {
                  const fs = FULFILLMENT_STATUS_MAP[order.fulfillment_status] || { label: order.fulfillment_status, color: 'bg-gray-100' };
                  const fns = FINANCIAL_STATUS_MAP[order.financial_status] || { label: order.financial_status, color: 'bg-gray-100' };
                  return (
                    <tr key={order.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(order)}>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-sm font-medium text-amber-700 hover:text-amber-900">
                          {order.order_number}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{order.wholesaler_company || '-'}</div>
                        <div className="text-xs text-gray-400">{order.wholesaler_phone || order.user_phone || ''}</div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${fs.color}`}>
                          {fs.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${fns.color}`}>
                          {fns.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right text-sm font-medium">
                        TJS {Number(order.receivable_total || order.total_amount).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right text-sm text-green-700 font-medium">
                        TJS {Number(order.paid_total || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right text-sm">
                        <span className={Number(order.balance_due || 0) > 0 ? 'text-red-600 font-bold' : 'text-gray-400'}>
                          TJS {Number(order.balance_due || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600">
                        {order.item_count}种/{order.total_quantity}件
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                        {new Date(order.created_at).toLocaleDateString('zh-CN')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t flex items-center justify-between">
            <span className="text-sm text-gray-500">共 {totalCount} 条，第 {page}/{totalPages} 页</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 text-sm border rounded disabled:opacity-50">上一页</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 text-sm border rounded disabled:opacity-50">下一页</button>
            </div>
          </div>
        )}
      </div>

      {/* ====================================================================== */}
      {/* Order Detail Modal */}
      {/* ====================================================================== */}
      {detailOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">订单详情 - {detailOrder.order_number}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${FULFILLMENT_STATUS_MAP[detailOrder.fulfillment_status]?.color || 'bg-gray-100'}`}>
                    {FULFILLMENT_STATUS_MAP[detailOrder.fulfillment_status]?.label || detailOrder.fulfillment_status}
                  </span>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${FINANCIAL_STATUS_MAP[detailOrder.financial_status]?.color || 'bg-gray-100'}`}>
                    {FINANCIAL_STATUS_MAP[detailOrder.financial_status]?.label || detailOrder.financial_status}
                  </span>
                </div>
              </div>
              <button onClick={() => setDetailOrder(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {detailLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
                    <div>
                      <span className="text-gray-500 block">批发商</span>
                      <span className="font-medium">{detailOrder.wholesaler_company || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">联系电话</span>
                      <span className="font-medium">{detailOrder.wholesaler_phone || detailOrder.user_phone || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">支付方式</span>
                      <span className="font-medium">{PAYMENT_METHOD_MAP[detailOrder.payment_method] || detailOrder.payment_method}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">预计送达</span>
                      <span className="font-medium">{detailOrder.estimated_delivery_date || '-'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500 block">收货地址</span>
                      <span className="font-medium">{detailOrder.delivery_address || '-'}</span>
                    </div>
                    {detailOrder.delivery_note && (
                      <div className="col-span-2">
                        <span className="text-gray-500 block">客户备注</span>
                        <span className="font-medium">{detailOrder.delivery_note}</span>
                      </div>
                    )}
                    {detailOrder.admin_note && (
                      <div className="col-span-2">
                        <span className="text-gray-500 block">管理员备注</span>
                        <span className="font-medium text-orange-700">{detailOrder.admin_note}</span>
                      </div>
                    )}
                  </div>

                  {/* Financial Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <div className="text-xs text-gray-500">应收总额</div>
                      <div className="text-lg font-bold text-gray-900">TJS {Number(detailOrder.receivable_total || detailOrder.total_amount).toFixed(2)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">已收金额</div>
                      <div className="text-lg font-bold text-green-700">TJS {Number(detailOrder.paid_total || 0).toFixed(2)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">剩余欠款</div>
                      <div className={`text-lg font-bold ${Number(detailOrder.balance_due || 0) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        TJS {Number(detailOrder.balance_due || 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">成本状态</div>
                      <div className="text-sm font-medium text-gray-700">{detailOrder.cost_status === 'complete' ? '完整' : detailOrder.cost_status === 'missing' ? '缺失' : detailOrder.cost_status || '-'}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">理论毛利</div>
                      <div className="text-lg font-bold text-blue-700">
                        {detailOrder.expected_gross_profit != null ? `TJS ${Number(detailOrder.expected_gross_profit).toFixed(2)}` : '-'}
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="border-b mb-4">
                    <div className="flex gap-4">
                      <button
                        onClick={() => setActiveTab('items')}
                        className={`pb-2 text-sm font-medium border-b-2 ${activeTab === 'items' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                      >
                        商品明细 ({orderItems.length})
                      </button>
                      <button
                        onClick={() => setActiveTab('payments')}
                        className={`pb-2 text-sm font-medium border-b-2 ${activeTab === 'payments' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                      >
                        收款流水 ({payments.length})
                      </button>
                      <button
                        onClick={() => setActiveTab('logs')}
                        className={`pb-2 text-sm font-medium border-b-2 ${activeTab === 'logs' ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                      >
                        操作日志 ({logs.length})
                      </button>
                    </div>
                  </div>

                  {/* Tab: Items */}
                  {activeTab === 'items' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left">商品</th>
                            <th className="px-3 py-2 text-left">SKU</th>
                            <th className="px-3 py-2 text-center">单位</th>
                            <th className="px-3 py-2 text-right">单价</th>
                            <th className="px-3 py-2 text-center">下单</th>
                            <th className="px-3 py-2 text-center">备货</th>
                            <th className="px-3 py-2 text-center">缺货</th>
                            <th className="px-3 py-2 text-center">发货</th>
                            <th className="px-3 py-2 text-center">签收</th>
                            <th className="px-3 py-2 text-right">小计</th>
                            <th className="px-3 py-2 text-center">状态</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {orderItems.map(item => {
                            const is = ITEM_STATUS_MAP[item.item_status] || { label: item.item_status, color: 'text-gray-600' };
                            return (
                              <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    {item.image_url && (
                                      <img src={item.image_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                      <div className="font-medium text-gray-900 truncate max-w-[200px]" title={item.product_name_zh || item.product_name_original}>
                                        {item.product_name_zh || item.product_name_original || '未知商品'}
                                      </div>
                                      {item.product_name_original && item.product_name_original !== item.product_name_zh && (
                                        <div className="text-xs text-gray-400 truncate max-w-[200px]">{item.product_name_original}</div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500">{item.sku || '-'}</td>
                                <td className="px-3 py-2 text-center text-xs">{item.unit_measure || '件'}</td>
                                <td className="px-3 py-2 text-right">TJS {Number(item.unit_price).toFixed(2)}</td>
                                <td className="px-3 py-2 text-center font-medium">{item.ordered_quantity || item.quantity}</td>
                                <td className="px-3 py-2 text-center">{item.picked_quantity || 0}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={item.shortage_quantity > 0 ? 'text-red-600 font-bold' : ''}>
                                    {item.shortage_quantity || 0}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center">{item.shipped_quantity || 0}</td>
                                <td className="px-3 py-2 text-center">{item.delivered_quantity || 0}</td>
                                <td className="px-3 py-2 text-right font-medium">TJS {Number(item.subtotal).toFixed(2)}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`text-xs font-medium ${is.color}`}>{is.label}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Tab: Payments */}
                  {activeTab === 'payments' && (
                    <div>
                      {payments.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">暂无收款记录</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left">时间</th>
                              <th className="px-3 py-2 text-left">类型</th>
                              <th className="px-3 py-2 text-left">方式</th>
                              <th className="px-3 py-2 text-right">金额</th>
                              <th className="px-3 py-2 text-center">状态</th>
                              <th className="px-3 py-2 text-left">备注</th>
                              <th className="px-3 py-2 text-center">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {payments.map(tx => {
                              const ts = PAYMENT_TX_STATUS_MAP[tx.status] || { label: tx.status, color: 'bg-gray-100' };
                              return (
                                <tr key={tx.id} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 text-xs text-gray-500">
                                    {new Date(tx.created_at).toLocaleString('zh-CN')}
                                  </td>
                                  <td className="px-3 py-2 text-xs">
                                    {tx.transaction_type === 'payment' ? '收款' : tx.transaction_type === 'refund' ? '退款' : '调整'}
                                  </td>
                                  <td className="px-3 py-2 text-xs">
                                    {PAYMENT_METHOD_MAP[tx.payment_method] || tx.payment_method}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium">
                                    TJS {Number(tx.amount).toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${ts.color}`}>
                                      {ts.label}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-500 max-w-[150px] truncate">
                                    {tx.reject_reason || tx.note || '-'}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {tx.status === 'pending' && (
                                      <div className="flex gap-1 justify-center">
                                        <button
                                          onClick={() => handleConfirmPayment(tx.id)}
                                          disabled={actionLoading}
                                          className="px-2 py-0.5 text-xs text-white bg-green-600 hover:bg-green-700 rounded disabled:opacity-50"
                                        >
                                          确认
                                        </button>
                                        <button
                                          onClick={() => handleRejectPayment(tx.id)}
                                          disabled={actionLoading}
                                          className="px-2 py-0.5 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
                                        >
                                          驳回
                                        </button>
                                      </div>
                                    )}
                                    {tx.status !== 'pending' && <span className="text-xs text-gray-400">—</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* Tab: Logs */}
                  {activeTab === 'logs' && (
                    <div>
                      {logs.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">暂无操作日志</div>
                      ) : (
                        <div className="space-y-2">
                          {logs.map(log => (
                            <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded text-sm">
                              <div className="flex-shrink-0 w-2 h-2 mt-1.5 rounded-full bg-amber-400" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900">{log.action}</span>
                                  <span className="text-xs text-gray-400">{log.source}</span>
                                </div>
                                {log.new_value && (
                                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                                    {JSON.stringify(log.new_value).slice(0, 120)}
                                  </div>
                                )}
                              </div>
                              <div className="text-xs text-gray-400 flex-shrink-0">
                                {new Date(log.created_at).toLocaleString('zh-CN')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Action Bar */}
            <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between flex-wrap gap-2">
              <div className="flex gap-2 flex-wrap">
                {/* Confirm Order */}
                {detailOrder.fulfillment_status === 'pending' && (
                  <button
                    onClick={handleConfirmOrder}
                    disabled={actionLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
                  >
                    确认订单
                  </button>
                )}

                {/* Update Picking */}
                {['confirmed', 'picking', 'shortage'].includes(detailOrder.fulfillment_status) && (
                  <button
                    onClick={openPickingModal}
                    disabled={actionLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-50"
                  >
                    更新备货
                  </button>
                )}

                {/* Ship Order */}
                {['confirmed', 'picking', 'shortage', 'ready_to_ship'].includes(detailOrder.fulfillment_status) && (
                  <button
                    onClick={() => { setShipDeliveryDate(''); setShipNote(''); setShowShipModal(true); }}
                    disabled={actionLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded disabled:opacity-50"
                  >
                    确认发货
                  </button>
                )}

                {/* Mark Delivered */}
                {['shipping', 'ready_to_ship'].includes(detailOrder.fulfillment_status) && (
                  <button
                    onClick={handleMarkDelivered}
                    disabled={actionLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded disabled:opacity-50"
                  >
                    确认签收
                  </button>
                )}

                {/* Record Payment */}
                {detailOrder.fulfillment_status !== 'cancelled' && detailOrder.financial_status !== 'paid' && (
                  <button
                    onClick={() => { setPaymentAmount(''); setPaymentNote(''); setPaymentProofUrl(''); setShowPaymentModal(true); }}
                    disabled={actionLoading}
                    className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded disabled:opacity-50"
                  >
                    登记收款
                  </button>
                )}

                {/* Cancel Order */}
                {['pending', 'confirmed', 'picking', 'shortage', 'ready_to_ship'].includes(detailOrder.fulfillment_status) && (
                  <button
                    onClick={handleCancelOrder}
                    disabled={actionLoading}
                    className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded disabled:opacity-50"
                  >
                    取消订单
                  </button>
                )}
              </div>
              <button
                onClick={() => setDetailOrder(null)}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-100"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* Payment Modal */}
      {/* ====================================================================== */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">登记收款</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">收款金额 (TJS) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder={`应收: TJS ${Number(detailOrder?.balance_due || 0).toFixed(2)}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">收款方式</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full border rounded px-3 py-2">
                  <option value="cod_cash">现金</option>
                  <option value="cod_transfer">转账</option>
                  <option value="deposit_transfer">定金转账</option>
                  <option value="mixed">混合支付</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">凭证链接（选填）</label>
                <input
                  type="text"
                  value={paymentProofUrl}
                  onChange={(e) => setPaymentProofUrl(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="转账截图或凭证 URL"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">备注（选填）</label>
                <textarea
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full border rounded px-3 py-2 h-16 resize-none"
                  placeholder="收款备注..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">取消</button>
              <button
                onClick={handleRecordPayment}
                disabled={actionLoading}
                className="px-4 py-2 text-sm text-white bg-amber-600 hover:bg-amber-700 rounded disabled:opacity-50"
              >
                {actionLoading ? '处理中...' : '确认登记'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* Ship Modal */}
      {/* ====================================================================== */}
      {showShipModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">确认发货</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">预计送达日期</label>
                <input
                  type="date"
                  value={shipDeliveryDate}
                  onChange={(e) => setShipDeliveryDate(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">发货备注（选填）</label>
                <textarea
                  value={shipNote}
                  onChange={(e) => setShipNote(e.target.value)}
                  className="w-full border rounded px-3 py-2 h-16 resize-none"
                  placeholder="配送员、物流信息等..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowShipModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">取消</button>
              <button
                onClick={handleShipOrder}
                disabled={actionLoading}
                className="px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded disabled:opacity-50"
              >
                {actionLoading ? '处理中...' : '确认发货'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* Picking Modal */}
      {/* ====================================================================== */}
      {showPickingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">更新备货数量</h3>
            <table className="w-full text-sm mb-4">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">商品</th>
                  <th className="px-3 py-2 text-center">下单数量</th>
                  <th className="px-3 py-2 text-center">备货数量</th>
                  <th className="px-3 py-2 text-center">缺货数量</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orderItems
                  .filter(i => i.item_status !== 'cancelled' && i.item_status !== 'delivered')
                  .map((item, idx) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900 truncate max-w-[200px]">
                          {item.product_name_zh || item.product_name_original || '未知商品'}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center font-medium">{item.ordered_quantity || item.quantity}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min="0"
                          max={item.ordered_quantity || item.quantity}
                          value={pickingItems[idx]?.picked_quantity ?? 0}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setPickingItems(prev => prev.map((p, i) => i === idx ? { ...p, picked_quantity: val } : p));
                          }}
                          className="w-16 border rounded px-2 py-1 text-center"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min="0"
                          max={item.ordered_quantity || item.quantity}
                          value={pickingItems[idx]?.shortage_quantity ?? 0}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setPickingItems(prev => prev.map((p, i) => i === idx ? { ...p, shortage_quantity: val } : p));
                          }}
                          className="w-16 border rounded px-2 py-1 text-center"
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowPickingModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">取消</button>
              <button
                onClick={handleUpdatePicking}
                disabled={actionLoading}
                className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-50"
              >
                {actionLoading ? '处理中...' : '保存备货'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
