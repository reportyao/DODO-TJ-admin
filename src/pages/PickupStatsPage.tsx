import React, { useState, useEffect } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';

interface PickupStats {
  total_prizes: number;
  pending_claim: number;
  pending_pickup: number;
  picked_up: number;
  expired: number;
  // 分类统计
  lottery_total: number;
  lottery_pending_claim: number;
  lottery_pending_pickup: number;
  lottery_picked_up: number;
  lottery_expired: number;
  groupbuy_total: number;
  groupbuy_pending_claim: number;
  groupbuy_pending_pickup: number;
  groupbuy_picked_up: number;
  groupbuy_expired: number;
  fullpurchase_total: number;
  fullpurchase_pending_claim: number;
  fullpurchase_pending_pickup: number;
  fullpurchase_picked_up: number;
  fullpurchase_expired: number;
}

interface PickupRecord {
  id: string;
  pickup_code: string;
  picked_up_at: string;
  picked_up_by: string;
  source: 'lottery' | 'groupbuy' | 'fullpurchase';
  user_id: string;
  product_name: string;
}

interface DailyStats {
  date: string;
  count: number;
  lottery_count: number;
  groupbuy_count: number;
  fullpurchase_count: number;
}

export default function PickupStatsPage() {
  const { supabase } = useSupabase();
  const [stats, setStats] = useState<PickupStats>({
    total_prizes: 0,
    pending_claim: 0,
    pending_pickup: 0,
    picked_up: 0,
    expired: 0,
    lottery_total: 0,
    lottery_pending_claim: 0,
    lottery_pending_pickup: 0,
    lottery_picked_up: 0,
    lottery_expired: 0,
    groupbuy_total: 0,
    groupbuy_pending_claim: 0,
    groupbuy_pending_pickup: 0,
    groupbuy_picked_up: 0,
    groupbuy_expired: 0,
    fullpurchase_total: 0,
    fullpurchase_pending_claim: 0,
    fullpurchase_pending_pickup: 0,
    fullpurchase_picked_up: 0,
    fullpurchase_expired: 0,
  });
  const [recentRecords, setRecentRecords] = useState<PickupRecord[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [viewMode, setViewMode] = useState<'all' | 'lottery' | 'groupbuy' | 'fullpurchase'>('all');

  // 加载统计数据
  const loadStats = async () => {
    setLoading(true);
    try {
      // 使用数据库端 count 聚合，避免全量加载导致 Supabase 1000 条限制截断数据
      const countByStatus = async (table: string, statuses: string[]) => {
        const results = await Promise.all(
          statuses.map(s =>
            supabase.from(table).select('id', { count: 'exact', head: true }).eq('pickup_status', s)
          )
        );
        return results.map(r => r.count || 0);
      };

      // 1. 获取抽奖奖品统计 (prizes表)
      const [lotteryTotal, lotteryPendingClaim, lotteryPendingPickup, lotteryPickedUp, lotteryExpired] = await Promise.all([
        supabase.from('prizes').select('id', { count: 'exact', head: true }).then(r => r.count || 0),
        supabase.from('prizes').select('id', { count: 'exact', head: true }).or('pickup_status.eq.PENDING_CLAIM,pickup_status.is.null').then(r => r.count || 0),
        supabase.from('prizes').select('id', { count: 'exact', head: true }).eq('pickup_status', 'PENDING_PICKUP').then(r => r.count || 0),
        supabase.from('prizes').select('id', { count: 'exact', head: true }).eq('pickup_status', 'PICKED_UP').then(r => r.count || 0),
        supabase.from('prizes').select('id', { count: 'exact', head: true }).eq('pickup_status', 'EXPIRED').then(r => r.count || 0),
      ]);
      const lotteryStats = { total: lotteryTotal, pending_claim: lotteryPendingClaim, pending_pickup: lotteryPendingPickup, picked_up: lotteryPickedUp, expired: lotteryExpired };

      // 2. 获取拼团结果统计 (group_buy_results表)
      const [gbTotal, gbPendingClaim, gbPendingPickup, gbPickedUp, gbExpired] = await Promise.all([
        supabase.from('group_buy_results').select('id', { count: 'exact', head: true }).then(r => r.count || 0),
        supabase.from('group_buy_results').select('id', { count: 'exact', head: true }).or('pickup_status.eq.PENDING_CLAIM,pickup_status.is.null').then(r => r.count || 0),
        supabase.from('group_buy_results').select('id', { count: 'exact', head: true }).eq('pickup_status', 'PENDING_PICKUP').then(r => r.count || 0),
        supabase.from('group_buy_results').select('id', { count: 'exact', head: true }).eq('pickup_status', 'PICKED_UP').then(r => r.count || 0),
        supabase.from('group_buy_results').select('id', { count: 'exact', head: true }).eq('pickup_status', 'EXPIRED').then(r => r.count || 0),
      ]);
      const groupBuyStats = { total: gbTotal, pending_claim: gbPendingClaim, pending_pickup: gbPendingPickup, picked_up: gbPickedUp, expired: gbExpired };

      // 3. 获取全款购买统计 (full_purchase_orders表)
      const [fpTotal, fpPendingClaim, fpPendingPickup, fpPickedUp, fpExpired] = await Promise.all([
        supabase.from('full_purchase_orders').select('id', { count: 'exact', head: true }).then(r => r.count || 0),
        supabase.from('full_purchase_orders').select('id', { count: 'exact', head: true }).or('pickup_status.eq.PENDING_CLAIM,pickup_status.is.null').then(r => r.count || 0),
        supabase.from('full_purchase_orders').select('id', { count: 'exact', head: true }).in('pickup_status', ['PENDING_PICKUP', 'PENDING']).then(r => r.count || 0),
        supabase.from('full_purchase_orders').select('id', { count: 'exact', head: true }).eq('pickup_status', 'PICKED_UP').then(r => r.count || 0),
        supabase.from('full_purchase_orders').select('id', { count: 'exact', head: true }).eq('pickup_status', 'EXPIRED').then(r => r.count || 0),
      ]);
      const fullPurchaseStats = { total: fpTotal, pending_claim: fpPendingClaim, pending_pickup: fpPendingPickup, picked_up: fpPickedUp, expired: fpExpired };

      // 4. 合并统计数据
      const combinedStats: PickupStats = {
        total_prizes: lotteryStats.total + groupBuyStats.total + fullPurchaseStats.total,
        pending_claim: lotteryStats.pending_claim + groupBuyStats.pending_claim + fullPurchaseStats.pending_claim,
        pending_pickup: lotteryStats.pending_pickup + groupBuyStats.pending_pickup + fullPurchaseStats.pending_pickup,
        picked_up: lotteryStats.picked_up + groupBuyStats.picked_up + fullPurchaseStats.picked_up,
        expired: lotteryStats.expired + groupBuyStats.expired + fullPurchaseStats.expired,
        lottery_total: lotteryStats.total,
        lottery_pending_claim: lotteryStats.pending_claim,
        lottery_pending_pickup: lotteryStats.pending_pickup,
        lottery_picked_up: lotteryStats.picked_up,
        lottery_expired: lotteryStats.expired,
        groupbuy_total: groupBuyStats.total,
        groupbuy_pending_claim: groupBuyStats.pending_claim,
        groupbuy_pending_pickup: groupBuyStats.pending_pickup,
        groupbuy_picked_up: groupBuyStats.picked_up,
        groupbuy_expired: groupBuyStats.expired,
        fullpurchase_total: fullPurchaseStats.total,
        fullpurchase_pending_claim: fullPurchaseStats.pending_claim,
        fullpurchase_pending_pickup: fullPurchaseStats.pending_pickup,
        fullpurchase_picked_up: fullPurchaseStats.picked_up,
        fullpurchase_expired: fullPurchaseStats.expired,
      };
      setStats(combinedStats);

      // 5. 获取最近核销记录 - 从三个表查询
      const records: PickupRecord[] = [];

      // 从prizes表获取
      const { data: lotteryPickups } = await supabase
        .from('prizes')
        .select('id, pickup_code, picked_up_at, picked_up_by, user_id, prize_name')
        .eq('pickup_status', 'PICKED_UP')
        .not('picked_up_at', 'is', null)
        .order('picked_up_at', { ascending: false })
        .limit(20);

      (lotteryPickups || []).forEach((item: any) => {
        records.push({
          id: item.id,
          pickup_code: item.pickup_code || '',
          picked_up_at: item.picked_up_at,
          picked_up_by: item.picked_up_by || '',
          source: 'lottery',
          user_id: item.user_id || '',
          product_name: item.prize_name || '抽奖奖品',
        });
      });

      // 从group_buy_results表获取
      const { data: groupBuyPickups } = await supabase
        .from('group_buy_results')
        .select('id, pickup_code, picked_up_at, picked_up_by, winner_id')
        .eq('pickup_status', 'PICKED_UP')
        .not('picked_up_at', 'is', null)
        .order('picked_up_at', { ascending: false })
        .limit(20);

      (groupBuyPickups || []).forEach((item: any) => {
        records.push({
          id: item.id,
          pickup_code: item.pickup_code || '',
          picked_up_at: item.picked_up_at,
          picked_up_by: item.picked_up_by || '',
          source: 'groupbuy',
          user_id: item.winner_id || '',
          product_name: '拼团商品',
        });
      });

      // 从full_purchase_orders表获取
      const { data: fullPurchasePickups } = await supabase
        .from('full_purchase_orders')
        .select('id, pickup_code, picked_up_at, picked_up_by, user_id')
        .eq('pickup_status', 'PICKED_UP')
        .not('picked_up_at', 'is', null)
        .order('picked_up_at', { ascending: false })
        .limit(20);

      (fullPurchasePickups || []).forEach((item: any) => {
        records.push({
          id: item.id,
          pickup_code: item.pickup_code || '',
          picked_up_at: item.picked_up_at,
          picked_up_by: item.picked_up_by || '',
          source: 'fullpurchase',
          user_id: item.user_id || '',
          product_name: '全款购买',
        });
      });

      // 按时间排序并取前20条
      records.sort((a, b) => new Date(b.picked_up_at).getTime() - new Date(a.picked_up_at).getTime());
      setRecentRecords(records.slice(0, 20));

      // 6. 获取每日核销统计
      const daysAgo = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 365;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      // 从prizes表获取已提货记录
      const { data: lotteryDailyPickups } = await supabase
        .from('prizes')
        .select('picked_up_at')
        .eq('pickup_status', 'PICKED_UP')
        .gte('picked_up_at', startDate.toISOString());

      // 从group_buy_results表获取已提货记录
      const { data: groupBuyDailyPickups } = await supabase
        .from('group_buy_results')
        .select('picked_up_at')
        .eq('pickup_status', 'PICKED_UP')
        .gte('picked_up_at', startDate.toISOString());

      // 从full_purchase_orders表获取已提货记录
      const { data: fullPurchaseDailyPickups } = await supabase
        .from('full_purchase_orders')
        .select('picked_up_at')
        .eq('pickup_status', 'PICKED_UP')
        .gte('picked_up_at', startDate.toISOString());

      // 按日期分组统计
      const dailyMap: { [key: string]: { lottery: number; groupbuy: number; fullpurchase: number } } = {};
      
      (lotteryDailyPickups || []).forEach((item: any) => {
        if (item.picked_up_at) {
          const date = new Date(item.picked_up_at).toISOString().split('T')[0];
          if (!dailyMap[date]) {
            dailyMap[date] = { lottery: 0, groupbuy: 0, fullpurchase: 0 };
          }
          dailyMap[date].lottery += 1;
        }
      });

      (groupBuyDailyPickups || []).forEach((item: any) => {
        if (item.picked_up_at) {
          const date = new Date(item.picked_up_at).toISOString().split('T')[0];
          if (!dailyMap[date]) {
            dailyMap[date] = { lottery: 0, groupbuy: 0, fullpurchase: 0 };
          }
          dailyMap[date].groupbuy += 1;
        }
      });

      (fullPurchaseDailyPickups || []).forEach((item: any) => {
        if (item.picked_up_at) {
          const date = new Date(item.picked_up_at).toISOString().split('T')[0];
          if (!dailyMap[date]) {
            dailyMap[date] = { lottery: 0, groupbuy: 0, fullpurchase: 0 };
          }
          dailyMap[date].fullpurchase += 1;
        }
      });

      const dailyStatsArray = Object.entries(dailyMap)
        .map(([date, counts]) => ({ 
          date, 
          count: counts.lottery + counts.groupbuy + counts.fullpurchase,
          lottery_count: counts.lottery,
          groupbuy_count: counts.groupbuy,
          fullpurchase_count: counts.fullpurchase,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      setDailyStats(dailyStatsArray);
    } catch (error) {
      console.error('加载统计数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [dateRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  // 根据视图模式过滤数据
  const filteredRecords = viewMode === 'all' 
    ? recentRecords 
    : recentRecords.filter(r => r.source === viewMode);

  const filteredDailyStats = dailyStats.map(day => {
    if (viewMode === 'lottery') {
      return { ...day, count: day.lottery_count };
    } else if (viewMode === 'groupbuy') {
      return { ...day, count: day.groupbuy_count };
    } else if (viewMode === 'fullpurchase') {
      return { ...day, count: day.fullpurchase_count };
    }
    return day;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">核销统计</h1>
        <button
          onClick={loadStats}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          刷新数据
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500">总订单</div>
          <div className="text-3xl font-bold text-gray-900">{stats.total_prizes}</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500">待领取</div>
          <div className="text-3xl font-bold text-yellow-600">{stats.pending_claim}</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500">待提货</div>
          <div className="text-3xl font-bold text-blue-600">{stats.pending_pickup}</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500">已核销</div>
          <div className="text-3xl font-bold text-green-600">{stats.picked_up}</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500">已过期</div>
          <div className="text-3xl font-bold text-red-600">{stats.expired}</div>
        </div>
      </div>

      {/* 分类统计 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">抽奖奖品</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">总数:</span>
              <span className="font-semibold">{stats.lottery_total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">已核销:</span>
              <span className="font-semibold text-green-600">{stats.lottery_picked_up}</span>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">拼团商品</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">总数:</span>
              <span className="font-semibold">{stats.groupbuy_total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">已核销:</span>
              <span className="font-semibold text-green-600">{stats.groupbuy_picked_up}</span>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">全款购买</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">总数:</span>
              <span className="font-semibold">{stats.fullpurchase_total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">已核销:</span>
              <span className="font-semibold text-green-600">{stats.fullpurchase_picked_up}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 视图模式切换 */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('all')}
          className={`px-4 py-2 rounded-lg ${viewMode === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          全部
        </button>
        <button
          onClick={() => setViewMode('lottery')}
          className={`px-4 py-2 rounded-lg ${viewMode === 'lottery' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          抽奖
        </button>
        <button
          onClick={() => setViewMode('groupbuy')}
          className={`px-4 py-2 rounded-lg ${viewMode === 'groupbuy' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          拼团
        </button>
        <button
          onClick={() => setViewMode('fullpurchase')}
          className={`px-4 py-2 rounded-lg ${viewMode === 'fullpurchase' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          全款购买
        </button>
      </div>

      {/* 每日核销趋势 */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">每日核销趋势</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setDateRange('7d')}
              className={`px-3 py-1 rounded ${dateRange === '7d' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            >
              近7天
            </button>
            <button
              onClick={() => setDateRange('30d')}
              className={`px-3 py-1 rounded ${dateRange === '30d' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            >
              近30天
            </button>
            <button
              onClick={() => setDateRange('all')}
              className={`px-3 py-1 rounded ${dateRange === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            >
              全部
            </button>
          </div>
        </div>
        {filteredDailyStats.length > 0 ? (
          <div className="space-y-2">
            {filteredDailyStats.map(day => (
              <div key={day.date} className="flex items-center gap-4">
                <div className="w-24 text-sm text-gray-600">{day.date}</div>
                <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                  <div
                    className="bg-blue-600 h-6 rounded-full flex items-center justify-end pr-2"
                    style={{ width: `${Math.min(100, (day.count / Math.max(...filteredDailyStats.map(d => d.count))) * 100)}%` }}
                  >
                    <span className="text-white text-sm font-semibold">{day.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">暂无数据</div>
        )}
      </div>

      {/* 今日核销记录 */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">最近核销记录</h2>
        {filteredRecords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">提货码</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">商品</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">核销时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRecords.map(record => (
                  <tr key={record.id}>
                    <td className="px-4 py-3 text-sm font-mono">{record.pickup_code}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${
                        record.source === 'lottery' ? 'bg-purple-100 text-purple-800' :
                        record.source === 'groupbuy' ? 'bg-green-100 text-green-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {record.source === 'lottery' ? '抽奖' : record.source === 'groupbuy' ? '拼团' : '全款购买'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{record.product_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(record.picked_up_at).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">暂无核销记录</div>
        )}
      </div>
    </div>
  );
}
