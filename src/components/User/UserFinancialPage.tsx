import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  BanknotesIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  DocumentArrowDownIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';
import { useSupabase } from '../../contexts/SupabaseContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';

interface FinancialSummary {
  luckyCoinsBalance: number;
  cashBalance: number;
  cashFrozenBalance: number;
  luckyFrozenBalance: number;
  frozenBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalSpending: number;
  totalIncome: number;
  tjsSpending: number;
  tjsIncome: number;
  pointsSpending: number;
  pointsIncome: number;
  level1Commission: number;
  level2Commission: number;
  level3Commission: number;
  totalCommission: number;
  periodStats: {
    period: string;
    deposits: number;
    withdrawals: number;
    spending: number;
    income: number;
    netChange: number;
    tjsSpending: number;
    tjsIncome: number;
    tjsNetChange: number;
    pointsSpending: number;
    pointsIncome: number;
    pointsNetChange: number;
  };
}

interface Transaction {
  id: string;
  type: string;
  typeName: string;
  amount: number;
  balance_before: number | null;
  balance_after: number | null;
  status: string;
  description: string;
  related_order_id?: string;
  related_lottery_id?: string;
  walletType: string;
  currency: string;
  unit: string;
  created_at: string;
  isIncome: boolean;
}

// 钱包类型 Tab 配置
type WalletTab = 'ALL' | 'TJS' | 'LUCKY_COIN';

const WALLET_TABS: { value: WalletTab; label: string; color: string }[] = [
  { value: 'ALL', label: '全部流水', color: '' },
  { value: 'TJS', label: '💰 余额 (TJS)', color: 'text-green-700' },
  { value: 'LUCKY_COIN', label: '🎯 积分', color: 'text-blue-700' },
];

// 根据钱包类型获取交易类型选项
const getTxTypeOptions = (walletTab: WalletTab) => {
  if (walletTab === 'TJS') {
    return [
      { value: '', label: '全部' },
      { value: 'DEPOSIT', label: '充值' },
      { value: 'WITHDRAWAL', label: '提现' },
      { value: 'GROUP_BUY_PURCHASE', label: '拼团消费' },
      { value: 'GROUP_BUY_REFUND', label: '拼团退款' },
      { value: 'GROUP_BUY_REFUND_TO_BALANCE', label: '拼团退款转余额' },
      { value: 'BONUS', label: '奖励' },
      { value: 'COIN_EXCHANGE', label: '币种兑换' },
      { value: 'COMMISSION', label: '佣金收入' },
      { value: 'FIRST_DEPOSIT_BONUS', label: '首充奖励' },
      { value: 'PROMOTER_DEPOSIT', label: '地推代充' },
    ];
  }
  if (walletTab === 'LUCKY_COIN') {
    return [
      { value: '', label: '全部' },
      { value: 'LOTTERY_PURCHASE', label: '积分商城消费' },
      { value: 'SPIN_REWARD', label: '转盘奖励' },
      { value: 'NEW_USER_GIFT', label: '新用户礼物' },
      { value: 'SHOWOFF_REWARD', label: '晒单奖励' },
      { value: 'FULL_PURCHASE', label: '全款购买' },
      { value: 'GROUP_BUY_REFUND', label: '拼团退款' },
      { value: 'COIN_EXCHANGE', label: '币种兑换' },
    ];
  }
  return [
    { value: '', label: '全部' },
    { value: 'DEPOSIT', label: '充值' },
    { value: 'WITHDRAWAL', label: '提现' },
    { value: 'LOTTERY_PURCHASE', label: '积分商城消费' },
    { value: 'GROUP_BUY_PURCHASE', label: '拼团消费' },
    { value: 'GROUP_BUY_REFUND', label: '拼团退款' },
    { value: 'SPIN_REWARD', label: '转盘奖励' },
    { value: 'REFERRAL_BONUS', label: '邀请奖励' },
    { value: 'COMMISSION', label: '佣金收入' },
  ];
};

const UserFinancialPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { supabase } = useSupabase();
  
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [walletTab, setWalletTab] = useState<WalletTab>('ALL');
  const [filters, setFilters] = useState({
    type: '',
    status: '',
    startDate: '',
    endDate: ''
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchSummary();
    }
  }, [userId, period]);

  useEffect(() => {
    if (userId) {
      fetchTransactions();
    }
  }, [userId, page, filters, walletTab]);

  const getHeaders = () => ({
    'X-Admin-Id': (() => { try { return JSON.parse(localStorage.getItem('admin_user') || '{}').id || ''; } catch { return ''; } })(),
    'Content-Type': 'application/json',
    'apikey': import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`
  });

  const fetchSummary = async () => {
    try {
      const summaryUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user-financial?user_id=${userId}&action=summary&period=${period}`;
      const summaryResponse = await fetch(summaryUrl, { headers: getHeaders() });
      const summaryData = await summaryResponse.json();
      if (summaryData.success) {
        setSummary(summaryData.data);
      }
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const transactionsUrl = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user-financial`);
      transactionsUrl.searchParams.set('user_id', userId!);
      transactionsUrl.searchParams.set('action', 'transactions');
      transactionsUrl.searchParams.set('page', page.toString());
      transactionsUrl.searchParams.set('pageSize', '20');
      if (walletTab !== 'ALL') {
        transactionsUrl.searchParams.set('walletType', walletTab);
      }
      if (filters.type) transactionsUrl.searchParams.set('type', filters.type);
      if (filters.status) transactionsUrl.searchParams.set('status', filters.status);
      if (filters.startDate) transactionsUrl.searchParams.set('startDate', filters.startDate);
      if (filters.endDate) transactionsUrl.searchParams.set('endDate', filters.endDate);

      const transactionsResponse = await fetch(transactionsUrl.toString(), { headers: getHeaders() });
      const transactionsData = await transactionsResponse.json();
      if (transactionsData.success) {
        setTransactions(transactionsData.data.transactions);
        setTotalPages(transactionsData.data.pagination.totalPages);
        setTotalCount(transactionsData.data.pagination.total);
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const exportUrl = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user-financial`);
      exportUrl.searchParams.set('user_id', userId!);
      exportUrl.searchParams.set('action', 'export');
      if (walletTab !== 'ALL') exportUrl.searchParams.set('walletType', walletTab);
      if (filters.type) exportUrl.searchParams.set('type', filters.type);
      if (filters.status) exportUrl.searchParams.set('status', filters.status);
      if (filters.startDate) exportUrl.searchParams.set('startDate', filters.startDate);
      if (filters.endDate) exportUrl.searchParams.set('endDate', filters.endDate);

      const response = await fetch(exportUrl.toString(), {
        headers: {
          'X-Admin-Id': (() => { try { return JSON.parse(localStorage.getItem('admin_user') || '{}').id || ''; } catch { return ''; } })(),
          'apikey': import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`
        }
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const tabLabel = walletTab === 'ALL' ? 'all' : walletTab.toLowerCase();
      a.download = `user_${userId}_${tabLabel}_transactions_${new Date().toISOString()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export:', error);
    }
  };

  const handleWalletTabChange = (value: string) => {
    setWalletTab(value as WalletTab);
    setPage(1);
    setFilters({ type: '', status: '', startDate: '', endDate: '' });
  };

  // 获取钱包类型的显示标签和颜色
  const getWalletBadge = (walletType: string) => {
    if (walletType === 'TJS') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
          💰 TJS
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
        🎯 积分
      </span>
    );
  };

  // 格式化金额显示（带单位）
  const formatAmount = (amount: number, walletType: string, showSign: boolean = true) => {
    const absAmount = Math.abs(amount);
    const unit = walletType === 'TJS' ? ' TJS' : ' 积分';
    const sign = showSign ? (amount >= 0 ? '+' : '-') : '';
    return `${sign}${absAmount.toFixed(2)}${unit}`;
  };

  // 格式化余额变化
  const formatBalanceChange = (before: number | null, after: number | null, walletType: string) => {
    const unit = walletType === 'TJS' ? ' TJS' : ' 积分';
    const beforeStr = before !== null && before !== undefined ? `${Number(before).toFixed(2)}` : '—';
    const afterStr = after !== null && after !== undefined ? `${Number(after).toFixed(2)}` : '—';
    return `${beforeStr} → ${afterStr}${unit}`;
  };

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/users')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">用户财务数据</h1>
            <p className="text-sm text-gray-500">用户ID: {userId}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FunnelIcon className="w-5 h-5" />
            <span>筛选</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <DocumentArrowDownIcon className="w-5 h-5" />
            <span>导出</span>
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex space-x-2 mb-6">
        {['today', 'week', 'month', 'all'].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              period === p
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {p === 'today' && '今日'}
            {p === 'week' && '本周'}
            {p === 'month' && '本月'}
            {p === 'all' && '全部'}
          </button>
        ))}
      </div>

      {/* Summary Cards - 分为两个区域 */}
      {summary && (
        <div className="space-y-6 mb-6">
          {/* 第一行：两种钱包余额并排 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* TJS 余额区 */}
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm opacity-90 font-medium">💰 余额 (TJS)</span>
                <CurrencyDollarIcon className="w-6 h-6 opacity-80" />
              </div>
              <div className="text-3xl font-bold mb-4">{summary.cashBalance?.toFixed(2) || '0.00'} <span className="text-lg font-normal opacity-80">TJS</span></div>
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/20">
                <div>
                  <div className="text-xs opacity-70">冻结金额</div>
                  <div className="text-lg font-semibold">{summary.cashFrozenBalance?.toFixed(2) || '0.00'}</div>
                </div>
                <div>
                  <div className="text-xs opacity-70">累计充值</div>
                  <div className="text-lg font-semibold">{summary.totalDeposits?.toFixed(2) || '0.00'}</div>
                </div>
                <div>
                  <div className="text-xs opacity-70">累计提现</div>
                  <div className="text-lg font-semibold">{summary.totalWithdrawals?.toFixed(2) || '0.00'}</div>
                </div>
                <div>
                  <div className="text-xs opacity-70">期间净变化</div>
                  <div className={`text-lg font-semibold ${summary.periodStats.tjsNetChange >= 0 ? '' : 'text-red-200'}`}>
                    {summary.periodStats.tjsNetChange >= 0 ? '+' : ''}{summary.periodStats.tjsNetChange?.toFixed(2) || '0.00'}
                  </div>
                </div>
              </div>
            </div>

            {/* LUCKY_COIN 积分区 */}
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm opacity-90 font-medium">🎯 积分 (LUCKY COIN)</span>
                <BanknotesIcon className="w-6 h-6 opacity-80" />
              </div>
              <div className="text-3xl font-bold mb-4">{summary.luckyCoinsBalance?.toFixed(2) || '0.00'} <span className="text-lg font-normal opacity-80">积分</span></div>
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/20">
                <div>
                  <div className="text-xs opacity-70">冻结积分</div>
                  <div className="text-lg font-semibold">{summary.luckyFrozenBalance?.toFixed(2) || '0.00'}</div>
                </div>
                <div>
                  <div className="text-xs opacity-70">累计获得</div>
                  <div className="text-lg font-semibold">{summary.pointsIncome?.toFixed(2) || '0.00'}</div>
                </div>
                <div>
                  <div className="text-xs opacity-70">累计消费</div>
                  <div className="text-lg font-semibold">{summary.pointsSpending?.toFixed(2) || '0.00'}</div>
                </div>
                <div>
                  <div className="text-xs opacity-70">期间净变化</div>
                  <div className={`text-lg font-semibold ${summary.periodStats.pointsNetChange >= 0 ? '' : 'text-red-200'}`}>
                    {summary.periodStats.pointsNetChange >= 0 ? '+' : ''}{summary.periodStats.pointsNetChange?.toFixed(2) || '0.00'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 第二行：TJS 详细统计 */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">TJS 消费</div>
              <div className="text-xl font-bold text-red-600">{summary.tjsSpending?.toFixed(2) || '0.00'}</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">TJS 收入</div>
              <div className="text-xl font-bold text-green-600">{summary.tjsIncome?.toFixed(2) || '0.00'}</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">积分消费</div>
              <div className="text-xl font-bold text-red-600">{summary.pointsSpending?.toFixed(2) || '0.00'}</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">积分收入</div>
              <div className="text-xl font-bold text-green-600">{summary.pointsIncome?.toFixed(2) || '0.00'}</div>
            </div>
            {/* Commission */}
            <div className="bg-white rounded-xl p-4 border border-orange-200">
              <div className="text-xs text-gray-500 mb-1">总佣金</div>
              <div className="text-xl font-bold text-orange-600">{summary.totalCommission?.toFixed(2) || '0.00'}</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">佣金明细</div>
              <div className="text-xs text-gray-600 space-y-0.5">
                <div>L1: {summary.level1Commission?.toFixed(2) || '0.00'}</div>
                <div>L2: {summary.level2Commission?.toFixed(2) || '0.00'}</div>
                <div>L3: {summary.level3Commission?.toFixed(2) || '0.00'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Type Tabs + Transactions */}
      <Tabs value={walletTab} onValueChange={handleWalletTabChange} className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList className="bg-gray-100">
            {WALLET_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="data-[state=active]:bg-white">
                <span className={tab.color}>{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="text-sm text-gray-500">
            共 {totalCount} 条记录
          </div>
        </div>

        {/* Filters - 根据当前 Tab 显示不同的类型选项 */}
        {showFilters && (
          <div className="bg-white rounded-xl p-6 border border-gray-200 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">交易类型</label>
                <select
                  value={filters.type}
                  onChange={(e) => { setFilters({ ...filters, type: e.target.value }); setPage(1); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {getTxTypeOptions(walletTab).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">状态</label>
                <select
                  value={filters.status}
                  onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">全部</option>
                  <option value="COMPLETED">已完成</option>
                  <option value="PENDING">待处理</option>
                  <option value="FAILED">失败</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">开始日期</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => { setFilters({ ...filters, startDate: e.target.value }); setPage(1); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">结束日期</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => { setFilters({ ...filters, endDate: e.target.value }); setPage(1); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => { setFilters({ type: '', status: '', startDate: '', endDate: '' }); setPage(1); }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                重置
              </button>
            </div>
          </div>
        )}

        {/* 三个 Tab 共享同一个表格渲染 */}
        {WALLET_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                      {walletTab === 'ALL' && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">钱包</th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">金额</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">余额变化</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">描述</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan={walletTab === 'ALL' ? 7 : 6} className="px-6 py-12 text-center text-gray-500">
                          加载中...
                        </td>
                      </tr>
                    ) : transactions.length === 0 ? (
                      <tr>
                        <td colSpan={walletTab === 'ALL' ? 7 : 6} className="px-6 py-12 text-center text-gray-400">
                          暂无交易记录
                        </td>
                      </tr>
                    ) : (
                      transactions.map((transaction) => (
                        <tr key={transaction.id} className={`hover:bg-gray-50 ${
                          transaction.walletType === 'TJS' ? 'border-l-2 border-l-green-400' : 'border-l-2 border-l-blue-400'
                        }`}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {new Date(transaction.created_at).toLocaleString('zh-CN', {
                              year: 'numeric', month: '2-digit', day: '2-digit',
                              hour: '2-digit', minute: '2-digit', second: '2-digit'
                            })}
                          </td>
                          {walletTab === 'ALL' && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              {getWalletBadge(transaction.walletType)}
                            </td>
                          )}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              transaction.walletType === 'TJS'
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}>
                              {transaction.typeName}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-right">
                            <span className={transaction.isIncome ? 'text-green-600' : 'text-red-600'}>
                              {formatAmount(transaction.amount, transaction.walletType, true)}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {formatBalanceChange(transaction.balance_before, transaction.balance_after, transaction.walletType)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              transaction.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                              transaction.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {transaction.status === 'COMPLETED' ? '已完成' :
                               transaction.status === 'PENDING' ? '待处理' :
                               transaction.status === 'FAILED' ? '失败' : transaction.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" title={transaction.description || ''}>
                            {transaction.description || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    第 {page} 页，共 {totalPages} 页（{totalCount} 条记录）
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      上一页
                    </button>
                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default UserFinancialPage;
