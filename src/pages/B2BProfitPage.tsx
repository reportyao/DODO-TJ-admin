/**
 * B2B 利润看板页面 (P1-5 / P1-6)
 *
 * 功能:
 *   P1-5: 利润重算入口 — 基于成本快照、签收数量、退款、折让计算利润
 *         成本缺失时不显示虚假利润；利润来源可解释
 *   P1-6: 利润看板 — 展示订单、客户、商品维度利润
 *         可筛选成本缺失、低毛利、负利润、异常订单
 *
 * 路由: /b2b-profit
 */
import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { adminRpc } from '../lib/adminApi';
import toast from 'react-hot-toast';

// ============================================================================
// Types
// ============================================================================
interface ProfitSummary {
  total_orders: number;
  total_revenue: number;
  total_paid: number;
  total_balance_due: number;
  total_cost: number;
  total_gross_profit: number;
  cost_complete_count: number;
  cost_missing_count: number;
  avg_gross_margin: number | null;
}

interface CustomerProfit {
  user_id: string;
  customer_name: string;
  order_count: number;
  total_revenue: number;
  total_paid: number;
  total_balance_due: number;
  total_profit: number;
  cost_missing_count: number;
  avg_gross_margin: number | null;
}

interface ProductProfit {
  product_id: string;
  product_name: string;
  sku: string | null;
  total_quantity: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  order_count: number;
  gross_margin: number | null;
}

interface ProfitOrder {
  id: string;
  order_number: string;
  user_id: string;
  customer_name: string;
  fulfillment_status: string;
  financial_status: string;
  receivable_total: number;
  paid_total: number;
  balance_due: number;
  total_cost_amount: number | null;
  gross_profit_amount: number | null;
  expected_gross_profit: number | null;
  cost_status: string;
  profit_status: string;
  gross_margin_pct: number | null;
  item_count: number;
  total_quantity: number;
  created_at: string;
}

// ============================================================================
// Constants
// ============================================================================
const COST_STATUS_MAP: Record<string, { label: string; color: string }> = {
  complete:   { label: '成本完整', color: 'bg-green-100 text-green-700' },
  partial:    { label: '部分缺失', color: 'bg-yellow-100 text-yellow-700' },
  missing:    { label: '成本缺失', color: 'bg-red-100 text-red-700' },
  overridden: { label: '已覆盖',   color: 'bg-blue-100 text-blue-700' },
};

const FULFILLMENT_STATUS_MAP: Record<string, string> = {
  pending:        '待确认',
  confirmed:      '已确认',
  picking:        '备货中',
  shortage:       '缺货',
  ready_to_ship:  '待发货',
  shipping:       '配送中',
  delivered:      '已签收',
  cancelled:      '已取消',
  closed:         '已关闭',
};

function formatAmount(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(1) + '%';
}

function generateIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================================
// Sub-component: Summary Cards
// ============================================================================
function SummaryCards({ summary }: { summary: ProfitSummary | null }) {
  if (!summary) return null;
  const margin = summary.avg_gross_margin;
  const marginColor = margin == null ? 'text-gray-500' : margin >= 30 ? 'text-green-700' : margin >= 15 ? 'text-yellow-700' : 'text-red-700';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
      <div className="bg-white border rounded-xl p-3 text-center">
        <div className="text-xl font-bold text-gray-800">{summary.total_orders}</div>
        <div className="text-xs text-gray-500 mt-0.5">订单总数</div>
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
        <div className="text-lg font-bold text-blue-800">{formatAmount(summary.total_revenue)}</div>
        <div className="text-xs text-blue-600 mt-0.5">应收总额 TJS</div>
      </div>
      <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
        <div className="text-lg font-bold text-green-800">{formatAmount(summary.total_paid)}</div>
        <div className="text-xs text-green-600 mt-0.5">已收总额 TJS</div>
      </div>
      <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center">
        <div className="text-lg font-bold text-orange-800">{formatAmount(summary.total_balance_due)}</div>
        <div className="text-xs text-orange-600 mt-0.5">待收余额 TJS</div>
      </div>
      <div className="bg-gray-50 border rounded-xl p-3 text-center">
        <div className="text-lg font-bold text-gray-800">{formatAmount(summary.total_cost)}</div>
        <div className="text-xs text-gray-500 mt-0.5">成本合计 TJS</div>
      </div>
      <div className={`border rounded-xl p-3 text-center ${(summary.total_gross_profit || 0) >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
        <div className={`text-lg font-bold ${(summary.total_gross_profit || 0) >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
          {formatAmount(summary.total_gross_profit)}
        </div>
        <div className={`text-xs mt-0.5 ${(summary.total_gross_profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>毛利合计 TJS</div>
      </div>
      <div className="bg-white border rounded-xl p-3 text-center">
        <div className={`text-xl font-bold ${marginColor}`}>{formatPct(margin)}</div>
        <div className="text-xs text-gray-500 mt-0.5">平均毛利率</div>
        <div className="text-xs text-gray-400 mt-0.5">
          {summary.cost_missing_count > 0 && (
            <span className="text-red-500">{summary.cost_missing_count} 单成本缺失</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-component: Recalculate Modal (P1-5)
// ============================================================================
function RecalculateModal({
  onClose,
  onDone,
  supabase,
}: {
  onClose: () => void;
  onDone: () => void;
  supabase: any;
}) {
  const [mode, setMode] = useState<'single' | 'batch'>('batch');
  const [orderId, setOrderId] = useState('');
  const [costFilter, setCostFilter] = useState('missing');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleRecalc = async () => {
    setLoading(true);
    setResult(null);
    try {
      if (mode === 'single') {
        if (!orderId.trim()) { toast.error('请输入订单 ID'); setLoading(false); return; }
        const res = await adminRpc<any>(supabase, 'admin_b2b_recalculate_profit', {
          p_order_id: orderId.trim(),
          p_reason: '手动重算',
          p_idempotency_key: generateIdempotencyKey('recalc'),
        });
        setResult(res);
        if (res.success) toast.success(res.message || '重算完成');
      } else {
        const res = await adminRpc<any>(supabase, 'admin_b2b_batch_recalculate_profit', {
          p_cost_status_filter: costFilter,
        });
        setResult(res);
        if (res.success) toast.success(res.message || '批量重算完成');
      }
      onDone();
    } catch (err: any) {
      toast.error(`重算失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">利润重算</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            重算基于：成本价快照 × 签收数量，扣除退货和已审批调整。成本缺失时利润为空（不按 0 计算）。
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setMode('batch')}
              className={`flex-1 py-2 text-sm rounded-lg border font-medium ${mode === 'batch' ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              批量重算
            </button>
            <button
              onClick={() => setMode('single')}
              className={`flex-1 py-2 text-sm rounded-lg border font-medium ${mode === 'single' ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              单订单重算
            </button>
          </div>
          {mode === 'batch' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">重算范围</label>
              <select
                value={costFilter}
                onChange={e => setCostFilter(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="missing">仅成本缺失订单（推荐）</option>
                <option value="partial">仅部分成本缺失</option>
                <option value="all">全部订单（最多 500 条）</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">订单 ID（UUID）</label>
              <input
                type="text"
                value={orderId}
                onChange={e => setOrderId(e.target.value)}
                placeholder="粘贴订单 UUID"
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          {result && (
            <div className="bg-gray-50 border rounded-lg p-3 text-sm">
              {mode === 'batch' ? (
                <div className="space-y-1">
                  <div>总计: <strong>{result.total}</strong> 条</div>
                  <div className="text-green-700">成功: <strong>{result.success_count}</strong></div>
                  {result.fail_count > 0 && <div className="text-red-600">失败: <strong>{result.fail_count}</strong></div>}
                </div>
              ) : (
                <div className="space-y-1">
                  <div>毛利: <strong>{formatAmount(result.gross_profit)} TJS</strong></div>
                  <div>总收入: {formatAmount(result.total_revenue)} TJS</div>
                  <div>总成本: {formatAmount(result.total_cost)} TJS</div>
                  <div>成本状态: <strong>{COST_STATUS_MAP[result.cost_status]?.label || result.cost_status}</strong></div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">关闭</button>
          <button
            onClick={handleRecalc}
            disabled={loading}
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '重算中...' : '开始重算'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================
export default function B2BProfitPage() {
  const { supabase } = useSupabase();
  const [summary, setSummary] = useState<ProfitSummary | null>(null);
  const [byCustomer, setByCustomer] = useState<CustomerProfit[]>([]);
  const [byProduct, setByProduct] = useState<ProductProfit[]>([]);
  const [orders, setOrders] = useState<ProfitOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'customer' | 'product'>('overview');
  const [showRecalcModal, setShowRecalcModal] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [costStatusFilter, setCostStatusFilter] = useState('');
  const [profitFilter, setProfitFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 20;

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRpc<{
        success: boolean;
        summary: ProfitSummary;
        by_customer: CustomerProfit[];
        by_product: ProductProfit[];
      }>(supabase, 'admin_b2b_profit_dashboard', {
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_customer_id: customerId || null,
      });
      if (result.success) {
        setSummary(result.summary);
        setByCustomer(result.by_customer || []);
        setByProduct(result.by_product || []);
      }
    } catch (err: any) {
      toast.error(`加载看板失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase, dateFrom, dateTo, customerId]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const result = await adminRpc<{
        success: boolean;
        data: ProfitOrder[];
        total: number;
      }>(supabase, 'admin_b2b_profit_order_list', {
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_customer_id: customerId || null,
        p_cost_status: costStatusFilter || null,
        p_profit_filter: profitFilter || null,
        p_page: page,
        p_page_size: PAGE_SIZE,
      });
      if (result.success) {
        setOrders(result.data || []);
        setTotalCount(result.total || 0);
      }
    } catch (err: any) {
      toast.error(`加载订单失败: ${err.message}`);
    } finally {
      setOrdersLoading(false);
    }
  }, [supabase, dateFrom, dateTo, customerId, costStatusFilter, profitFilter, page]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    if (activeTab === 'orders') loadOrders();
  }, [activeTab, loadOrders]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">利润看板</h1>
          <p className="text-sm text-gray-500 mt-1">基于成本快照的订单、客户、商品维度利润分析</p>
        </div>
        <button
          onClick={() => setShowRecalcModal(true)}
          className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 font-medium"
        >
          ⟳ 利润重算
        </button>
      </div>

      {/* Global Filters */}
      <div className="bg-white border rounded-xl p-4 mb-5 flex flex-wrap gap-3 items-center">
        <input
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-gray-400 text-sm">至</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => { setDateFrom(''); setDateTo(''); setCustomerId(''); setPage(1); }}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border rounded-lg"
        >
          重置
        </button>
        <div className="ml-auto text-xs text-gray-400">
          {summary?.cost_missing_count != null && summary.cost_missing_count > 0 && (
            <span className="text-red-500 font-medium">⚠️ {summary.cost_missing_count} 笔订单成本缺失，建议重算</span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <div className="flex items-center justify-center h-24 text-gray-400 mb-6">加载中...</div>
      ) : (
        <SummaryCards summary={summary} />
      )}

      {/* Tabs */}
      <div className="flex border-b mb-4">
        {[
          { key: 'overview', label: '总览' },
          { key: 'orders',   label: `订单明细 (${totalCount})` },
          { key: 'customer', label: '客户维度' },
          { key: 'product',  label: '商品维度' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px ${activeTab === tab.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Customers */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-800">客户利润 Top 10</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">客户</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">应收</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">毛利</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">毛利率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byCustomer.slice(0, 10).map(c => (
                  <tr key={c.user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-800 max-w-[120px] truncate">
                      {c.customer_name}
                      {c.cost_missing_count > 0 && (
                        <span className="ml-1 text-xs text-red-500">({c.cost_missing_count}缺)</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700">{formatAmount(c.total_revenue)}</td>
                    <td className={`px-4 py-2 text-right font-medium ${(c.total_profit || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatAmount(c.total_profit)}
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${c.avg_gross_margin == null ? 'text-gray-400' : c.avg_gross_margin >= 20 ? 'text-green-700' : 'text-red-600'}`}>
                      {formatPct(c.avg_gross_margin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top Products */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-800">商品利润 Top 10</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">商品</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">销量</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">毛利</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">毛利率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byProduct.slice(0, 10).map(p => (
                  <tr key={p.product_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-800 max-w-[140px]">
                      <div className="truncate">{p.product_name}</div>
                      {p.sku && <div className="text-xs text-gray-400 font-mono">{p.sku}</div>}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700">{p.total_quantity}</td>
                    <td className={`px-4 py-2 text-right font-medium ${(p.total_profit || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatAmount(p.total_profit)}
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${p.gross_margin == null ? 'text-gray-400' : p.gross_margin >= 20 ? 'text-green-700' : 'text-red-600'}`}>
                      {formatPct(p.gross_margin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <div>
          {/* Order Filters */}
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <select
              value={costStatusFilter}
              onChange={e => { setCostStatusFilter(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部成本状态</option>
              {Object.entries(COST_STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={profitFilter}
              onChange={e => { setProfitFilter(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部利润状态</option>
              <option value="cost_missing">成本缺失</option>
              <option value="negative">负利润</option>
              <option value="low_margin">低毛利率（&lt;20%）</option>
            </select>
            <div className="ml-auto text-sm text-gray-500">共 {totalCount} 笔</div>
          </div>

          <div className="bg-white border rounded-xl overflow-hidden">
            {ordersLoading ? (
              <div className="flex items-center justify-center h-32 text-gray-400">加载中...</div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                <div className="text-3xl mb-2">📊</div>
                <div>暂无符合条件的订单</div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">订单号</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">客户</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">履约状态</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">成本状态</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">应收</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">成本</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">毛利</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">毛利率</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">下单时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map(order => {
                    const costInfo = COST_STATUS_MAP[order.cost_status] || { label: order.cost_status, color: 'bg-gray-100 text-gray-600' };
                    const marginColor = order.gross_margin_pct == null ? 'text-gray-400'
                      : order.gross_margin_pct < 0 ? 'text-red-700'
                      : order.gross_margin_pct < 15 ? 'text-yellow-700'
                      : 'text-green-700';
                    return (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-blue-600 text-xs">{order.order_number}</td>
                        <td className="px-4 py-3 text-gray-700 max-w-[120px] truncate">{order.customer_name}</td>
                        <td className="px-4 py-3 text-center text-xs text-gray-600">
                          {FULFILLMENT_STATUS_MAP[order.fulfillment_status] || order.fulfillment_status}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${costInfo.color}`}>
                            {costInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-800">{formatAmount(order.receivable_total)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{formatAmount(order.total_cost_amount)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${(order.gross_profit_amount || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {formatAmount(order.gross_profit_amount)}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${marginColor}`}>
                          {formatPct(order.gross_margin_pct)}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {new Date(order.created_at).toLocaleDateString('zh-CN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

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
        </div>
      )}

      {activeTab === 'customer' && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">客户名称</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">订单数</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">应收总额</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">已收总额</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">待收余额</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">毛利合计</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">平均毛利率</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">成本缺失</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {byCustomer.map(c => (
                <tr key={c.user_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{c.customer_name}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{c.order_count}</td>
                  <td className="px-4 py-3 text-right text-gray-800">{formatAmount(c.total_revenue)}</td>
                  <td className="px-4 py-3 text-right text-green-700">{formatAmount(c.total_paid)}</td>
                  <td className={`px-4 py-3 text-right ${(c.total_balance_due || 0) > 0 ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
                    {formatAmount(c.total_balance_due)}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${(c.total_profit || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatAmount(c.total_profit)}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${c.avg_gross_margin == null ? 'text-gray-400' : c.avg_gross_margin >= 20 ? 'text-green-700' : c.avg_gross_margin >= 0 ? 'text-yellow-700' : 'text-red-700'}`}>
                    {formatPct(c.avg_gross_margin)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.cost_missing_count > 0 ? (
                      <span className="text-xs text-red-600 font-medium">{c.cost_missing_count} 笔</span>
                    ) : (
                      <span className="text-xs text-green-600">✓</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'product' && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">商品名称</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">SKU</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">订单数</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">销量</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">销售额</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">成本合计</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">毛利合计</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">毛利率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {byProduct.map(p => (
                <tr key={p.product_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-800 max-w-[200px] truncate">{p.product_name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.sku || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{p.order_count}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{p.total_quantity}</td>
                  <td className="px-4 py-3 text-right text-gray-800">{formatAmount(p.total_revenue)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatAmount(p.total_cost)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${(p.total_profit || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatAmount(p.total_profit)}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${p.gross_margin == null ? 'text-gray-400' : p.gross_margin >= 20 ? 'text-green-700' : p.gross_margin >= 0 ? 'text-yellow-700' : 'text-red-700'}`}>
                    {formatPct(p.gross_margin)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recalculate Modal */}
      {showRecalcModal && (
        <RecalculateModal
          onClose={() => setShowRecalcModal(false)}
          onDone={loadDashboard}
          supabase={supabase}
        />
      )}
    </div>
  );
}
