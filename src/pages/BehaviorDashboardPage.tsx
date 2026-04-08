/**
 * 行为数据看板页面
 *
 * 展示首页场景化改造的用户行为数据：
 * - 概览卡片（PV/UV、点击率、转化率）
 * - 事件分布表格
 * - 专题/分类维度分析
 * - 时间范围筛选
 *
 * 参照 ChannelAnalyticsPage 的分析看板模式。
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, RefreshCw, Eye, MousePointer, TrendingUp,
  ArrowUp, ArrowDown, Minus, Clock, Users, ShoppingCart,
  Layers, Target, Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { useSupabase } from '../contexts/SupabaseContext';
import toast from 'react-hot-toast';
import type { BehaviorEventName, I18nText } from '../types/homepage';

// ============================================================
// Types
// ============================================================
type TimeRange = 'today' | 'week' | 'month';

interface OverviewStats {
  totalEvents: number;
  uniqueSessions: number;
  homeViews: number;
  categoryClicks: number;
  topicCardClicks: number;
  productCardClicks: number;
  topicDetailViews: number;
  orderCreates: number;
}

interface EventBreakdown {
  event_name: string;
  count: number;
  unique_sessions: number;
}

interface TopicStats {
  topic_id: string;
  topic_title: string;
  exposes: number;
  clicks: number;
  ctr: number;
  detail_views: number;
  product_clicks: number;
}

interface CategoryStats {
  category_id: string;
  category_name: string;
  clicks: number;
  unique_sessions: number;
}

// ============================================================
// 事件名称映射
// ============================================================
const EVENT_NAME_LABELS: Record<string, string> = {
  home_view: '首页浏览',
  banner_click: 'Banner点击',
  category_click: '分类点击',
  topic_card_expose: '专题卡曝光',
  topic_card_click: '专题卡点击',
  product_card_expose: '商品卡曝光',
  product_card_click: '商品卡点击',
  topic_detail_view: '专题详情浏览',
  topic_product_click: '专题内商品点击',
  product_detail_view: '商品详情浏览',
  order_create: '创建订单',
  order_pay_success: '支付成功',
  order_complete: '订单完成',
};

// ============================================================
// 趋势指示器（与 ChannelAnalyticsPage 一致）
// ============================================================
function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <Minus className="w-3 h-3 text-gray-400" />;
  if (previous === 0) return <ArrowUp className="w-3 h-3 text-green-500" />;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 1) return <Minus className="w-3 h-3 text-gray-400" />;
  return change > 0 ? (
    <span className="flex items-center gap-0.5 text-xs text-green-600">
      <ArrowUp className="w-3 h-3" /> {change.toFixed(0)}%
    </span>
  ) : (
    <span className="flex items-center gap-0.5 text-xs text-red-600">
      <ArrowDown className="w-3 h-3" /> {Math.abs(change).toFixed(0)}%
    </span>
  );
}

export default function BehaviorDashboardPage() {
  const { supabase } = useSupabase();
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewStats>({
    totalEvents: 0, uniqueSessions: 0, homeViews: 0,
    categoryClicks: 0, topicCardClicks: 0, productCardClicks: 0,
    topicDetailViews: 0, orderCreates: 0,
  });
  const [prevOverview, setPrevOverview] = useState<OverviewStats>({
    totalEvents: 0, uniqueSessions: 0, homeViews: 0,
    categoryClicks: 0, topicCardClicks: 0, productCardClicks: 0,
    topicDetailViews: 0, orderCreates: 0,
  });
  const [eventBreakdown, setEventBreakdown] = useState<EventBreakdown[]>([]);
  const [topicStats, setTopicStats] = useState<TopicStats[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, [timeRange]);

  // ============================================================
  // 时间范围计算
  // ============================================================
  const getTimeRange = useCallback((range: TimeRange, offset: number = 0): { start: string; end: string } => {
    const now = new Date();
    let start: Date;
    let end: Date;

    switch (range) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
        end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'week':
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset * 7 + 1);
        start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
        start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        break;
    }

    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }, []);

  // ============================================================
  // 数据获取
  // ============================================================
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const current = getTimeRange(timeRange, 0);
      const previous = getTimeRange(timeRange, 1);

      // 并行获取当前和上一周期数据
      const [currentData, previousData] = await Promise.all([
        fetchPeriodData(current.start, current.end),
        fetchPeriodData(previous.start, previous.end),
      ]);

      setOverview(currentData.overview);
      setPrevOverview(previousData.overview);
      setEventBreakdown(currentData.breakdown);

      // 获取专题维度统计
      await fetchTopicStats(current.start, current.end);
      await fetchCategoryStats(current.start, current.end);
    } catch (error: any) {
      console.error('Dashboard fetch error:', error);
      toast.error('获取看板数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchPeriodData = async (start: string, end: string): Promise<{
    overview: OverviewStats;
    breakdown: EventBreakdown[];
  }> => {
    // 获取该时间段内的所有事件
    const { data: events, error } = await supabase
      .from('user_behavior_events')
      .select('event_name, session_id')
      .gte('created_at', start)
      .lt('created_at', end);

    if (error) throw error;
    const rows = events || [];

    // 计算概览
    const sessionSet = new Set(rows.map(r => r.session_id));
    const countByEvent = (name: string) => rows.filter(r => r.event_name === name).length;

    const overview: OverviewStats = {
      totalEvents: rows.length,
      uniqueSessions: sessionSet.size,
      homeViews: countByEvent('home_view'),
      categoryClicks: countByEvent('category_click'),
      topicCardClicks: countByEvent('topic_card_click'),
      productCardClicks: countByEvent('product_card_click'),
      topicDetailViews: countByEvent('topic_detail_view'),
      orderCreates: countByEvent('order_create'),
    };

    // 事件分布
    const eventMap = new Map<string, { count: number; sessions: Set<string> }>();
    rows.forEach(r => {
      const entry = eventMap.get(r.event_name) || { count: 0, sessions: new Set<string>() };
      entry.count++;
      entry.sessions.add(r.session_id);
      eventMap.set(r.event_name, entry);
    });

    const breakdown: EventBreakdown[] = Array.from(eventMap.entries())
      .map(([event_name, val]) => ({
        event_name,
        count: val.count,
        unique_sessions: val.sessions.size,
      }))
      .sort((a, b) => b.count - a.count);

    return { overview, breakdown };
  };

  const fetchTopicStats = async (start: string, end: string) => {
    try {
      // 获取专题相关事件
      const { data: topicEvents } = await supabase
        .from('user_behavior_events')
        .select('event_name, source_topic_id, session_id')
        .in('event_name', ['topic_card_expose', 'topic_card_click', 'topic_detail_view', 'topic_product_click'])
        .gte('created_at', start)
        .lt('created_at', end)
        .not('source_topic_id', 'is', null);

      if (!topicEvents || topicEvents.length === 0) {
        setTopicStats([]);
        return;
      }

      // 获取专题名称
      const topicIds = [...new Set(topicEvents.map(e => e.source_topic_id!))];
      const { data: topics } = await supabase
        .from('homepage_topics')
        .select('id, title_i18n')
        .in('id', topicIds);

      const topicNameMap = new Map<string, string>();
      (topics || []).forEach(t => {
        topicNameMap.set(t.id, (t.title_i18n as I18nText)?.zh || t.id.slice(0, 8));
      });

      // 按专题聚合
      const statsMap = new Map<string, TopicStats>();
      topicEvents.forEach(e => {
        const tid = e.source_topic_id!;
        const stat = statsMap.get(tid) || {
          topic_id: tid,
          topic_title: topicNameMap.get(tid) || tid.slice(0, 8),
          exposes: 0, clicks: 0, ctr: 0, detail_views: 0, product_clicks: 0,
        };
        if (e.event_name === 'topic_card_expose') stat.exposes++;
        if (e.event_name === 'topic_card_click') stat.clicks++;
        if (e.event_name === 'topic_detail_view') stat.detail_views++;
        if (e.event_name === 'topic_product_click') stat.product_clicks++;
        statsMap.set(tid, stat);
      });

      const result = Array.from(statsMap.values()).map(s => ({
        ...s,
        ctr: s.exposes > 0 ? (s.clicks / s.exposes) * 100 : 0,
      })).sort((a, b) => b.clicks - a.clicks);

      setTopicStats(result);
    } catch (error: any) {
      console.error('Topic stats error:', error);
    }
  };

  const fetchCategoryStats = async (start: string, end: string) => {
    try {
      const { data: catEvents } = await supabase
        .from('user_behavior_events')
        .select('source_category_id, session_id')
        .eq('event_name', 'category_click')
        .gte('created_at', start)
        .lt('created_at', end)
        .not('source_category_id', 'is', null);

      if (!catEvents || catEvents.length === 0) {
        setCategoryStats([]);
        return;
      }

      const catIds = [...new Set(catEvents.map(e => e.source_category_id!))];
      const { data: cats } = await supabase
        .from('homepage_categories')
        .select('id, name_i18n')
        .in('id', catIds);

      const catNameMap = new Map<string, string>();
      (cats || []).forEach(c => {
        catNameMap.set(c.id, (c.name_i18n as I18nText)?.zh || c.id.slice(0, 8));
      });

      const statsMap = new Map<string, CategoryStats>();
      catEvents.forEach(e => {
        const cid = e.source_category_id!;
        const stat = statsMap.get(cid) || {
          category_id: cid,
          category_name: catNameMap.get(cid) || cid.slice(0, 8),
          clicks: 0, unique_sessions: 0,
        };
        stat.clicks++;
        statsMap.set(cid, stat);
      });

      // 计算独立会话数
      const sessionsByCat = new Map<string, Set<string>>();
      catEvents.forEach(e => {
        const cid = e.source_category_id!;
        const sessions = sessionsByCat.get(cid) || new Set();
        sessions.add(e.session_id);
        sessionsByCat.set(cid, sessions);
      });

      const result = Array.from(statsMap.values()).map(s => ({
        ...s,
        unique_sessions: sessionsByCat.get(s.category_id)?.size || 0,
      })).sort((a, b) => b.clicks - a.clicks);

      setCategoryStats(result);
    } catch (error: any) {
      console.error('Category stats error:', error);
    }
  };

  // ============================================================
  // 计算衍生指标
  // ============================================================
  const topicCardCTR = overview.topicCardClicks > 0 && eventBreakdown.find(e => e.event_name === 'topic_card_expose')
    ? (overview.topicCardClicks / (eventBreakdown.find(e => e.event_name === 'topic_card_expose')?.count || 1)) * 100
    : 0;

  const productCardCTR = overview.productCardClicks > 0 && eventBreakdown.find(e => e.event_name === 'product_card_expose')
    ? (overview.productCardClicks / (eventBreakdown.find(e => e.event_name === 'product_card_expose')?.count || 1)) * 100
    : 0;

  const timeRangeLabels: Record<TimeRange, string> = {
    today: '今日', week: '本周', month: '本月',
  };

  return (
    <div className="p-6">
      {/* 头部 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">行为数据看板</h1>
          <p className="text-sm text-gray-500 mt-1">首页场景化改造效果追踪</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(['today', 'week', 'month'] as TimeRange[]).map(range => (
              <button key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  timeRange === range
                    ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                }`}>
                {timeRangeLabels[range]}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={fetchDashboardData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400 mb-2" />
          <p className="text-gray-500">加载中...</p>
        </div>
      ) : (
        <>
          {/* 概览卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">总事件数</span>
                  <Activity className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-2xl font-bold">{overview.totalEvents.toLocaleString()}</div>
                <TrendIndicator current={overview.totalEvents} previous={prevOverview.totalEvents} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">独立会话</span>
                  <Users className="w-4 h-4 text-green-500" />
                </div>
                <div className="text-2xl font-bold">{overview.uniqueSessions.toLocaleString()}</div>
                <TrendIndicator current={overview.uniqueSessions} previous={prevOverview.uniqueSessions} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">首页浏览</span>
                  <Eye className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-2xl font-bold">{overview.homeViews.toLocaleString()}</div>
                <TrendIndicator current={overview.homeViews} previous={prevOverview.homeViews} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">创建订单</span>
                  <ShoppingCart className="w-4 h-4 text-orange-500" />
                </div>
                <div className="text-2xl font-bold">{overview.orderCreates.toLocaleString()}</div>
                <TrendIndicator current={overview.orderCreates} previous={prevOverview.orderCreates} />
              </CardContent>
            </Card>
          </div>

          {/* 点击率卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-500 mb-1">分类点击</div>
                <div className="text-xl font-bold">{overview.categoryClicks}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-500 mb-1">专题卡点击</div>
                <div className="text-xl font-bold">{overview.topicCardClicks}</div>
                <div className="text-xs text-gray-400">CTR {topicCardCTR.toFixed(1)}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-500 mb-1">商品卡点击</div>
                <div className="text-xl font-bold">{overview.productCardClicks}</div>
                <div className="text-xs text-gray-400">CTR {productCardCTR.toFixed(1)}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-500 mb-1">专题详情浏览</div>
                <div className="text-xl font-bold">{overview.topicDetailViews}</div>
              </CardContent>
            </Card>
          </div>

          {/* 事件分布表 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" /> 事件分布
                </CardTitle>
              </CardHeader>
              <CardContent>
                {eventBreakdown.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">暂无数据</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>事件</TableHead>
                        <TableHead className="text-right">次数</TableHead>
                        <TableHead className="text-right">独立会话</TableHead>
                        <TableHead className="text-right">占比</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eventBreakdown.map(item => (
                        <TableRow key={item.event_name}>
                          <TableCell className="font-medium">
                            {EVENT_NAME_LABELS[item.event_name] || item.event_name}
                          </TableCell>
                          <TableCell className="text-right">{item.count.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{item.unique_sessions}</TableCell>
                          <TableCell className="text-right">
                            {overview.totalEvents > 0
                              ? ((item.count / overview.totalEvents) * 100).toFixed(1)
                              : '0'}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* 分类点击分布 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layers className="w-5 h-5" /> 分类点击分布
                </CardTitle>
              </CardHeader>
              <CardContent>
                {categoryStats.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">暂无数据</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>分类</TableHead>
                        <TableHead className="text-right">点击次数</TableHead>
                        <TableHead className="text-right">独立会话</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryStats.map(item => (
                        <TableRow key={item.category_id}>
                          <TableCell className="font-medium">{item.category_name}</TableCell>
                          <TableCell className="text-right">{item.clicks}</TableCell>
                          <TableCell className="text-right">{item.unique_sessions}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 专题效果分析 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="w-5 h-5" /> 专题效果分析
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topicStats.length === 0 ? (
                <div className="text-center py-8 text-gray-500">暂无专题行为数据</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>专题</TableHead>
                      <TableHead className="text-right">曝光</TableHead>
                      <TableHead className="text-right">点击</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead className="text-right">详情浏览</TableHead>
                      <TableHead className="text-right">商品点击</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topicStats.map(item => (
                      <TableRow key={item.topic_id}>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {item.topic_title}
                        </TableCell>
                        <TableCell className="text-right">{item.exposes}</TableCell>
                        <TableCell className="text-right">{item.clicks}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-medium ${item.ctr >= 5 ? 'text-green-600' : item.ctr >= 2 ? 'text-yellow-600' : 'text-gray-600'}`}>
                            {item.ctr.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{item.detail_views}</TableCell>
                        <TableCell className="text-right">{item.product_clicks}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
