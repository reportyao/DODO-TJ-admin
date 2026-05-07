/**
 * B2B 订单管理页面
 * Phase 3: B2B 重构
 *
 * 功能：
 * - 列表展示 b2b_orders 表数据
 * - 支持按状态筛选（pending / confirmed / delivering / completed / cancelled）
 * - 支持设置预计送达日期（状态变为 delivering）
 * - 支持一键"确认收款"（状态变为 completed, payment_status 变为 paid）
 * - 展示订单明细（b2b_order_items）
 */
import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { adminQuery, adminUpdate, adminCount } from '../lib/adminApi';
import toast from 'react-hot-toast';

interface B2BOrder {
  id: string;
  order_number: string;
  user_id: string;
  total_amount: number;
  item_count: number;
  total_quantity: number;
  status: string;
  payment_method: string;
  payment_status: string;
  estimated_delivery_date: string | null;
  delivery_address: string | null;
  delivery_note: string | null;
  admin_note: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
}

interface B2BOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  snapshot_data: {
    name_i18n?: { zh?: string; ru?: string; tg?: string };
    image_url?: string;
    sku?: string;
  } | null;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'bg-yellow-100 text-yellow-800' },
  processing: { label: '处理中', color: 'bg-blue-100 text-blue-800' },
  delivering: { label: '配送中', color: 'bg-purple-100 text-purple-800' },
  delivered: { label: '已送达', color: 'bg-indigo-100 text-indigo-800' },
  paid: { label: '已完成', color: 'bg-green-100 text-green-800' },
  cancelled: { label: '已取消', color: 'bg-gray-100 text-gray-800' },
};

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待付款', color: 'text-orange-600' },
  paid: { label: '已付款', color: 'text-green-600' },
};

export default function B2BOrderManagementPage() {
  const { supabase } = useSupabase();
  const [orders, setOrders] = useState<B2BOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // Detail modal
  const [detailOrder, setDetailOrder] = useState<B2BOrder | null>(null);
  const [orderItems, setOrderItems] = useState<B2BOrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Delivery date modal
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [deliveryTarget, setDeliveryTarget] = useState<B2BOrder | null>(null);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [adminNote, setAdminNote] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const filters = statusFilter !== 'all'
        ? [{ col: 'status', op: 'eq' as const, val: statusFilter }]
        : [];

      const [data, count] = await Promise.all([
        adminQuery<B2BOrder>(supabase, 'b2b_orders', {
          filters,
          orderBy: 'created_at',
          orderAsc: false,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        }),
        adminCount(supabase, 'b2b_orders', filters),
      ]);

      setOrders(data);
      setTotalCount(count);
    } catch (err: any) {
      toast.error(`加载失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase, statusFilter, page]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const fetchOrderItems = async (orderId: string) => {
    setLoadingItems(true);
    try {
      const items = await adminQuery<B2BOrderItem>(supabase, 'b2b_order_items', {
        filters: [{ col: 'order_id', op: 'eq', val: orderId }],
      });
      setOrderItems(items);
    } catch (err: any) {
      toast.error(`加载明细失败: ${err.message}`);
    } finally {
      setLoadingItems(false);
    }
  };

  const openDetail = (order: B2BOrder) => {
    setDetailOrder(order);
    fetchOrderItems(order.id);
  };

  // 确认订单（pending -> processing）
  const handleConfirm = async (order: B2BOrder) => {
    try {
      await adminUpdate(supabase, 'b2b_orders', {
        status: 'processing',
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, [{ col: 'id', op: 'eq', val: order.id }]);
      toast.success('订单已确认');
      fetchOrders();
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    }
  };

  // 设置配送（打开弹窗）
  const openDeliveryModal = (order: B2BOrder) => {
    setDeliveryTarget(order);
    setDeliveryDate(order.estimated_delivery_date || '');
    setAdminNote(order.admin_note || '');
    setDeliveryModalOpen(true);
  };

  // 确认配送
  const handleDeliveryConfirm = async () => {
    if (!deliveryTarget || !deliveryDate) {
      toast.error('请选择预计送达日期');
      return;
    }
    try {
      await adminUpdate(supabase, 'b2b_orders', {
        status: 'delivering',
        estimated_delivery_date: deliveryDate,
        admin_note: adminNote || null,
        updated_at: new Date().toISOString(),
      }, [{ col: 'id', op: 'eq', val: deliveryTarget.id }]);
      toast.success('已设置配送');
      setDeliveryModalOpen(false);
      setDeliveryTarget(null);
      fetchOrders();
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    }
  };

  // 确认送达（delivering -> delivered）
  const handleMarkDelivered = async (order: B2BOrder) => {
    if (!confirm(`确认订单 ${order.order_number} 已送达？`)) return;
    try {
      await adminUpdate(supabase, 'b2b_orders', {
        status: 'delivered',
        updated_at: new Date().toISOString(),
      }, [{ col: 'id', op: 'eq', val: order.id }]);
      toast.success('已标记送达');
      fetchOrders();
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    }
  };

  // 确认收款（delivered -> paid，订单完成）
  const handleCompletePayment = async (order: B2BOrder) => {
    if (!confirm(`确认已收到订单 ${order.order_number} 的货款？`)) return;
    try {
      await adminUpdate(supabase, 'b2b_orders', {
        status: 'paid',
        payment_status: 'paid',
        updated_at: new Date().toISOString(),
      }, [{ col: 'id', op: 'eq', val: order.id }]);
      toast.success('已确认收款，订单完成');
      fetchOrders();
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    }
  };

  // 取消订单
  const handleCancel = async (order: B2BOrder) => {
    if (!confirm(`确认取消订单 ${order.order_number}？`)) return;
    try {
      await adminUpdate(supabase, 'b2b_orders', {
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }, [{ col: 'id', op: 'eq', val: order.id }]);
      toast.success('订单已取消');
      fetchOrders();
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">B2B 订单管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理批发订单，确认发货和收款</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">状态:</span>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="border rounded px-3 py-1.5 text-sm"
          >
            <option value="all">全部</option>
            <option value="pending">待处理</option>
            <option value="processing">处理中</option>
            <option value="delivering">配送中</option>
            <option value="delivered">已送达</option>
            <option value="paid">已完成</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-gray-500">暂无订单</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">订单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">金额</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">商品数</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">付款</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">预计送达</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">下单时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      onClick={() => openDetail(order)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {order.order_number}
                    </button>
                    {order.delivery_address && (
                      <div className="text-xs text-gray-400 max-w-[150px] truncate" title={order.delivery_address}>
                        {order.delivery_address}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm font-bold text-gray-900">TJS {Number(order.total_amount).toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {order.item_count} 种 / {order.total_quantity} 件
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_MAP[order.status]?.color || 'bg-gray-100'}`}>
                      {STATUS_MAP[order.status]?.label || order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-xs font-medium ${PAYMENT_STATUS_MAP[order.payment_status]?.color || 'text-gray-500'}`}>
                      {PAYMENT_STATUS_MAP[order.payment_status]?.label || order.payment_status}
                    </span>
                    <div className="text-xs text-gray-400">{order.payment_method === 'cod' ? '货到付款' : order.payment_method}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {order.estimated_delivery_date || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {new Date(order.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex gap-1 flex-wrap">
                      {order.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleConfirm(order)}
                            className="px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
                          >
                            确认
                          </button>
                          <button
                            onClick={() => handleCancel(order)}
                            className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded"
                          >
                            取消
                          </button>
                        </>
                      )}
                      {order.status === 'processing' && (
                        <button
                          onClick={() => openDeliveryModal(order)}
                          className="px-2 py-1 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded"
                        >
                          发货
                        </button>
                      )}
                      {order.status === 'delivering' && (
                        <button
                          onClick={() => handleMarkDelivered(order)}
                          className="px-2 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded"
                        >
                          确认送达
                        </button>
                      )}
                      {order.status === 'delivered' && order.payment_status !== 'paid' && (
                        <button
                          onClick={() => handleCompletePayment(order)}
                          className="px-2 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded"
                        >
                          确认收款
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t flex items-center justify-between">
            <span className="text-sm text-gray-500">
              共 {totalCount} 条，第 {page + 1}/{totalPages} 页
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {detailOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">订单详情 - {detailOrder.order_number}</h3>
              <button onClick={() => setDetailOrder(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div><span className="text-gray-500">状态:</span> <span className={`font-medium ${STATUS_MAP[detailOrder.status]?.color.replace('bg-', 'text-').replace('-100', '-700') || ''}`}>{STATUS_MAP[detailOrder.status]?.label}</span></div>
              <div><span className="text-gray-500">付款:</span> <span className="font-medium">{PAYMENT_STATUS_MAP[detailOrder.payment_status]?.label} ({detailOrder.payment_method === 'cod' ? '货到付款' : detailOrder.payment_method})</span></div>
              <div><span className="text-gray-500">总金额:</span> <span className="font-bold">TJS {Number(detailOrder.total_amount).toFixed(2)}</span></div>
              <div><span className="text-gray-500">商品:</span> {detailOrder.item_count} 种 / {detailOrder.total_quantity} 件</div>
              <div className="col-span-2"><span className="text-gray-500">收货地址:</span> {detailOrder.delivery_address || '-'}</div>
              {detailOrder.delivery_note && <div className="col-span-2"><span className="text-gray-500">备注:</span> {detailOrder.delivery_note}</div>}
              {detailOrder.admin_note && <div className="col-span-2"><span className="text-gray-500">管理员备注:</span> {detailOrder.admin_note}</div>}
            </div>

            <h4 className="font-medium text-sm mb-2 border-t pt-3">订单明细</h4>
            {loadingItems ? (
              <div className="text-center py-4"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin inline-block" /></div>
            ) : orderItems.length === 0 ? (
              <div className="text-center py-4 text-gray-400">无明细数据</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">商品</th>
                    <th className="px-3 py-2 text-right">单价</th>
                    <th className="px-3 py-2 text-right">数量</th>
                    <th className="px-3 py-2 text-right">小计</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orderItems.map(item => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {item.snapshot_data?.image_url && (
                            <img src={item.snapshot_data.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                          )}
                          <div>
                            <div className="font-medium">{item.snapshot_data?.name_i18n?.ru || item.snapshot_data?.name_i18n?.zh || item.snapshot_data?.name_i18n?.tg || '商品'}</div>
                            {item.snapshot_data?.sku && <div className="text-xs text-gray-400">SKU: {item.snapshot_data.sku}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">TJS {Number(item.unit_price).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right font-medium">TJS {Number(item.subtotal).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Delivery Date Modal */}
      {deliveryModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">设置配送信息</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">预计送达日期 *</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">管理员备注</label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full border rounded px-3 py-2 h-20 resize-none"
                  placeholder="内部备注（可选）"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setDeliveryModalOpen(false); setDeliveryTarget(null); }}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleDeliveryConfirm}
                className="px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded"
              >
                确认发货
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
