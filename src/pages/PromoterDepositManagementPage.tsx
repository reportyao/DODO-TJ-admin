/**
 * PromoterDepositManagementPage.tsx
 * 地推充值管理与对账页面
 * 
 * 功能模块：
 * 1. 充值记录列表 - 查看所有地推充值记录，支持筛选和搜索
 * 2. 统计概览 - 今日/本周/本月充值汇总
 * 3. 地推人员维度统计 - 按地推人员分组的充值统计
 * 4. 导出功能 - 导出充值记录为CSV
 * 
 * 设计原则：
 * - 与现有管理后台页面保持一致的代码风格
 * - 使用相同的UI组件库（shadcn/ui）
 * - 遵循现有的数据获取和错误处理模式
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { toast } from 'react-hot-toast';
import {
  RefreshCw,
  DollarSign,
  Search,
  Download,
  Users,
  Calendar,
  TrendingUp,
  Eye,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface PromoterDeposit {
  id: string;
  promoter_id: string;
  target_user_id: string;
  amount: number;
  currency: string;
  status: string;
  note: string | null;
  bonus_amount: number | null;
  created_at: string;
  // Joined fields
  promoter_name: string;
  promoter_telegram_id: string;
  target_user_name: string;
  target_telegram_id: string;
  target_telegram_username: string;
}

interface PromoterStats {
  promoter_id: string;
  promoter_name: string;
  telegram_id: string;
  team_name: string;
  deposit_count: number;
  total_amount: number;
  total_bonus: number;
  daily_deposit_limit: number;
}

interface SummaryStats {
  total_count: number;
  total_amount: number;
  total_bonus: number;
  unique_promoters: number;
  unique_users: number;
}

type DateRange = 'today' | 'week' | 'month' | 'custom';

// ============================================================
// Main Component
// ============================================================

export default function PromoterDepositManagementPage() {
  const { supabase } = useSupabase();
  const [loading, setLoading] = useState(true);
  const [deposits, setDeposits] = useState<PromoterDeposit[]>([]);
  const [promoterStats, setPromoterStats] = useState<PromoterStats[]>([]);
  const [summary, setSummary] = useState<SummaryStats>({
    total_count: 0,
    total_amount: 0,
    total_bonus: 0,
    unique_promoters: 0,
    unique_users: 0,
  });

  // Filters
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPromoterId, setSelectedPromoterId] = useState<string>('all');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  // Detail dialog
  const [selectedDeposit, setSelectedDeposit] = useState<PromoterDeposit | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState<'records' | 'promoter_stats'>('records');

  // ============================================================
  // Date range helpers
  // ============================================================

  const getDateRange = useCallback((): { start: string; end: string } => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    switch (dateRange) {
      case 'today':
        return { start: todayStr, end: todayStr };
      case 'week': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 6);
        return { start: weekAgo.toISOString().split('T')[0], end: todayStr };
      }
      case 'month': {
        const monthAgo = new Date(now);
        monthAgo.setDate(monthAgo.getDate() - 29);
        return { start: monthAgo.toISOString().split('T')[0], end: todayStr };
      }
      case 'custom':
        return {
          start: customStartDate || todayStr,
          end: customEndDate || todayStr,
        };
      default:
        return { start: todayStr, end: todayStr };
    }
  }, [dateRange, customStartDate, customEndDate]);

  // ============================================================
  // Data fetching
  // ============================================================

  const fetchDeposits = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const startDate = `${start}T00:00:00.000Z`;
      const endDate = `${end}T23:59:59.999Z`;

      // Build query
      let query = supabase
        .from('promoter_deposits')
        .select('*', { count: 'exact' })
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (selectedPromoterId !== 'all') {
        query = query.eq('promoter_id', selectedPromoterId);
      }

      // Pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      setTotalCount(count || 0);

      if (!data || data.length === 0) {
        setDeposits([]);
        setLoading(false);
        return;
      }

      // Fetch related user info
      const promoterIds = [...new Set(data.map((d: any) => d.promoter_id))];
      const targetUserIds = [...new Set(data.map((d: any) => d.target_user_id))];
      const allUserIds = [...new Set([...promoterIds, ...targetUserIds])];

      const { data: usersData } = await supabase
        .from('users')
        .select('id, first_name, last_name, telegram_id, telegram_username')
        .in('id', allUserIds);

      const userMap = new Map<string, any>();
      usersData?.forEach((u: any) => {
        userMap.set(u.id, u);
      });

      const enrichedDeposits: PromoterDeposit[] = data.map((d: any) => {
        const promoter = userMap.get(d.promoter_id);
        const target = userMap.get(d.target_user_id);
        return {
          ...d,
          promoter_name: promoter
            ? [promoter.first_name, promoter.last_name].filter(Boolean).join(' ') || promoter.telegram_username || '未知'
            : '未知',
          promoter_telegram_id: promoter?.telegram_id || '',
          target_user_name: target
            ? [target.first_name, target.last_name].filter(Boolean).join(' ') || target.telegram_username || '未知'
            : '未知',
          target_telegram_id: target?.telegram_id || '',
          target_telegram_username: target?.telegram_username || '',
        };
      });

      // Apply search filter client-side
      let filtered = enrichedDeposits;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        filtered = enrichedDeposits.filter(
          (d) =>
            d.promoter_name.toLowerCase().includes(term) ||
            d.target_user_name.toLowerCase().includes(term) ||
            d.promoter_telegram_id.includes(term) ||
            d.target_telegram_id.includes(term) ||
            d.target_telegram_username.toLowerCase().includes(term) ||
            d.id.toLowerCase().includes(term)
        );
      }

      setDeposits(filtered);
    } catch (err: any) {
      console.error('Error fetching deposits:', err);
      toast.error('加载充值记录失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, getDateRange, page, statusFilter, selectedPromoterId, searchTerm]);

  const fetchSummary = useCallback(async () => {
    try {
      const { start, end } = getDateRange();
      const startDate = `${start}T00:00:00.000Z`;
      const endDate = `${end}T23:59:59.999Z`;

      const { data, error } = await supabase
        .from('promoter_deposits')
        .select('id, promoter_id, target_user_id, amount, bonus_amount, status')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .eq('status', 'completed');

      if (error) throw error;

      if (!data || data.length === 0) {
        setSummary({
          total_count: 0,
          total_amount: 0,
          total_bonus: 0,
          unique_promoters: 0,
          unique_users: 0,
        });
        return;
      }

      const promoterSet = new Set(data.map((d: any) => d.promoter_id));
      const userSet = new Set(data.map((d: any) => d.target_user_id));

      setSummary({
        total_count: data.length,
        total_amount: data.reduce((sum: number, d: any) => sum + (d.amount || 0), 0),
        total_bonus: data.reduce((sum: number, d: any) => sum + (d.bonus_amount || 0), 0),
        unique_promoters: promoterSet.size,
        unique_users: userSet.size,
      });
    } catch (err: any) {
      console.error('Error fetching summary:', err);
    }
  }, [supabase, getDateRange]);

  const fetchPromoterStats = useCallback(async () => {
    try {
      const { start, end } = getDateRange();
      const startDate = `${start}T00:00:00.000Z`;
      const endDate = `${end}T23:59:59.999Z`;

      // Fetch all completed deposits in range
      const { data: depositsData, error: dError } = await supabase
        .from('promoter_deposits')
        .select('promoter_id, amount, bonus_amount')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .eq('status', 'completed');

      if (dError) throw dError;

      if (!depositsData || depositsData.length === 0) {
        setPromoterStats([]);
        return;
      }

      // Group by promoter
      const statsMap = new Map<string, { count: number; amount: number; bonus: number }>();
      depositsData.forEach((d: any) => {
        const existing = statsMap.get(d.promoter_id) || { count: 0, amount: 0, bonus: 0 };
        existing.count += 1;
        existing.amount += d.amount || 0;
        existing.bonus += d.bonus_amount || 0;
        statsMap.set(d.promoter_id, existing);
      });

      const promoterIds = [...statsMap.keys()];

      // Fetch promoter profiles
      const { data: profilesData } = await supabase
        .from('promoter_profiles')
        .select('user_id, daily_deposit_limit, team_id')
        .in('user_id', promoterIds);

      // Fetch user names
      const { data: usersData } = await supabase
        .from('users')
        .select('id, first_name, last_name, telegram_id')
        .in('id', promoterIds);

      // Fetch team names
      const teamIds = [...new Set((profilesData || []).map((p: any) => p.team_id).filter(Boolean))];
      let teamMap = new Map<string, string>();
      if (teamIds.length > 0) {
        const { data: teamsData } = await supabase
          .from('promoter_teams')
          .select('id, name')
          .in('id', teamIds);
        teamsData?.forEach((t: any) => teamMap.set(t.id, t.name));
      }

      const userMap = new Map<string, any>();
      usersData?.forEach((u: any) => userMap.set(u.id, u));

      const profileMap = new Map<string, any>();
      profilesData?.forEach((p: any) => profileMap.set(p.user_id, p));

      const stats: PromoterStats[] = promoterIds.map((pid) => {
        const s = statsMap.get(pid)!;
        const user = userMap.get(pid);
        const profile = profileMap.get(pid);
        return {
          promoter_id: pid,
          promoter_name: user
            ? [user.first_name, user.last_name].filter(Boolean).join(' ') || '未知'
            : '未知',
          telegram_id: user?.telegram_id || '',
          team_name: profile?.team_id ? (teamMap.get(profile.team_id) || '--') : '--',
          deposit_count: s.count,
          total_amount: s.amount,
          total_bonus: s.bonus,
          daily_deposit_limit: profile?.daily_deposit_limit ?? 5000,
        };
      });

      // Sort by total amount descending
      stats.sort((a, b) => b.total_amount - a.total_amount);
      setPromoterStats(stats);
    } catch (err: any) {
      console.error('Error fetching promoter stats:', err);
    }
  }, [supabase, getDateRange]);

  // ============================================================
  // Effects
  // ============================================================

  useEffect(() => {
    fetchDeposits();
    fetchSummary();
    fetchPromoterStats();
  }, [fetchDeposits, fetchSummary, fetchPromoterStats]);

  // ============================================================
  // Export
  // ============================================================

  const exportCSV = () => {
    if (deposits.length === 0) {
      toast.error('没有可导出的数据');
      return;
    }

    const csvEscape = (val: any) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = ['充值ID', '地推人员', '地推Telegram', '目标用户', '用户Telegram', '金额(TJS)', '首充奖励(TJS)', '状态', '备注', '时间'];
    const rows = deposits.map((d) => [
      d.id.substring(0, 8),
      d.promoter_name,
      d.promoter_telegram_id,
      d.target_user_name,
      d.target_telegram_id,
      d.amount,
      d.bonus_amount || 0,
      d.status === 'completed' ? '已完成' : d.status,
      d.note || '',
      new Date(d.created_at).toLocaleString('zh-CN'),
    ]);

    const csvContent = [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `promoter_deposits_${getDateRange().start}_${getDateRange().end}.csv`;
    link.click();
    toast.success('导出成功');
  };

  // ============================================================
  // Helpers
  // ============================================================

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const handleRefresh = () => {
    fetchDeposits();
    fetchSummary();
    fetchPromoterStats();
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* ==================== Page Header ==================== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">地推充值管理</h1>
          <p className="text-sm text-gray-500 mt-1">查看和管理地推人员的代客充值记录</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" />
            导出CSV
          </Button>
        </div>
      </div>

      {/* ==================== Summary Cards ==================== */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <DollarSign className="w-4 h-4" />
              充值总额
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatAmount(summary.total_amount)}</p>
            <p className="text-xs text-gray-400 mt-1">TJS</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <TrendingUp className="w-4 h-4" />
              充值笔数
            </div>
            <p className="text-2xl font-bold text-gray-900">{summary.total_count}</p>
            <p className="text-xs text-gray-400 mt-1">笔</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <DollarSign className="w-4 h-4" />
              首充奖励
            </div>
            <p className="text-2xl font-bold text-orange-600">{formatAmount(summary.total_bonus)}</p>
            <p className="text-xs text-gray-400 mt-1">TJS</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Users className="w-4 h-4" />
              活跃地推
            </div>
            <p className="text-2xl font-bold text-blue-600">{summary.unique_promoters}</p>
            <p className="text-xs text-gray-400 mt-1">人</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Users className="w-4 h-4" />
              充值用户
            </div>
            <p className="text-2xl font-bold text-green-600">{summary.unique_users}</p>
            <p className="text-xs text-gray-400 mt-1">人</p>
          </CardContent>
        </Card>
      </div>

      {/* ==================== Filters ==================== */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Date range buttons */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {(['today', 'week', 'month', 'custom'] as DateRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => { setDateRange(range); setPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    dateRange === range
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {range === 'today' ? '今日' : range === 'week' ? '本周' : range === 'month' ? '本月' : '自定义'}
                </button>
              ))}
            </div>

            {/* Custom date inputs */}
            {dateRange === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => { setCustomStartDate(e.target.value); setPage(1); }}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
                <span className="text-gray-400">至</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => { setCustomEndDate(e.target.value); setPage(1); }}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            )}

            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索地推人员/用户名/Telegram ID..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">全部状态</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* ==================== Tab Switch ==================== */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('records')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'records'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          充值记录
        </button>
        <button
          onClick={() => setActiveTab('promoter_stats')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'promoter_stats'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          地推人员统计
        </button>
      </div>

      {/* ==================== Records Table ==================== */}
      {activeTab === 'records' && (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-500">加载中...</span>
              </div>
            ) : deposits.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <DollarSign className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>暂无充值记录</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>地推人员</TableHead>
                      <TableHead>目标用户</TableHead>
                      <TableHead className="text-right">金额</TableHead>
                      <TableHead className="text-right">首充奖励</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>备注</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deposits.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                          {formatTime(d.created_at)}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{d.promoter_name}</p>
                            <p className="text-xs text-gray-400">{d.promoter_telegram_id}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{d.target_user_name}</p>
                            <p className="text-xs text-gray-400">
                              {d.target_telegram_username ? `@${d.target_telegram_username}` : d.target_telegram_id}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          +{formatAmount(d.amount)} TJS
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {d.bonus_amount && d.bonus_amount > 0 ? (
                            <span className="text-orange-500">+{formatAmount(d.bonus_amount)}</span>
                          ) : (
                            <span className="text-gray-300">--</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              d.status === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : d.status === 'failed'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {d.status === 'completed' ? '已完成' : d.status === 'failed' ? '失败' : d.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500 max-w-[120px] truncate">
                          {d.note || '--'}
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => setSelectedDeposit(d)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                            title="查看详情"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-gray-500">
                      共 {totalCount} 条记录，第 {page}/{totalPages} 页
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ==================== Promoter Stats Table ==================== */}
      {activeTab === 'promoter_stats' && (
        <Card>
          <CardContent className="p-0">
            {promoterStats.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>暂无地推人员充值数据</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>地推人员</TableHead>
                    <TableHead>Telegram ID</TableHead>
                    <TableHead>团队</TableHead>
                    <TableHead className="text-right">充值笔数</TableHead>
                    <TableHead className="text-right">充值总额</TableHead>
                    <TableHead className="text-right">首充奖励</TableHead>
                    <TableHead className="text-right">日额度</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promoterStats.map((s) => (
                    <TableRow key={s.promoter_id}>
                      <TableCell className="font-medium">{s.promoter_name}</TableCell>
                      <TableCell className="text-sm text-gray-500">{s.telegram_id}</TableCell>
                      <TableCell className="text-sm">{s.team_name}</TableCell>
                      <TableCell className="text-right">{s.deposit_count}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {formatAmount(s.total_amount)} TJS
                      </TableCell>
                      <TableCell className="text-right text-sm text-orange-500">
                        {s.total_bonus > 0 ? `${formatAmount(s.total_bonus)} TJS` : '--'}
                      </TableCell>
                      <TableCell className="text-right text-sm text-gray-600">
                        {formatAmount(s.daily_deposit_limit)} TJS
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => {
                            setSelectedPromoterId(s.promoter_id);
                            setActiveTab('records');
                            setPage(1);
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          查看记录
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ==================== Detail Dialog ==================== */}
      <Dialog open={!!selectedDeposit} onOpenChange={(open) => !open && setSelectedDeposit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>充值详情</DialogTitle>
          </DialogHeader>
          {selectedDeposit && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500">充值ID</p>
                  <p className="font-mono text-xs">{selectedDeposit.id.substring(0, 8)}...</p>
                </div>
                <div>
                  <p className="text-gray-500">状态</p>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      selectedDeposit.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {selectedDeposit.status === 'completed' ? '已完成' : selectedDeposit.status}
                  </span>
                </div>
                <div>
                  <p className="text-gray-500">地推人员</p>
                  <p className="font-medium">{selectedDeposit.promoter_name}</p>
                  <p className="text-xs text-gray-400">{selectedDeposit.promoter_telegram_id}</p>
                </div>
                <div>
                  <p className="text-gray-500">目标用户</p>
                  <p className="font-medium">{selectedDeposit.target_user_name}</p>
                  <p className="text-xs text-gray-400">
                    {selectedDeposit.target_telegram_username
                      ? `@${selectedDeposit.target_telegram_username}`
                      : selectedDeposit.target_telegram_id}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">充值金额</p>
                  <p className="text-lg font-bold text-green-600">+{formatAmount(selectedDeposit.amount)} TJS</p>
                </div>
                <div>
                  <p className="text-gray-500">首充奖励</p>
                  <p className="text-lg font-bold text-orange-500">
                    {selectedDeposit.bonus_amount && selectedDeposit.bonus_amount > 0
                      ? `+${formatAmount(selectedDeposit.bonus_amount)} TJS`
                      : '--'}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-gray-500">时间</p>
                  <p>{new Date(selectedDeposit.created_at).toLocaleString('zh-CN')}</p>
                </div>
                {selectedDeposit.note && (
                  <div className="col-span-2">
                    <p className="text-gray-500">备注</p>
                    <p className="bg-gray-50 rounded-lg p-2 text-sm">{selectedDeposit.note}</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setSelectedDeposit(null)}>
                  关闭
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
