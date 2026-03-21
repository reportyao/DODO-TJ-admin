import React, { useState, useEffect } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { 
  Users, 
  Gift, 
  DollarSign, 
  ShoppingCart, 
  TrendingUp, 
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalLotteries: number;
  activeLotteries: number;
  completedLotteries: number;
  totalOrders: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  totalRevenue: number;
  todayRevenue: number;
}

export default function DashboardPage() {
  const { supabase } = useSupabase();
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    totalLotteries: 0,
    activeLotteries: 0,
    completedLotteries: 0,
    totalOrders: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
    totalRevenue: 0,
    todayRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // 获取用户统计
      const { count: totalUsers, error: usersError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });
      
      if (usersError) {throw usersError;}

      // 获取活跃用户数 (最近7天有登录)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { count: activeUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_login_at', sevenDaysAgo.toISOString());

      // 获取商城活动统计
      const { count: totalLotteries, error: lotteriesError } = await supabase
        .from('lotteries')
        .select('*', { count: 'exact', head: true });
      
      if (lotteriesError) {throw lotteriesError;}

      const { count: activeLotteries } = await supabase
        .from('lotteries')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ACTIVE');

      const { count: completedLotteries } = await supabase
        .from('lotteries')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'COMPLETED');

      // 获取订单统计（同时统计一元购彩票订单和全款购买订单）
      const [{ count: lotteryOrders }, { count: fullOrders }] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }),
        supabase.from('full_purchase_orders').select('*', { count: 'exact', head: true }),
      ]);
      const totalOrders = (lotteryOrders || 0) + (fullOrders || 0);

      // 获取待处理充值
      const { count: pendingDeposits } = await supabase
        .from('deposit_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');

      // 获取待处理提现
      const { count: pendingWithdrawals } = await supabase
        .from('withdrawal_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');

      // 获取总收入 - 直接取字段在客户端汇总（Supabase JS 不支持 .sum() 语法）
      const { data: revenueData } = await supabase
        .from('deposit_requests')
        .select('amount')
        .eq('status', 'APPROVED');
      const totalRevenue = (revenueData || []).reduce(
        (sum: number, r: any) => sum + (Number(r.amount) || 0), 0
      );

      // 获取今日收入
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: todayData } = await supabase
        .from('deposit_requests')
        .select('amount')
        .eq('status', 'APPROVED')
        .gte('processed_at', today.toISOString());
      const todayRevenue = (todayData || []).reduce(
        (sum: number, r: any) => sum + (Number(r.amount) || 0), 0
      );

      setStats({
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        totalLotteries: totalLotteries || 0,
        activeLotteries: activeLotteries || 0,
        completedLotteries: completedLotteries || 0,
        totalOrders: totalOrders || 0,
        pendingDeposits: pendingDeposits || 0,
        pendingWithdrawals: pendingWithdrawals || 0,
        totalRevenue,
        todayRevenue,
      });
    } catch (err: any) {
      console.error('Failed to fetch dashboard stats:', err);
      setError(err.message || '加载统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-600" />
        <span className="text-red-800">{error}</span>
        <button 
          onClick={fetchStats}
          className="ml-auto px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">仪表盘</h1>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <RefreshCw className="w-4 h-4" />
          刷新数据
        </button>
      </div>

      {/* 主要统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="总用户数"
          value={stats.totalUsers.toLocaleString()}
          subtitle={`活跃用户: ${stats.activeUsers}`}
          icon={<Users className="w-8 h-8" />}
          color="blue"
        />
        <StatCard
          title="商城活动"
          value={stats.totalLotteries.toLocaleString()}
          subtitle={`进行中: ${stats.activeLotteries} | 已完成: ${stats.completedLotteries}`}
          icon={<Gift className="w-8 h-8" />}
          color="purple"
        />
        <StatCard
          title="总收入"
          value={`TJS ${stats.totalRevenue.toFixed(2)}`}
          subtitle={`今日: TJS ${stats.todayRevenue.toFixed(2)}`}
          icon={<DollarSign className="w-8 h-8" />}
          color="green"
        />
        <StatCard
          title="订单总数"
          value={stats.totalOrders.toLocaleString()}
          subtitle="所有订单"
          icon={<ShoppingCart className="w-8 h-8" />}
          color="orange"
        />
      </div>

      {/* 待处理事项 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-600" />
            待处理事项
          </h2>
          <div className="space-y-4">
            <PendingItem
              title="待审核充值"
              count={stats.pendingDeposits}
              link="/admin/deposit-review"
              color="yellow"
            />
            <PendingItem
              title="待审核提现"
              count={stats.pendingWithdrawals}
              link="/admin/withdrawal-review"
              color="red"
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            快速统计
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">活跃商城活动</span>
              <span className="font-semibold text-purple-600">{stats.activeLotteries}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">已完成商城活动</span>
              <span className="font-semibold text-green-600">{stats.completedLotteries}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">用户活跃率</span>
              <span className="font-semibold text-blue-600">
                {stats.totalUsers > 0 
                  ? ((stats.activeUsers / stats.totalUsers) * 100).toFixed(1) 
                  : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  color: 'blue' | 'purple' | 'green' | 'orange';
}

function StatCard({ title, value, subtitle, icon, color }: StatCardProps) {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    green: 'from-green-500 to-green-600',
    orange: 'from-orange-500 to-orange-600',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-lg p-6 text-white shadow-lg`}>
      <div className="flex items-center justify-between mb-4">
        <div className="opacity-80">{icon}</div>
      </div>
      <h3 className="text-sm font-medium opacity-90">{title}</h3>
      <p className="text-3xl font-bold mt-1">{value}</p>
      <p className="text-xs mt-2 opacity-80">{subtitle}</p>
    </div>
  );
}

interface PendingItemProps {
  title: string;
  count: number;
  link: string;
  color: 'yellow' | 'red';
}

function PendingItem({ title, count, link, color }: PendingItemProps) {
  const colorClasses = {
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800',
  };

  return (
    <a
      href={link}
      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
    >
      <span className="text-gray-700">{title}</span>
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${colorClasses[color]}`}>
        {count}
      </span>
    </a>
  );
}
