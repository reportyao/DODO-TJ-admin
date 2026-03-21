import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  BanknotesIcon,
  CurrencyDollarIcon,
  DocumentArrowDownIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';
import { useSupabase } from '../../contexts/SupabaseContext';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { toast } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

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

type WalletTab = 'ALL' | 'TJS' | 'LUCKY_COIN';

const WALLET_TABS: { value: WalletTab; label: string; color: string }[] = [
  { value: 'ALL', label: '全部流水', color: '' },
  { value: 'TJS', label: '💰 余额 (TJS)', color: 'text-green-700' },
  { value: 'LUCKY_COIN', label: '🎯 积分', color: 'text-blue-700' },
];

const getTxTypeOptions = (walletTab: WalletTab) => {
  const common = [{ value: '', label: '全部' }];
  const tjs = [
    { value: 'DEPOSIT', label: '充値' },
    { value: 'PROMOTER_DEPOSIT', label: '地推代充' },
    { value: 'FIRST_DEPOSIT_BONUS', label: '充值赠送' },
    { value: 'WITHDRAWAL', label: '提现' },
    { value: 'WITHDRAWAL_FREEZE', label: '提现冻结' },
    { value: 'WITHDRAWAL_UNFREEZE', label: '提现解冻' },
    { value: 'GROUP_BUY_PURCHASE', label: '拼团消费' },
    { value: 'GROUP_BUY_REFUND', label: '拼团退款' },
    { value: 'GROUP_BUY_REFUND_TO_BALANCE', label: '拼团退款转余额' },
    { value: 'BONUS', label: '奖励' },
    { value: 'COIN_EXCHANGE', label: '币种兑换' },
  ];
  const points = [
    { value: 'LOTTERY_PURCHASE', label: '一元购消费' },
    { value: 'FULL_PURCHASE', label: '全款购买' },
    { value: 'MARKET_PURCHASE', label: '市场购买' },
    { value: 'RESALE_PURCHASE', label: '转售购买' },
    { value: 'SPIN_REWARD', label: '转盘奖励' },
    { value: 'NEW_USER_GIFT', label: '新用户礼物' },
    { value: 'SHOWOFF_REWARD', label: '晒单奖励' },
    { value: 'COMMISSION', label: '佣金收入' },
    { value: 'COMMISSION_PAYOUT', label: '批量佣金发放' },
    { value: 'REFERRAL_REWARD', label: '邀请奖励' },
    { value: 'FIRST_GROUP_BUY_REWARD', label: '首次拼团奖励' },
    { value: 'GROUP_BUY_REFUND', label: '拼团退款转积分' },
    { value: 'MARKET_SALE', label: '市场出售' },
    { value: 'RESALE_INCOME', label: '转售收入' },
    { value: 'COIN_EXCHANGE', label: '币种兑换' },
  ];

  if (walletTab === 'TJS') return [...common, ...tjs];
  if (walletTab === 'LUCKY_COIN') return [...common, ...points];
  return [...common, ...tjs, ...points];
};

const UserFinancialPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();
  
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [period, setPeriod] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [walletTab, setWalletTab] = useState<WalletTab>('ALL');
  const [filters, setFilters] = useState({ type: '', status: '', startDate: '', endDate: '' });
  const [showFilters, setShowFilters] = useState(false);

  const fetchSummary = useCallback(async () => {
    if (!userId || !admin) return;
    try {
      // Edge Function 使用 GET + URL params 读取参数
      const params = new URLSearchParams({ user_id: userId, action: 'summary', period });
      const { data, error } = await supabase.functions.invoke(`admin-user-financial?${params.toString()}`, {
        method: 'GET',
        headers: { 'X-Admin-Id': admin.id }
      });
      if (error) throw error;
      if (data.success) setSummary(data.data);
    } catch (error: any) {
      console.error('Failed to fetch summary:', error);
      toast.error('获取财务概览失败');
    }
  }, [supabase, userId, admin, period]);

  const fetchTransactions = useCallback(async () => {
    if (!userId || !admin) return;
    setLoading(true);
    try {
      // Edge Function 使用 GET + URL params 读取参数
      const paramsObj: Record<string, string> = {
        user_id: userId,
        action: 'transactions',
        page: String(page),
        pageSize: '20',
      };
      if (walletTab !== 'ALL') paramsObj.walletType = walletTab;
      if (filters.type) paramsObj.type = filters.type;
      if (filters.status) paramsObj.status = filters.status;
      if (filters.startDate) paramsObj.startDate = filters.startDate;
      if (filters.endDate) paramsObj.endDate = filters.endDate;
      const params = new URLSearchParams(paramsObj);
      const { data, error } = await supabase.functions.invoke(`admin-user-financial?${params.toString()}`, {
        method: 'GET',
        headers: { 'X-Admin-Id': admin.id }
      });
      if (error) throw error;
      if (data.success) {
        setTransactions(data.data.transactions);
        setTotalPages(data.data.pagination.totalPages);
        setTotalCount(data.data.pagination.total);
      }
    } catch (error: any) {
      console.error('Failed to fetch transactions:', error);
      toast.error('获取交易流水失败');
    } finally {
      setLoading(false);
    }
  }, [supabase, userId, admin, page, filters, walletTab]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const handleExport = async () => {
    if (!userId || !admin || isExporting) return;
    setIsExporting(true);
    try {
      const paramsObj: Record<string, string> = {
        user_id: userId,
        action: 'export',
      };
      if (walletTab !== 'ALL') paramsObj.walletType = walletTab;
      if (filters.type) paramsObj.type = filters.type;
      if (filters.status) paramsObj.status = filters.status;
      if (filters.startDate) paramsObj.startDate = filters.startDate;
      if (filters.endDate) paramsObj.endDate = filters.endDate;
      const params = new URLSearchParams(paramsObj);
      const { data, error } = await supabase.functions.invoke(`admin-user-financial?${params.toString()}`, {
        method: 'GET',
        headers: { 'X-Admin-Id': admin.id }
      });

      if (error) throw error;
      
      // 假设 Edge Function 返回的是 CSV 字符串或 Blob
      const blob = new Blob([data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user_${userId}_transactions_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('导出成功');
    } catch (error: any) {
      console.error('Failed to export:', error);
      toast.error('导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  const handleWalletTabChange = (value: string) => {
    setWalletTab(value as WalletTab);
    setPage(1);
    setFilters({ type: '', status: '', startDate: '', endDate: '' });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  };

  if (loading && !summary) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/users')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">用户财务数据</h1>
            <p className="text-sm text-gray-500">用户ID: {userId?.substring(0, 8)}...</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={() => setShowFilters(!showFilters)} className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <FunnelIcon className="w-5 h-5" />
            <span>筛选</span>
          </button>
          <Button onClick={handleExport} disabled={isExporting} className="flex items-center space-x-2">
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DocumentArrowDownIcon className="w-5 h-5" />}
            <span>{isExporting ? '导出中...' : '导出'}</span>
          </Button>
        </div>
      </div>

      <div className="flex space-x-2 mb-6">
        {['today', 'week', 'month', 'all'].map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 rounded-lg transition-colors ${period === p ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            {p === 'today' ? '今日' : p === 'week' ? '本周' : p === 'month' ? '本月' : '全部'}
          </button>
        ))}
      </div>

      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm opacity-90 font-medium">💰 余额 (TJS)</span>
              <CurrencyDollarIcon className="w-6 h-6 opacity-80" />
            </div>
            <div className="text-3xl font-bold mb-4">{summary.cashBalance?.toFixed(2)} <span className="text-lg font-normal opacity-80">TJS</span></div>
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/20 text-sm">
              <div><div className="opacity-70">冻结</div><div className="font-semibold">{summary.cashFrozenBalance?.toFixed(2)}</div></div>
              <div><div className="opacity-70">累计充值</div><div className="font-semibold">{summary.totalDeposits?.toFixed(2)}</div></div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm opacity-90 font-medium">🎯 积分</span>
              <BanknotesIcon className="w-6 h-6 opacity-80" />
            </div>
            <div className="text-3xl font-bold mb-4">{summary.luckyCoinsBalance?.toFixed(2)} <span className="text-lg font-normal opacity-80">积分</span></div>
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/20 text-sm">
              <div><div className="opacity-70">冻结</div><div className="font-semibold">{summary.luckyFrozenBalance?.toFixed(2)}</div></div>
              <div><div className="opacity-70">累计获得</div><div className="font-semibold">{summary.pointsIncome?.toFixed(2)}</div></div>
            </div>
          </div>
        </div>
      )}

      <Tabs value={walletTab} onValueChange={handleWalletTabChange} className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList className="bg-gray-100">
            {WALLET_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="data-[state=active]:bg-white">
                <span className={tab.color}>{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="text-sm text-gray-500">共 {totalCount} 条记录</div>
        </div>

        {showFilters && (
          <div className="bg-white rounded-xl p-4 border border-gray-200 mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">交易类型</label>
              <select value={filters.type} onChange={(e) => { setFilters({ ...filters, type: e.target.value }); setPage(1); }} className="w-full px-3 py-2 border rounded-lg text-sm">
                {getTxTypeOptions(walletTab).map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">状态</label>
              <select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">全部</option>
                <option value="COMPLETED">已完成</option>
                <option value="PENDING">待处理</option>
                <option value="FAILED">失败</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">开始日期</label>
              <input type="date" value={filters.startDate} onChange={(e) => { setFilters({ ...filters, startDate: e.target.value }); setPage(1); }} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">结束日期</label>
              <input type="date" value={filters.endDate} onChange={(e) => { setFilters({ ...filters, endDate: e.target.value }); setPage(1); }} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>余额变化</TableHead>
                <TableHead>描述</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10">加载中...</TableCell></TableRow>
              ) : transactions.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-gray-500">暂无交易记录</TableCell></TableRow>
              ) : (
                transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs">{formatDateTime(tx.created_at)}</TableCell>
                    <TableCell>
                      <div className="text-xs font-medium">{tx.typeName}</div>
                      <div className="text-[10px] text-gray-400">{tx.walletType === 'TJS' ? '💰 TJS' : '🎯 积分'}</div>
                    </TableCell>
                    <TableCell className={`font-bold ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {tx.balance_before?.toFixed(2)} → {tx.balance_after?.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={tx.description}>{tx.description}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        tx.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 
                        tx.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {tx.status === 'COMPLETED' ? '完成' : tx.status === 'PENDING' ? '处理中' : '失败'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          
          <div className="p-4 flex justify-between items-center border-t">
            <span className="text-xs text-gray-500">第 {page} / {totalPages} 页</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>上一页</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>下一页</Button>
            </div>
          </div>
        </div>
      </Tabs>
    </div>
  );
};

export default UserFinancialPage;
