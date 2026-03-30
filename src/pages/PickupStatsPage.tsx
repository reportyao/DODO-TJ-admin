import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import {
  RefreshCw,
  Package,
  CheckCircle,
  Clock,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Gift,
  ShoppingBag,
  TrendingUp,
  Calendar,
  User,
  MapPin,
  Image as ImageIcon,
  X,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================
interface OverviewStats {
  total: number;
  pickedUp: number;
  pendingPickup: number;
  pendingClaim: number;
  expired: number;
}

interface CategoryStats {
  lottery: OverviewStats;
  fullPurchase: OverviewStats;
}

interface OrderItem {
  id: string;
  pickupCode: string;
  productName: string;
  productImage: string;
  sourceType: 'lottery' | 'full_purchase';
  pickupStatus: string;
  userName: string;
  userPhone: string;
  pickupPointName: string;
  operatorName: string;
  pickedUpAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  totalAmount: number | null;
}

type TabKey = 'all' | 'picked_up' | 'pending_pickup' | 'pending_claim' | 'expired';

const PAGE_SIZE = 15;

// ============================================================
// Helpers
// ============================================================
const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  PICKED_UP:      { label: '已核销', color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  PENDING_PICKUP: { label: '待提货', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  PENDING:        { label: '待提货', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  READY_FOR_PICKUP: { label: '待提货', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  PENDING_CLAIM:  { label: '待领取', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
  EXPIRED:        { label: '已过期', color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
};

function getStatusBadge(status: string | null) {
  const cfg = statusConfig[status || 'PENDING_CLAIM'] || statusConfig['PENDING_CLAIM'];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function formatTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('zh-CN');
}

// ============================================================
// Component
// ============================================================
export default function PickupStatsPage() {
  const { supabase } = useSupabase();

  // --- State ---
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<OverviewStats>({ total: 0, pickedUp: 0, pendingPickup: 0, pendingClaim: 0, expired: 0 });
  const [category, setCategory] = useState<CategoryStats>({
    lottery: { total: 0, pickedUp: 0, pendingPickup: 0, pendingClaim: 0, expired: 0 },
    fullPurchase: { total: 0, pickedUp: 0, pendingPickup: 0, pendingClaim: 0, expired: 0 },
  });
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'lottery' | 'full_purchase'>('all');
  const [detailOrder, setDetailOrder] = useState<OrderItem | null>(null);

  // ============================================================
  // Data Loading — Stats
  // ============================================================
  const loadStats = useCallback(async () => {
    // Helper: count with filter
    const cnt = async (table: string, filter?: (q: any) => any) => {
      let q = supabase.from(table).select('id', { count: 'exact', head: true });
      if (filter) q = filter(q);
      const { count } = await q;
      return count || 0;
    };

    const [
      lTotal, lPickedUp, lPendingPickup, lPendingClaim, lExpired,
      fTotal, fPickedUp, fPendingPickup, fPendingClaim, fExpired,
    ] = await Promise.all([
      cnt('prizes'),
      cnt('prizes', q => q.eq('pickup_status', 'PICKED_UP')),
      cnt('prizes', q => q.eq('pickup_status', 'PENDING_PICKUP')),
      cnt('prizes', q => q.or('pickup_status.eq.PENDING_CLAIM,pickup_status.is.null')),
      cnt('prizes', q => q.eq('pickup_status', 'EXPIRED')),
      cnt('full_purchase_orders'),
      cnt('full_purchase_orders', q => q.eq('pickup_status', 'PICKED_UP')),
      cnt('full_purchase_orders', q => q.in('pickup_status', ['PENDING_PICKUP', 'PENDING', 'READY_FOR_PICKUP'])),
      cnt('full_purchase_orders', q => q.or('pickup_status.eq.PENDING_CLAIM,pickup_status.is.null')),
      cnt('full_purchase_orders', q => q.eq('pickup_status', 'EXPIRED')),
    ]);

    const lottery: OverviewStats = { total: lTotal, pickedUp: lPickedUp, pendingPickup: lPendingPickup, pendingClaim: lPendingClaim, expired: lExpired };
    const fullPurchase: OverviewStats = { total: fTotal, pickedUp: fPickedUp, pendingPickup: fPendingPickup, pendingClaim: fPendingClaim, expired: fExpired };

    setCategory({ lottery, fullPurchase });
    setOverview({
      total: lottery.total + fullPurchase.total,
      pickedUp: lottery.pickedUp + fullPurchase.pickedUp,
      pendingPickup: lottery.pendingPickup + fullPurchase.pendingPickup,
      pendingClaim: lottery.pendingClaim + fullPurchase.pendingClaim,
      expired: lottery.expired + fullPurchase.expired,
    });
  }, [supabase]);

  // ============================================================
  // Data Loading — Order List
  // ============================================================
  const loadOrders = useCallback(async () => {
    const offset = (page - 1) * PAGE_SIZE;
    const results: OrderItem[] = [];
    let totalCount = 0;

    // Build status filters based on active tab
    const statusFilters: Record<TabKey, (q: any, table: 'prizes' | 'fpo') => any> = {
      all: (q) => q,
      picked_up: (q) => q.eq('pickup_status', 'PICKED_UP'),
      pending_pickup: (q, table) => table === 'prizes'
        ? q.eq('pickup_status', 'PENDING_PICKUP')
        : q.in('pickup_status', ['PENDING_PICKUP', 'PENDING', 'READY_FOR_PICKUP']),
      pending_claim: (q) => q.or('pickup_status.eq.PENDING_CLAIM,pickup_status.is.null'),
      expired: (q) => q.eq('pickup_status', 'EXPIRED'),
    };

    const applySearch = (q: any, codeField = 'pickup_code') => {
      if (searchTerm.trim()) {
        q = q.ilike(codeField, `%${searchTerm.trim()}%`);
      }
      return q;
    };

    // Decide which sources to query
    const querySources = sourceFilter === 'all' ? ['lottery', 'full_purchase'] : [sourceFilter];

    // --- Prizes (lottery) ---
    if (querySources.includes('lottery')) {
      let q = supabase.from('prizes').select('id, pickup_code, prize_name, prize_image, pickup_status, user_id, pickup_point_id, picked_up_at, picked_up_by, expires_at, created_at, lottery_id', { count: 'exact' });
      q = statusFilters[activeTab](q, 'prizes');
      q = applySearch(q);
      q = q.order('created_at', { ascending: false });

      if (sourceFilter !== 'all') {
        q = q.range(offset, offset + PAGE_SIZE - 1);
      }

      const { data, count } = await q;
      totalCount += count || 0;

      // Batch fetch lottery info for product names/images
      const lotteryIds = [...new Set((data || []).filter((d: any) => d.lottery_id).map((d: any) => d.lottery_id))];
      let lotteryMap: Record<string, any> = {};
      if (lotteryIds.length > 0) {
        const { data: lotteries } = await supabase.from('lotteries').select('id, title, image_url').in('id', lotteryIds);
        if (lotteries) lotteries.forEach((l: any) => { lotteryMap[l.id] = l; });
      }

      // Batch fetch user info
      const userIds = [...new Set((data || []).filter((d: any) => d.user_id).map((d: any) => d.user_id))];
      let userMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase.from('users').select('id, first_name, phone_number').in('id', userIds);
        if (users) users.forEach((u: any) => { userMap[u.id] = u; });
      }

      // Batch fetch operator info
      const operatorIds = [...new Set((data || []).filter((d: any) => d.picked_up_by).map((d: any) => String(d.picked_up_by)))];
      let operatorMap: Record<string, any> = {};
      if (operatorIds.length > 0) {
        const { data: ops } = await supabase.from('users').select('id, first_name, phone_number').in('id', operatorIds);
        if (ops) ops.forEach((u: any) => { operatorMap[u.id] = u; });
      }

      // Batch fetch pickup point info
      const pointIds = [...new Set((data || []).filter((d: any) => d.pickup_point_id).map((d: any) => d.pickup_point_id))];
      let pointMap: Record<string, any> = {};
      if (pointIds.length > 0) {
        const { data: points } = await supabase.from('pickup_points').select('id, name').in('id', pointIds);
        if (points) points.forEach((p: any) => { pointMap[p.id] = p; });
      }

      (data || []).forEach((item: any) => {
        const lottery = lotteryMap[item.lottery_id] || {};
        const user = userMap[item.user_id] || {};
        const operator = operatorMap[String(item.picked_up_by)] || {};
        const point = pointMap[item.pickup_point_id] || {};
        results.push({
          id: item.id,
          pickupCode: item.pickup_code || '',
          productName: item.prize_name || lottery.title || '抽奖奖品',
          productImage: item.prize_image || lottery.image_url || '',
          sourceType: 'lottery',
          pickupStatus: item.pickup_status || 'PENDING_CLAIM',
          userName: user.first_name || '',
          userPhone: user.phone_number || '',
          pickupPointName: point.name || '',
          operatorName: operator.first_name || '',
          pickedUpAt: item.picked_up_at,
          expiresAt: item.expires_at,
          createdAt: item.created_at,
          totalAmount: null,
        });
      });
    }

    // --- Full Purchase Orders ---
    if (querySources.includes('full_purchase')) {
      let q = supabase.from('full_purchase_orders').select('id, pickup_code, pickup_status, user_id, pickup_point_id, picked_up_at, picked_up_by, expires_at, created_at, metadata, lottery_id, total_amount', { count: 'exact' });
      q = statusFilters[activeTab](q, 'fpo');
      q = applySearch(q);
      q = q.order('created_at', { ascending: false });

      if (sourceFilter !== 'all') {
        q = q.range(offset, offset + PAGE_SIZE - 1);
      }

      const { data, count } = await q;
      totalCount += count || 0;

      // Batch fetch lottery info for fallback names
      const lotteryIds = [...new Set((data || []).filter((d: any) => d.lottery_id).map((d: any) => d.lottery_id))];
      let lotteryMap: Record<string, any> = {};
      if (lotteryIds.length > 0) {
        const { data: lotteries } = await supabase.from('lotteries').select('id, title, image_url').in('id', lotteryIds);
        if (lotteries) lotteries.forEach((l: any) => { lotteryMap[l.id] = l; });
      }

      // Batch fetch user info
      const userIds = [...new Set((data || []).filter((d: any) => d.user_id).map((d: any) => d.user_id))];
      let userMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase.from('users').select('id, first_name, phone_number').in('id', userIds);
        if (users) users.forEach((u: any) => { userMap[u.id] = u; });
      }

      // Batch fetch operator info
      const operatorIds = [...new Set((data || []).filter((d: any) => d.picked_up_by).map((d: any) => String(d.picked_up_by)))];
      let operatorMap: Record<string, any> = {};
      if (operatorIds.length > 0) {
        const { data: ops } = await supabase.from('users').select('id, first_name, phone_number').in('id', operatorIds);
        if (ops) ops.forEach((u: any) => { operatorMap[u.id] = u; });
      }

      // Batch fetch pickup point info
      const pointIds = [...new Set((data || []).filter((d: any) => d.pickup_point_id).map((d: any) => d.pickup_point_id))];
      let pointMap: Record<string, any> = {};
      if (pointIds.length > 0) {
        const { data: points } = await supabase.from('pickup_points').select('id, name').in('id', pointIds);
        if (points) points.forEach((p: any) => { pointMap[p.id] = p; });
      }

      (data || []).forEach((item: any) => {
        const meta = item.metadata || {};
        const lottery = lotteryMap[item.lottery_id] || {};
        const user = userMap[item.user_id] || {};
        const operator = operatorMap[String(item.picked_up_by)] || {};
        const point = pointMap[item.pickup_point_id] || {};
        results.push({
          id: item.id,
          pickupCode: item.pickup_code || '',
          productName: meta.product_title || lottery.title || '全款购买商品',
          productImage: meta.product_image || lottery.image_url || '',
          sourceType: 'full_purchase',
          pickupStatus: item.pickup_status || 'PENDING_CLAIM',
          userName: user.first_name || '',
          userPhone: user.phone_number || '',
          pickupPointName: point.name || '',
          operatorName: operator.first_name || '',
          pickedUpAt: item.picked_up_at,
          expiresAt: item.expires_at,
          createdAt: item.created_at,
          totalAmount: item.total_amount,
        });
      });
    }

    // Sort by created_at desc, then paginate for 'all' source
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (sourceFilter === 'all') {
      setOrders(results.slice(offset, offset + PAGE_SIZE));
    } else {
      setOrders(results);
    }
    setOrderTotal(totalCount);
  }, [supabase, activeTab, page, searchTerm, sourceFilter]);

  // ============================================================
  // Effects
  // ============================================================
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadStats(), loadOrders()]);
      } catch (e) {
        console.error('加载数据失败:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loading) {
      loadOrders();
    }
  }, [activeTab, page, sourceFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadStats(), loadOrders()]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    loadOrders();
  };

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(orderTotal / PAGE_SIZE));

  // ============================================================
  // Stat cards config
  // ============================================================
  const statCards = [
    { key: 'all',            label: '全部订单', value: overview.total,         icon: Package,        color: 'text-gray-700',  bgIcon: 'bg-gray-100' },
    { key: 'picked_up',      label: '已核销',   value: overview.pickedUp,      icon: CheckCircle,    color: 'text-green-700', bgIcon: 'bg-green-100' },
    { key: 'pending_pickup',  label: '待提货',   value: overview.pendingPickup, icon: Clock,          color: 'text-blue-700',  bgIcon: 'bg-blue-100' },
    { key: 'pending_claim',   label: '待领取',   value: overview.pendingClaim,  icon: AlertTriangle,  color: 'text-yellow-700',bgIcon: 'bg-yellow-100' },
    { key: 'expired',        label: '已过期',   value: overview.expired,       icon: AlertTriangle,  color: 'text-red-700',   bgIcon: 'bg-red-100' },
  ];

  // ============================================================
  // Render
  // ============================================================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
        <span className="ml-3 text-gray-500 text-lg">加载核销数据中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">核销统计</h1>
          <p className="text-sm text-gray-500 mt-1">实时监控所有提货订单的核销状态与进度</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 disabled:opacity-50 transition"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* ===== Overview Stat Cards (clickable to filter) ===== */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map(card => {
          const Icon = card.icon;
          const isActive = activeTab === card.key;
          return (
            <button
              key={card.key}
              onClick={() => handleTabChange(card.key as TabKey)}
              className={`relative bg-white p-5 rounded-xl shadow-sm border-2 transition-all text-left hover:shadow-md ${
                isActive ? 'border-blue-500 ring-2 ring-blue-100' : 'border-transparent'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-lg ${card.bgIcon}`}>
                  <Icon className={`w-5 h-5 ${card.color}`} />
                </div>
                {isActive && <div className="w-2 h-2 rounded-full bg-blue-500" />}
              </div>
              <div className="text-3xl font-bold text-gray-900">{card.value}</div>
              <div className="text-sm text-gray-500 mt-1">{card.label}</div>
              {overview.total > 0 && card.key !== 'all' && (
                <div className="mt-2">
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${
                        card.key === 'picked_up' ? 'bg-green-500' :
                        card.key === 'pending_pickup' ? 'bg-blue-500' :
                        card.key === 'pending_claim' ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.round((card.value / overview.total) * 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{Math.round((card.value / overview.total) * 100)}%</div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ===== Category Breakdown ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Lottery */}
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Gift className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">抽奖奖品</h3>
              <p className="text-xs text-gray-500">来自积分商城抽奖</p>
            </div>
            <div className="ml-auto text-2xl font-bold text-gray-900">{category.lottery.total}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-green-50 rounded-lg p-2">
              <div className="text-lg font-bold text-green-700">{category.lottery.pickedUp}</div>
              <div className="text-xs text-green-600">已核销</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-2">
              <div className="text-lg font-bold text-blue-700">{category.lottery.pendingPickup}</div>
              <div className="text-xs text-blue-600">待提货</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-2">
              <div className="text-lg font-bold text-yellow-700">{category.lottery.pendingClaim}</div>
              <div className="text-xs text-yellow-600">待领取</div>
            </div>
            <div className="bg-red-50 rounded-lg p-2">
              <div className="text-lg font-bold text-red-700">{category.lottery.expired}</div>
              <div className="text-xs text-red-600">已过期</div>
            </div>
          </div>
        </div>

        {/* Full Purchase */}
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ShoppingBag className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">全款购买</h3>
              <p className="text-xs text-gray-500">来自全款购买订单</p>
            </div>
            <div className="ml-auto text-2xl font-bold text-gray-900">{category.fullPurchase.total}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-green-50 rounded-lg p-2">
              <div className="text-lg font-bold text-green-700">{category.fullPurchase.pickedUp}</div>
              <div className="text-xs text-green-600">已核销</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-2">
              <div className="text-lg font-bold text-blue-700">{category.fullPurchase.pendingPickup}</div>
              <div className="text-xs text-blue-600">待提货</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-2">
              <div className="text-lg font-bold text-yellow-700">{category.fullPurchase.pendingClaim}</div>
              <div className="text-xs text-yellow-600">待领取</div>
            </div>
            <div className="bg-red-50 rounded-lg p-2">
              <div className="text-lg font-bold text-red-700">{category.fullPurchase.expired}</div>
              <div className="text-xs text-red-600">已过期</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Order Detail List ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {/* List Header */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">
              订单明细
              <span className="ml-2 text-sm font-normal text-gray-500">
                共 {orderTotal} 条
              </span>
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Source filter */}
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                {[
                  { key: 'all', label: '全部' },
                  { key: 'lottery', label: '抽奖' },
                  { key: 'full_purchase', label: '全款' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => { setSourceFilter(opt.key as any); setPage(1); }}
                    className={`px-3 py-1.5 text-sm rounded-md transition ${
                      sourceFilter === opt.key ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索提货码..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>
              <button onClick={handleSearch} className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition">
                搜索
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">商品</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">提货码</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">自提点</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">核销时间</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>暂无数据</p>
                  </td>
                </tr>
              ) : (
                orders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50 transition">
                    {/* Product */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {order.productImage ? (
                          <img src={order.productImage} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <span className="text-sm font-medium text-gray-900 max-w-[160px] truncate" title={order.productName}>
                          {order.productName}
                        </span>
                      </div>
                    </td>
                    {/* Pickup Code */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-semibold text-gray-900">{order.pickupCode}</span>
                    </td>
                    {/* Source Type */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        order.sourceType === 'lottery' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {order.sourceType === 'lottery' ? <Gift className="w-3 h-3" /> : <ShoppingBag className="w-3 h-3" />}
                        {order.sourceType === 'lottery' ? '抽奖' : '全款'}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">{getStatusBadge(order.pickupStatus)}</td>
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <div className="text-gray-900">{order.userName || '-'}</div>
                        <div className="text-xs text-gray-500">{order.userPhone || ''}</div>
                      </div>
                    </td>
                    {/* Pickup Point */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 max-w-[120px] truncate block" title={order.pickupPointName}>
                        {order.pickupPointName || '-'}
                      </span>
                    </td>
                    {/* Picked Up At */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{formatTime(order.pickedUpAt)}</span>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setDetailOrder(order)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="查看详情"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {orderTotal > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
            <div className="text-sm text-gray-500">
              第 {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, orderTotal)} 条，共 {orderTotal} 条
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-700 px-2">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== Detail Modal ===== */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailOrder(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">订单详情</h3>
              <button onClick={() => setDetailOrder(null)} className="p-1 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {/* Modal Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Product Info */}
              <div className="flex items-center gap-4">
                {detailOrder.productImage ? (
                  <img src={detailOrder.productImage} alt="" className="w-20 h-20 rounded-xl object-cover border border-gray-200" />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                <div>
                  <div className="font-semibold text-gray-900 text-lg">{detailOrder.productName}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      detailOrder.sourceType === 'lottery' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      {detailOrder.sourceType === 'lottery' ? '抽奖' : '全款购买'}
                    </span>
                    {getStatusBadge(detailOrder.pickupStatus)}
                  </div>
                  {detailOrder.totalAmount && (
                    <div className="text-sm text-gray-500 mt-1">金额: ¥{detailOrder.totalAmount}</div>
                  )}
                </div>
              </div>

              {/* Detail Grid */}
              <div className="grid grid-cols-2 gap-4">
                <DetailField icon={<Package className="w-4 h-4" />} label="提货码" value={detailOrder.pickupCode} mono />
                <DetailField icon={<User className="w-4 h-4" />} label="用户" value={`${detailOrder.userName} ${detailOrder.userPhone}`} />
                <DetailField icon={<MapPin className="w-4 h-4" />} label="自提点" value={detailOrder.pickupPointName || '-'} />
                <DetailField icon={<User className="w-4 h-4" />} label="核销员" value={detailOrder.operatorName || '-'} />
                <DetailField icon={<Calendar className="w-4 h-4" />} label="创建时间" value={formatTime(detailOrder.createdAt)} />
                <DetailField icon={<CheckCircle className="w-4 h-4" />} label="核销时间" value={formatTime(detailOrder.pickedUpAt)} />
                <DetailField icon={<Clock className="w-4 h-4" />} label="过期时间" value={formatDate(detailOrder.expiresAt)} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================
function DetailField({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 text-gray-400">{icon}</div>
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className={`text-sm text-gray-900 ${mono ? 'font-mono font-semibold' : ''}`}>{value || '-'}</div>
      </div>
    </div>
  );
}
