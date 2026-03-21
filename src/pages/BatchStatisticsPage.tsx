import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Package, 
  Truck, 
  CheckCircle, 
  Clock,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';
import toast from 'react-hot-toast';

interface BatchStatistics {
  total_batches: number;
  in_transit_china_batches: number;
  in_transit_tj_batches: number;
  arrived_batches: number;
  cancelled_batches: number;
  total_orders: number;
  pending_shipment_orders: number;
  in_transit_orders: number;
  ready_for_pickup_orders: number;
  picked_up_orders: number;
  normal_orders: number;
  missing_orders: number;
  damaged_orders: number;
  avg_transit_days: number | null;
  on_time_rate: number | null;
  pickup_rate: number | null;
  avg_pickup_days: number | null;
  recent_batches: Array<{
    date: string;
    count: number;
  }>;
  top_skus: Array<{
    sku: string;
    name: string;
    count: number;
  }>;
}

export default function BatchStatisticsPage() {
  const { supabase } = useSupabase();
  const navigate = useNavigate();

  const [statistics, setStatistics] = useState<BatchStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('30');

  const fetchStatistics = useCallback(async () => {
    try {
      setLoading(true);

      // 由于Edge Function可能还未部署，这里直接查询数据库
      const stats: BatchStatistics = {
        total_batches: 0,
        in_transit_china_batches: 0,
        in_transit_tj_batches: 0,
        arrived_batches: 0,
        cancelled_batches: 0,
        total_orders: 0,
        pending_shipment_orders: 0,
        in_transit_orders: 0,
        ready_for_pickup_orders: 0,
        picked_up_orders: 0,
        normal_orders: 0,
        missing_orders: 0,
        damaged_orders: 0,
        avg_transit_days: null,
        on_time_rate: null,
        pickup_rate: null,
        avg_pickup_days: null,
        recent_batches: [],
        top_skus: [],
      };

      // 批次统计 - 使用数据库端 COUNT 聚合（避免全量加载被 Supabase 1000 条限制截断）
      const batchStatuses = ['IN_TRANSIT_CHINA', 'IN_TRANSIT_TAJIKISTAN', 'ARRIVED', 'CANCELLED'];
      const batchCountResults = await Promise.all(
        batchStatuses.map(status =>
          supabase.from('shipment_batches').select('id', { count: 'exact', head: true }).eq('status', status)
        )
      );
      const [inTransitChinaRes, inTransitTjRes, arrivedRes, cancelledRes] = batchCountResults;
      stats.in_transit_china_batches = inTransitChinaRes.count || 0;
      stats.in_transit_tj_batches = inTransitTjRes.count || 0;
      stats.arrived_batches = arrivedRes.count || 0;
      stats.cancelled_batches = cancelledRes.count || 0;

      const { count: totalBatches } = await supabase
        .from('shipment_batches')
        .select('id', { count: 'exact', head: true });
      stats.total_batches = totalBatches || 0;

      // 计算平均运输天数（只加载已到达批次的时间字段）
      const { data: arrivedBatches } = await supabase
        .from('shipment_batches')
        .select('shipped_at, arrived_at, estimated_arrival_date')
        .eq('status', 'ARRIVED')
        .not('shipped_at', 'is', null)
        .not('arrived_at', 'is', null);

      if (arrivedBatches && arrivedBatches.length > 0) {
        let totalTransitDays = 0;
        let onTimeCount = 0;
        for (const batch of arrivedBatches) {
          const shippedDate = new Date(batch.shipped_at);
          const arrivedDate = new Date(batch.arrived_at);
          const d = (arrivedDate.getTime() - shippedDate.getTime()) / (1000 * 60 * 60 * 24);
          totalTransitDays += d;
          if (batch.estimated_arrival_date && arrivedDate <= new Date(batch.estimated_arrival_date)) {
            onTimeCount++;
          }
        }
        stats.avg_transit_days = Math.round((totalTransitDays / arrivedBatches.length) * 10) / 10;
        stats.on_time_rate = Math.round((onTimeCount / arrivedBatches.length) * 100);
      }

      // 订单统计 - 使用数据库端 COUNT 聚合
      const arrivalStatuses = ['NORMAL', 'MISSING', 'DAMAGED'];
      const [totalItemsRes, ...arrivalResults] = await Promise.all([
        supabase.from('batch_order_items').select('id', { count: 'exact', head: true }),
        ...arrivalStatuses.map(s =>
          supabase.from('batch_order_items').select('id', { count: 'exact', head: true }).eq('arrival_status', s)
        ),
      ]);
      stats.total_orders = totalItemsRes.count || 0;
      stats.normal_orders = arrivalResults[0].count || 0;
      stats.missing_orders = arrivalResults[1].count || 0;
      stats.damaged_orders = arrivalResults[2].count || 0;

      // Top SKU 统计（限制加载 200 条以计算 Top 10）
      const { data: skuItems } = await supabase
        .from('batch_order_items')
        .select('product_sku, product_name')
        .not('product_sku', 'is', null)
        .limit(200);

      if (skuItems) {
        const skuCounts: Record<string, { name: string; count: number }> = {};
        for (const item of skuItems) {
          if (item.product_sku) {
            if (!skuCounts[item.product_sku]) {
              skuCounts[item.product_sku] = { name: item.product_name || '', count: 0 };
            }
            skuCounts[item.product_sku].count++;
          }
        }
        stats.top_skus = Object.entries(skuCounts)
          .map(([sku, data]) => ({ sku, name: data.name, count: data.count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      }

      // 待发货订单统计
      const [fpPending, prizePending, gbPending] = await Promise.all([
        supabase
          .from('full_purchase_orders')
          .select('id', { count: 'exact', head: true })
          .or('logistics_status.is.null,logistics_status.eq.PENDING_SHIPMENT')
          .is('batch_id', null),
        supabase
          .from('prizes')
          .select('id', { count: 'exact', head: true })
          .or('logistics_status.is.null,logistics_status.eq.PENDING_SHIPMENT')
          .is('batch_id', null)
          .eq('status', 'CLAIMED'),
        supabase
          .from('group_buy_results')
          .select('id', { count: 'exact', head: true })
          .or('logistics_status.is.null,logistics_status.eq.PENDING_SHIPMENT')
          .is('batch_id', null),
      ]);

      stats.pending_shipment_orders = (fpPending.count || 0) + (prizePending.count || 0) + (gbPending.count || 0);

      // 运输中订单统计
      const [fpTransit, prizeTransit, gbTransit] = await Promise.all([
        supabase
          .from('full_purchase_orders')
          .select('id', { count: 'exact', head: true })
          .in('logistics_status', ['IN_TRANSIT_CHINA', 'IN_TRANSIT_TAJIKISTAN']),
        supabase
          .from('prizes')
          .select('id', { count: 'exact', head: true })
          .in('logistics_status', ['IN_TRANSIT_CHINA', 'IN_TRANSIT_TAJIKISTAN']),
        supabase
          .from('group_buy_results')
          .select('id', { count: 'exact', head: true })
          .in('logistics_status', ['IN_TRANSIT_CHINA', 'IN_TRANSIT_TAJIKISTAN']),
      ]);

      stats.in_transit_orders = (fpTransit.count || 0) + (prizeTransit.count || 0) + (gbTransit.count || 0);

      // 待提货订单统计
      const [fpPickup, prizePickup, gbPickup] = await Promise.all([
        supabase
          .from('full_purchase_orders')
          .select('id', { count: 'exact', head: true })
          .eq('logistics_status', 'READY_FOR_PICKUP'),
        supabase
          .from('prizes')
          .select('id', { count: 'exact', head: true })
          .eq('logistics_status', 'READY_FOR_PICKUP'),
        supabase
          .from('group_buy_results')
          .select('id', { count: 'exact', head: true })
          .eq('logistics_status', 'READY_FOR_PICKUP'),
      ]);

      stats.ready_for_pickup_orders = (fpPickup.count || 0) + (prizePickup.count || 0) + (gbPickup.count || 0);

      // 已提货订单统计
      const [fpPickedUp, prizePickedUp, gbPickedUp] = await Promise.all([
        supabase
          .from('full_purchase_orders')
          .select('id', { count: 'exact', head: true })
          .eq('logistics_status', 'PICKED_UP'),
        supabase
          .from('prizes')
          .select('id', { count: 'exact', head: true })
          .eq('logistics_status', 'PICKED_UP'),
        supabase
          .from('group_buy_results')
          .select('id', { count: 'exact', head: true })
          .eq('logistics_status', 'PICKED_UP'),
      ]);

      stats.picked_up_orders = (fpPickedUp.count || 0) + (prizePickedUp.count || 0) + (gbPickedUp.count || 0);

      // 提货率
      const totalReadyAndPickedUp = stats.ready_for_pickup_orders + stats.picked_up_orders;
      if (totalReadyAndPickedUp > 0) {
        stats.pickup_rate = Math.round((stats.picked_up_orders / totalReadyAndPickedUp) * 100);
      }

      // 近期批次趋势
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));
      
      const { data: recentBatches } = await supabase
        .from('shipment_batches')
        .select('created_at')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (recentBatches) {
        const dailyCounts: Record<string, number> = {};
        for (const batch of recentBatches) {
          const date = batch.created_at.split('T')[0];
          dailyCounts[date] = (dailyCounts[date] || 0) + 1;
        }
        stats.recent_batches = Object.entries(dailyCounts).map(([date, count]) => ({
          date,
          count,
        }));
      }

      setStatistics(stats);
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
      toast.error('获取统计数据失败');
    } finally {
      setLoading(false);
    }
  }, [supabase, days]);

  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!statistics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">暂无数据</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/shipment-batches')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold">批次统计</h1>
            <p className="text-gray-500 mt-1">发货批次和订单统计数据</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">最近7天</SelectItem>
              <SelectItem value="30">最近30天</SelectItem>
              <SelectItem value="90">最近90天</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchStatistics}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 批次统计 */}
      <div>
        <h2 className="text-lg font-semibold mb-4">批次统计</h2>
        <div className="grid grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Package className="w-8 h-8 text-gray-500" />
                <div>
                  <div className="text-2xl font-bold">{statistics.total_batches}</div>
                  <div className="text-gray-500 text-sm">总批次数</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Truck className="w-8 h-8 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold text-blue-600">{statistics.in_transit_china_batches}</div>
                  <div className="text-gray-500 text-sm">中国段运输中</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Truck className="w-8 h-8 text-yellow-500" />
                <div>
                  <div className="text-2xl font-bold text-yellow-600">{statistics.in_transit_tj_batches}</div>
                  <div className="text-gray-500 text-sm">塔国段运输中</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <div>
                  <div className="text-2xl font-bold text-green-600">{statistics.arrived_batches}</div>
                  <div className="text-gray-500 text-sm">已到达</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-500" />
                <div>
                  <div className="text-2xl font-bold text-red-600">{statistics.cancelled_batches}</div>
                  <div className="text-gray-500 text-sm">已取消</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 订单统计 */}
      <div>
        <h2 className="text-lg font-semibold mb-4">订单统计</h2>
        <div className="grid grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{statistics.pending_shipment_orders}</div>
              <div className="text-gray-500 text-sm">待发货</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">{statistics.in_transit_orders}</div>
              <div className="text-gray-500 text-sm">运输中</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">{statistics.ready_for_pickup_orders}</div>
              <div className="text-gray-500 text-sm">待提货</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{statistics.picked_up_orders}</div>
              <div className="text-gray-500 text-sm">已提货</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{statistics.total_orders}</div>
              <div className="text-gray-500 text-sm">批次总订单</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 到货统计 */}
      <div>
        <h2 className="text-lg font-semibold mb-4">到货统计</h2>
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <div>
                  <div className="text-2xl font-bold text-green-600">{statistics.normal_orders}</div>
                  <div className="text-gray-500 text-sm">正常到货</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-500" />
                <div>
                  <div className="text-2xl font-bold text-red-600">{statistics.missing_orders}</div>
                  <div className="text-gray-500 text-sm">缺货</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-yellow-500" />
                <div>
                  <div className="text-2xl font-bold text-yellow-600">{statistics.damaged_orders}</div>
                  <div className="text-gray-500 text-sm">损坏</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 时效统计 */}
      <div>
        <h2 className="text-lg font-semibold mb-4">时效统计</h2>
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="w-8 h-8 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">
                    {statistics.avg_transit_days !== null ? `${statistics.avg_transit_days} 天` : '-'}
                  </div>
                  <div className="text-gray-500 text-sm">平均运输时长</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">
                    {statistics.on_time_rate !== null ? `${statistics.on_time_rate}%` : '-'}
                  </div>
                  <div className="text-gray-500 text-sm">准时到达率</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">
                    {statistics.pickup_rate !== null ? `${statistics.pickup_rate}%` : '-'}
                  </div>
                  <div className="text-gray-500 text-sm">提货率</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 热门SKU */}
      {statistics.top_skus.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>热门SKU (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {statistics.top_skus.map((sku, index) => (
                <div key={sku.sku} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </span>
                    <div>
                      <div className="font-medium">{sku.name}</div>
                      <div className="text-xs text-gray-500">SKU: {sku.sku}</div>
                    </div>
                  </div>
                  <div className="font-bold">{sku.count} 件</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
