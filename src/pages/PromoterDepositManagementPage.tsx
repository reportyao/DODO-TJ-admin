/**
 * PromoterDepositManagementPage.tsx
 * 地推充值管理与对账页面
 * 
 * 功能模块：
 * 1. 充值记录列表 - 查看所有地推充值记录，支持筛选和搜索
 * 2. 统计概览 - 今日/本周/本月充值汇总
 * 3. 地推人员维度统计 - 按地推人员分组的充值统计
 * 4. 导出功能 - 导出充值记录为CSV
 * 5. 数据一致性校验 - 交叉验证资金数据
 * 6. 快捷金额配置 - 管理地推充值页面的快捷金额按钮
 * 
 * 设计原则：
 * - 所有金额计算在数据库 RPC 函数中完成，确保 NUMERIC 精度
 * - 时区统一使用 Asia/Dushanbe，前端只传日期不传时间
 * - 单次 RPC 调用返回所有需要的数据，避免多次往返
 * - 与现有管理后台页面保持一致的代码风格
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { auditLog } from '../lib/auditLogger';
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
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  Settings,
  Plus,
  Trash2,
  Save,
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
  bonus_amount: number;
  created_at: string;
  // Joined fields from RPC
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
  today_used: number;
}

interface SummaryStats {
  total_count: number;
  total_amount: number;
  total_bonus: number;
  unique_promoters: number;
  unique_users: number;
}

interface CrossCheckResult {
  check_time: string;
  all_consistent: boolean;
  deposits: { total_amount: number; total_bonus: number; count: number };
  wallet_transactions: { deposit_total: number; deposit_count: number; bonus_total: number; bonus_count: number };
  settlements: { total_amount: number; total_count: number };
  orphan_deposits: number;
  amount_match: boolean;
  bonus_match: boolean;
  settlement_match: boolean;
  issues: string[];
}

type DateRange = 'today' | 'week' | 'month' | 'custom';

// ============================================================
// Helpers - 安全的数字转换
// ============================================================

/**
 * 安全地将 Supabase 返回的值转换为数字
 * Supabase REST API 会将 NUMERIC 类型返回为字符串
 * 此函数确保无论输入是 string 还是 number，都能正确转换
 */
function safeNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// ============================================================
// Main Component
// ============================================================

export default function PromoterDepositManagementPage() {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();
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

  // Pagination (managed by RPC)
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  // Detail dialog
  const [selectedDeposit, setSelectedDeposit] = useState<PromoterDeposit | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState<'records' | 'promoter_stats' | 'quick_amounts'>('records');

  // Quick amounts config
  const [quickAmounts, setQuickAmounts] = useState<number[]>([]);
  const [quickAmountsLoading, setQuickAmountsLoading] = useState(false);
  const [quickAmountsSaving, setQuickAmountsSaving] = useState(false);
  const [newQuickAmount, setNewQuickAmount] = useState('');

  // Cross-check
  const [crossCheckResult, setCrossCheckResult] = useState<CrossCheckResult | null>(null);
  const [crossCheckLoading, setCrossCheckLoading] = useState(false);
  const [showCrossCheck, setShowCrossCheck] = useState(false);

  // ============================================================
  // Date range helpers
  // 使用本地日期格式 YYYY-MM-DD，时区转换由 RPC 函数处理
  // ============================================================

  const getDateRange = useCallback((): { start: string; end: string } => {
    // 使用 Asia/Dushanbe 时区获取当前日期
    const now = new Date();
    const dushanbeOffset = 5 * 60; // UTC+5
    const localOffset = now.getTimezoneOffset();
    const dushanbeTime = new Date(now.getTime() + (dushanbeOffset + localOffset) * 60000);
    const todayStr = dushanbeTime.toISOString().split('T')[0];

    switch (dateRange) {
      case 'today':
        return { start: todayStr, end: todayStr };
      case 'week': {
        const weekAgo = new Date(dushanbeTime);
        weekAgo.setDate(weekAgo.getDate() - 6);
        return { start: weekAgo.toISOString().split('T')[0], end: todayStr };
      }
      case 'month': {
        const monthAgo = new Date(dushanbeTime);
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
  // Data fetching - 使用 RPC 聚合函数
  // ============================================================

  const fetchDeposits = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      const { data, error } = await supabase.rpc('get_admin_deposit_list', {
        p_start_date: start,
        p_end_date: end,
        p_status: statusFilter === 'all' ? null : statusFilter,
        p_promoter_id: selectedPromoterId === 'all' ? null : selectedPromoterId,
        p_search: searchTerm.trim() || null,
        p_page: page,
        p_page_size: pageSize,
      });

      if (error) throw error;

      const result = data as any;
      setTotalCount(safeNumber(result.total_count));

      // 安全转换金额字段
      const records: PromoterDeposit[] = (result.records || []).map((d: any) => ({
        ...d,
        amount: safeNumber(d.amount),
        bonus_amount: safeNumber(d.bonus_amount),
      }));

      setDeposits(records);
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

      const { data, error } = await supabase.rpc('get_admin_deposit_summary', {
        p_start_date: start,
        p_end_date: end,
      });

      if (error) throw error;

      const result = data as any;
      setSummary({
        total_count: safeNumber(result.total_count),
        total_amount: safeNumber(result.total_amount),
        total_bonus: safeNumber(result.total_bonus),
        unique_promoters: safeNumber(result.unique_promoters),
        unique_users: safeNumber(result.unique_users),
      });
    } catch (err: any) {
      console.error('Error fetching summary:', err);
    }
  }, [supabase, getDateRange]);

  const fetchPromoterStats = useCallback(async () => {
    try {
      const { start, end } = getDateRange();

      const { data, error } = await supabase.rpc('get_admin_promoter_stats', {
        p_start_date: start,
        p_end_date: end,
      });

      if (error) throw error;

      // 安全转换所有金额字段
      const stats: PromoterStats[] = ((data as any[]) || []).map((s: any) => ({
        promoter_id: s.promoter_id,
        promoter_name: s.promoter_name || '未知',
        telegram_id: s.telegram_id || '',
        team_name: s.team_name || '--',
        deposit_count: safeNumber(s.deposit_count),
        total_amount: safeNumber(s.total_amount),
        total_bonus: safeNumber(s.total_bonus),
        daily_deposit_limit: safeNumber(s.daily_deposit_limit),
        today_used: safeNumber(s.today_used),
      }));

      setPromoterStats(stats);
    } catch (err: any) {
      console.error('Error fetching promoter stats:', err);
    }
  }, [supabase, getDateRange]);

  // ============================================================
  // Quick Amounts Config - 快捷金额配置
  // ============================================================

  const fetchQuickAmounts = useCallback(async () => {
    setQuickAmountsLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'promoter_deposit_quick_amounts')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data?.value) {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        if (parsed?.amounts && Array.isArray(parsed.amounts)) {
          setQuickAmounts(parsed.amounts.sort((a: number, b: number) => a - b));
        }
      } else {
        // 默认值
        setQuickAmounts([10, 20, 50, 100, 200, 500]);
      }
    } catch (err: any) {
      console.error('Error fetching quick amounts:', err);
      toast.error('加载快捷金额配置失败');
    } finally {
      setQuickAmountsLoading(false);
    }
  }, [supabase]);

  const handleAddQuickAmount = () => {
    const amount = parseFloat(newQuickAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('请输入有效的正数金额');
      return;
    }
    if (amount > 10000) {
      toast.error('单笔快捷金额不能超过 10,000 TJS');
      return;
    }
    if (quickAmounts.includes(amount)) {
      toast.error('该金额已存在');
      return;
    }
    if (quickAmounts.length >= 10) {
      toast.error('最多配置 10 个快捷金额');
      return;
    }
    setQuickAmounts(prev => [...prev, amount].sort((a, b) => a - b));
    setNewQuickAmount('');
  };

  const handleRemoveQuickAmount = (amount: number) => {
    setQuickAmounts(prev => prev.filter(a => a !== amount));
  };

  const handleSaveQuickAmounts = async () => {
    if (quickAmounts.length === 0) {
      toast.error('至少需要配置一个快捷金额');
      return;
    }

    setQuickAmountsSaving(true);
    try {
      const { error } = await supabase
        .from('system_config')
        .upsert({
          key: 'promoter_deposit_quick_amounts',
          value: { amounts: quickAmounts },
          description: '地推人员代客充值的快捷金额选项，由管理后台配置',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'key',
        });

      if (error) throw error;

      // 记录审计日志
      if (admin) {
        await auditLog(supabase, {
          adminId: admin.id,
          action: 'UPDATE_QUICK_AMOUNTS',
          targetType: 'system_config',
          targetId: 'promoter_deposit_quick_amounts',
          newData: { amounts: quickAmounts },
          details: { updated_by: admin.username },
        });
      }

      toast.success('快捷金额配置已保存');
    } catch (err: any) {
      console.error('Error saving quick amounts:', err);
      toast.error('保存失败: ' + err.message);
    } finally {
      setQuickAmountsSaving(false);
    }
  };

  // ============================================================
  // Cross-check - 数据一致性校验
  // ============================================================

  const runCrossCheck = async () => {
    setCrossCheckLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_deposit_cross_check');
      if (error) throw error;

      const result = data as any;
      setCrossCheckResult({
        ...result,
        deposits: {
          total_amount: safeNumber(result.deposits?.total_amount),
          total_bonus: safeNumber(result.deposits?.total_bonus),
          count: safeNumber(result.deposits?.count),
        },
        wallet_transactions: {
          deposit_total: safeNumber(result.wallet_transactions?.deposit_total),
          deposit_count: safeNumber(result.wallet_transactions?.deposit_count),
          bonus_total: safeNumber(result.wallet_transactions?.bonus_total),
          bonus_count: safeNumber(result.wallet_transactions?.bonus_count),
        },
        settlements: {
          total_amount: safeNumber(result.settlements?.total_amount),
          total_count: safeNumber(result.settlements?.total_count),
        },
        orphan_deposits: safeNumber(result.orphan_deposits),
        issues: result.issues || [],
      });
      setShowCrossCheck(true);
    } catch (err: any) {
      console.error('Error running cross-check:', err);
      toast.error('数据校验失败: ' + err.message);
    } finally {
      setCrossCheckLoading(false);
    }
  };

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
      d.amount.toFixed(2),
      d.bonus_amount.toFixed(2),
      d.status === 'COMPLETED' ? '已完成' : d.status === 'FAILED' ? '失败' : d.status,
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
          <Button
            variant="outline"
            size="sm"
            onClick={runCrossCheck}
            disabled={crossCheckLoading}
            title="数据一致性校验"
          >
            <ShieldCheck className={`w-4 h-4 mr-1 ${crossCheckLoading ? 'animate-spin' : ''}`} />
            对账校验
          </Button>
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
              <option value="COMPLETED">已完成</option>
              <option value="FAILED">失败</option>
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
        <button
          onClick={() => {
            setActiveTab('quick_amounts');
            if (quickAmounts.length === 0) fetchQuickAmounts();
          }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'quick_amounts'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-1">
            <Settings className="w-3.5 h-3.5" />
            快捷金额配置
          </span>
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
                          {d.bonus_amount > 0 ? (
                            <span className="text-orange-500">+{formatAmount(d.bonus_amount)}</span>
                          ) : (
                            <span className="text-gray-300">--</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              d.status === 'COMPLETED'
                                ? 'bg-green-100 text-green-700'
                                : d.status === 'FAILED'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {d.status === 'COMPLETED' ? '已完成' : d.status === 'FAILED' ? '失败' : d.status}
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
                    <TableHead className="text-right">今日已用/日额度</TableHead>
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
                      <TableCell className="text-right text-sm">
                        <span className={s.today_used >= s.daily_deposit_limit ? 'text-red-600 font-medium' : 'text-gray-600'}>
                          {formatAmount(s.today_used)}
                        </span>
                        <span className="text-gray-400"> / {formatAmount(s.daily_deposit_limit)}</span>
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

      {/* ==================== Quick Amounts Config ==================== */}
      {activeTab === 'quick_amounts' && (
        <Card>
          <CardContent className="p-6">
            <div className="max-w-xl">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">快捷金额配置</h3>
              <p className="text-sm text-gray-500 mb-6">
                配置地推人员代客充值页面上显示的快捷金额按钮。修改后将实时生效。
              </p>

              {quickAmountsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
                  <span className="ml-2 text-gray-500">加载中...</span>
                </div>
              ) : (
                <>
                  {/* 当前配置的金额列表 */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">当前快捷金额</label>
                    {quickAmounts.length === 0 ? (
                      <p className="text-sm text-gray-400 py-4">暂未配置快捷金额</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {quickAmounts.map((amount) => (
                          <div
                            key={amount}
                            className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5"
                          >
                            <span className="text-sm font-medium text-blue-700">{amount} TJS</span>
                            <button
                              onClick={() => handleRemoveQuickAmount(amount)}
                              className="text-blue-400 hover:text-red-500 transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 添加新金额 */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">添加新金额</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        step="1"
                        value={newQuickAmount}
                        onChange={(e) => setNewQuickAmount(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddQuickAmount()}
                        className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        placeholder="输入金额"
                      />
                      <span className="text-sm text-gray-500">TJS</span>
                      <Button variant="outline" size="sm" onClick={handleAddQuickAmount}>
                        <Plus className="w-4 h-4 mr-1" />
                        添加
                      </Button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">金额范围: 1-10,000 TJS，最多 10 个</p>
                  </div>

                  {/* 保存按钮 */}
                  <div className="flex items-center gap-3 pt-4 border-t">
                    <Button onClick={handleSaveQuickAmounts} disabled={quickAmountsSaving}>
                      <Save className="w-4 h-4 mr-1" />
                      {quickAmountsSaving ? '保存中...' : '保存配置'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQuickAmounts([10, 20, 50, 100, 200, 500]);
                        toast.success('已恢复默认值，请点击保存生效');
                      }}
                    >
                      恢复默认
                    </Button>
                  </div>
                </>
              )}
            </div>
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
                      selectedDeposit.status === 'COMPLETED'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {selectedDeposit.status === 'COMPLETED' ? '已完成' : selectedDeposit.status}
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
                    {selectedDeposit.bonus_amount > 0
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

      {/* ==================== Cross-Check Dialog ==================== */}
      <Dialog open={showCrossCheck} onOpenChange={setShowCrossCheck}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              数据一致性校验报告
            </DialogTitle>
          </DialogHeader>
          {crossCheckResult && (
            <div className="space-y-4">
              {/* Overall status */}
              <div className={`p-3 rounded-lg flex items-center gap-2 ${
                crossCheckResult.all_consistent
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}>
                {crossCheckResult.all_consistent ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
                <span className="font-medium">
                  {crossCheckResult.all_consistent
                    ? '所有数据一致，资金安全'
                    : '发现数据不一致，请立即检查！'}
                </span>
              </div>

              {/* Detail table */}
              <div className="text-sm space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500 text-xs">充值记录总额</p>
                    <p className="font-bold">{formatAmount(crossCheckResult.deposits.total_amount)} TJS</p>
                    <p className="text-xs text-gray-400">{crossCheckResult.deposits.count} 笔</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500 text-xs">钱包交易总额</p>
                    <p className="font-bold">{formatAmount(crossCheckResult.wallet_transactions.deposit_total)} TJS</p>
                    <p className="text-xs text-gray-400">{crossCheckResult.wallet_transactions.deposit_count} 笔</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500 text-xs">奖励总额(充值记录)</p>
                    <p className="font-bold text-orange-600">{formatAmount(crossCheckResult.deposits.total_bonus)} TJS</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500 text-xs">奖励总额(钱包交易)</p>
                    <p className="font-bold text-orange-600">{formatAmount(crossCheckResult.wallet_transactions.bonus_total)} TJS</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500 text-xs">结算总额</p>
                    <p className="font-bold">{formatAmount(crossCheckResult.settlements.total_amount)} TJS</p>
                    <p className="text-xs text-gray-400">{crossCheckResult.settlements.total_count} 笔</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500 text-xs">孤立记录</p>
                    <p className={`font-bold ${crossCheckResult.orphan_deposits > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {crossCheckResult.orphan_deposits} 笔
                    </p>
                  </div>
                </div>

                {/* Check items */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {crossCheckResult.amount_match ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    )}
                    <span>充值总额一致性</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {crossCheckResult.bonus_match ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    )}
                    <span>奖励总额一致性</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {crossCheckResult.settlement_match ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    )}
                    <span>结算总额一致性</span>
                  </div>
                </div>

                {/* Issues */}
                {crossCheckResult.issues.length > 0 && (
                  <div className="bg-red-50 p-2 rounded">
                    <p className="text-red-700 font-medium text-xs mb-1">发现的问题：</p>
                    {crossCheckResult.issues.map((issue, i) => (
                      <p key={i} className="text-red-600 text-xs">• {issue}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setShowCrossCheck(false)}>
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
