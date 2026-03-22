import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import {
  TrendingUp,
  UserPlus,
  DollarSign,
  Phone,
  Award,
  MapPin,
  Users,
  RefreshCw,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

type TimeRange = 'today' | 'week' | 'month';

interface Summary {
  total_registrations: number;
  total_first_charges: number;
  total_first_charge_amount: number;
  total_contacts: number;
  prev_registrations: number;
  prev_first_charges: number;
  prev_first_charge_amount: number;
  prev_contacts: number;
}

interface PromoterStat {
  user_id: string;
  name: string;
  referral_code: string;
  team_name: string | null;
  point_name: string | null;
  contacts: number;
  registrations: number;
  first_charges: number;
  first_charge_amount: number;
  reg_conversion_rate: number;
  charge_conversion_rate: number;
}

interface PointStat {
  point_id: string;
  point_name: string;
  area_size: string;
  staff_count: number;
  registrations: number;
  charges: number;
  charge_amount: number;
  reg_per_staff: number;
  health: 'good' | 'fair' | 'poor' | 'inactive';
}

// ============================================================
// Helpers
// ============================================================

function getTimeRangeParams(range: TimeRange) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  let rangeStart: Date;
  let rangeEnd: Date;
  let prevStart: Date;
  let prevEnd: Date;

  if (range === 'today') {
    rangeStart = todayStart;
    rangeEnd = tomorrowStart;
    prevStart = new Date(todayStart);
    prevStart.setDate(prevStart.getDate() - 1);
    prevEnd = todayStart;
  } else if (range === 'week') {
    const dayOfWeek = now.getDay() || 7; // Monday = 1
    rangeStart = new Date(todayStart);
    rangeStart.setDate(rangeStart.getDate() - dayOfWeek + 1);
    rangeEnd = tomorrowStart;
    prevStart = new Date(rangeStart);
    prevStart.setDate(prevStart.getDate() - 7);
    prevEnd = rangeStart;
  } else {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
    rangeEnd = tomorrowStart;
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = rangeStart;
  }

  return {
    range_start: rangeStart.toISOString(),
    range_end: rangeEnd.toISOString(),
    prev_start: prevStart.toISOString(),
    prev_end: prevEnd.toISOString(),
  };
}

function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) {
    return <Minus className="w-4 h-4 opacity-60" />;
  }
  if (current > previous) {
    const pct = previous > 0 ? Math.round((current - previous) / previous * 100) : 100;
    return (
      <span className="flex items-center gap-0.5 text-sm font-medium text-green-200">
        <ArrowUp className="w-4 h-4" />
        {pct}%
      </span>
    );
  }
  if (current < previous) {
    const pct = previous > 0 ? Math.round((previous - current) / previous * 100) : 0;
    return (
      <span className="flex items-center gap-0.5 text-sm font-medium text-red-200">
        <ArrowDown className="w-4 h-4" />
        {pct}%
      </span>
    );
  }
  return <Minus className="w-4 h-4 opacity-60" />;
}

function getRankIcon(index: number) {
  if (index === 0) return <span className="text-lg">🥇</span>;
  if (index === 1) return <span className="text-lg">🥈</span>;
  if (index === 2) return <span className="text-lg">🥉</span>;
  return <span className="text-sm text-gray-500 font-medium">{index + 1}</span>;
}

function getHealthBadge(health: string) {
  switch (health) {
    case 'good':
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">优秀</span>;
    case 'fair':
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">一般</span>;
    case 'poor':
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">较差</span>;
    default:
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">无数据</span>;
  }
}

function getAreaSizeLabel(size: string) {
  switch (size) {
    case 'large': return '大型';
    case 'medium': return '中型';
    case 'small': return '小型';
    default: return size;
  }
}

// ============================================================
// Main Component
// ============================================================

export default function PromoterDashboardPage() {
  const { supabase } = useSupabase();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('today');

  const [summary, setSummary] = useState<Summary>({
    total_registrations: 0,
    total_first_charges: 0,
    total_first_charge_amount: 0,
    total_contacts: 0,
    prev_registrations: 0,
    prev_first_charges: 0,
    prev_first_charge_amount: 0,
    prev_contacts: 0,
  });
  const [promoters, setPromoters] = useState<PromoterStat[]>([]);
  const [points, setPoints] = useState<PointStat[]>([]);

  const [sortField, setSortField] = useState<keyof PromoterStat>('registrations');
  const [sortAsc, setSortAsc] = useState(false);

  // ============================================================
  // Data Fetching - Single RPC Call
  // ============================================================

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = getTimeRangeParams(timeRange);

      // Single RPC call replaces 8-10 separate queries
      const { data, error: rpcError } = await supabase.rpc('get_promoter_command_center', {
        p_range_start: params.range_start,
        p_range_end: params.range_end,
        p_prev_start: params.prev_start,
        p_prev_end: params.prev_end,
      });

      if (rpcError) throw rpcError;

      if (data) {
        // Set summary
        const s = data.summary || {};
        setSummary({
          total_registrations: s.total_registrations || 0,
          total_first_charges: s.total_first_charges || 0,
          total_first_charge_amount: parseFloat(s.total_first_charge_amount) || 0,
          total_contacts: s.total_contacts || 0,
          prev_registrations: s.prev_registrations || 0,
          prev_first_charges: s.prev_first_charges || 0,
          prev_first_charge_amount: parseFloat(s.prev_first_charge_amount) || 0,
          prev_contacts: s.prev_contacts || 0,
        });

        // Set promoter stats
        const pList = (data.promoters || []).map((p: any) => ({
          user_id: p.user_id,
          name: p.name?.trim() || '暂无',
          referral_code: p.referral_code || '',
          team_name: p.team_name || null,
          point_name: p.point_name || null,
          contacts: p.contacts || 0,
          registrations: p.registrations || 0,
          first_charges: p.first_charges || 0,
          first_charge_amount: parseFloat(p.first_charge_amount) || 0,
          reg_conversion_rate: parseFloat(p.reg_conversion_rate) || 0,
          charge_conversion_rate: parseFloat(p.charge_conversion_rate) || 0,
        }));
        setPromoters(pList);

        // Set point stats
        const ptList = (data.points || []).map((pt: any) => ({
          point_id: pt.point_id,
          point_name: pt.point_name,
          area_size: pt.area_size || 'medium',
          staff_count: pt.staff_count || 0,
          registrations: pt.registrations || 0,
          charges: pt.charges || 0,
          charge_amount: parseFloat(pt.charge_amount) || 0,
          reg_per_staff: parseFloat(pt.reg_per_staff) || 0,
          health: pt.health || 'inactive',
        }));
        setPoints(ptList);
      }
    } catch (err: any) {
      console.error('Failed to fetch promoter dashboard stats:', err);
      setError(err.message || '加载地推数据失败');
    } finally {
      setLoading(false);
    }
  }, [supabase, timeRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Sort promoters
  const sortedPromoters = [...promoters].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortAsc ? aVal - bVal : bVal - aVal;
    }
    return sortAsc
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  const handleSort = (field: keyof PromoterStat) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getSortIcon = (field: keyof PromoterStat) => {
    if (sortField !== field) return '';
    return sortAsc ? ' ↑' : ' ↓';
  };

  // ============================================================
  // Render
  // ============================================================

  if (loading && promoters.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error && promoters.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-600" />
        <span className="text-red-800">{error}</span>
        <button
          onClick={fetchData}
          className="ml-auto px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-7 h-7" />
            地推作战指挥室
          </h1>
          <p className="text-gray-600 mt-1">实时监控地推团队的推广效果和关键指标</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Time Range Selector */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(['today', 'week', 'month'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  timeRange === range
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {range === 'today' ? '今日' : range === 'week' ? '本周' : '本月'}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard
          title="新增注册"
          value={summary.total_registrations}
          prevValue={summary.prev_registrations}
          icon={<UserPlus className="w-8 h-8" />}
          color="blue"
          format="number"
        />
        <SummaryCard
          title="充值赠送用户"
          value={summary.total_first_charges}
          prevValue={summary.prev_first_charges}
          icon={<DollarSign className="w-8 h-8" />}
          color="green"
          format="number"
        />
        <SummaryCard
          title="充值赠送金额"
          value={summary.total_first_charge_amount}
          prevValue={summary.prev_first_charge_amount}
          icon={<TrendingUp className="w-8 h-8" />}
          color="purple"
          format="currency"
        />
        <SummaryCard
          title="接触人数"
          value={summary.total_contacts}
          prevValue={summary.prev_contacts}
          icon={<Phone className="w-8 h-8" />}
          color="orange"
          format="number"
        />
      </div>

      {/* Promoter Leaderboard */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-500" />
            地推英雄榜
          </h2>
          <p className="text-sm text-gray-500 mt-1">点击列头可排序 · 自动每60秒刷新</p>
        </div>
        <div className="overflow-x-auto relative">
          {loading && promoters.length > 0 && (
            <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-500">排名</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 cursor-pointer hover:text-gray-900" onClick={() => handleSort('name')}>
                  姓名{getSortIcon('name')}
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">团队</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">点位</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 cursor-pointer hover:text-gray-900" onClick={() => handleSort('contacts')}>
                  接触{getSortIcon('contacts')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 cursor-pointer hover:text-gray-900" onClick={() => handleSort('registrations')}>
                  注册{getSortIcon('registrations')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 cursor-pointer hover:text-gray-900" onClick={() => handleSort('first_charges')}>
                  充值赠送{getSortIcon('first_charges')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 cursor-pointer hover:text-gray-900" onClick={() => handleSort('first_charge_amount')}>
                  金额(TJS){getSortIcon('first_charge_amount')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 cursor-pointer hover:text-gray-900" onClick={() => handleSort('reg_conversion_rate')}>
                  注册率{getSortIcon('reg_conversion_rate')}
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-500 cursor-pointer hover:text-gray-900" onClick={() => handleSort('charge_conversion_rate')}>
                  充值率{getSortIcon('charge_conversion_rate')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPromoters.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>暂无地推人员数据</p>
                    <p className="text-xs mt-1">请先在"地推人员管理"页面添加地推人员</p>
                  </td>
                </tr>
              ) : (
                sortedPromoters.map((p, idx) => {
                  const isWarning = p.charge_conversion_rate < 15 && p.registrations > 0;
                  return (
                    <tr
                      key={p.user_id}
                      className={`border-b last:border-0 ${isWarning ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-4 py-3 text-center font-medium">
                        {getRankIcon(idx)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{p.name}</div>
                        <div className="text-xs text-gray-500">{p.referral_code}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.team_name || '--'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.point_name || '--'}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{p.contacts}</td>
                      <td className="px-4 py-3 text-right font-medium text-blue-600">{p.registrations}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">{p.first_charges}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{p.first_charge_amount.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right">
                        {p.contacts > 0 ? (
                          <span className={p.reg_conversion_rate >= 30 ? 'text-green-600' : p.reg_conversion_rate >= 20 ? 'text-yellow-600' : 'text-red-600'}>
                            {p.reg_conversion_rate}%
                          </span>
                        ) : '--'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.registrations > 0 ? (
                          <span className={p.charge_conversion_rate >= 25 ? 'text-green-600' : p.charge_conversion_rate >= 15 ? 'text-yellow-600' : 'text-red-600'}>
                            {p.charge_conversion_rate}%
                            {isWarning && <span className="ml-1">⚠️</span>}
                          </span>
                        ) : '--'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Point Stats */}
      {points.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-red-500" />
              点位概况
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">点位</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">面积</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">人数</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">注册</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">充值</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">金额(TJS)</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">人均注册</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">健康度</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">建议</th>
                </tr>
              </thead>
              <tbody>
                {points.map((pt) => (
                  <tr key={pt.point_id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{pt.point_name}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{getAreaSizeLabel(pt.area_size)}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{pt.staff_count}</td>
                    <td className="px-4 py-3 text-right font-medium text-blue-600">{pt.registrations}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-600">{pt.charges}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{pt.charge_amount.toFixed(0)}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{pt.reg_per_staff}</td>
                    <td className="px-4 py-3 text-center">{getHealthBadge(pt.health)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {pt.health === 'good' && '保持现有投入'}
                      {pt.health === 'fair' && '考虑增派人手'}
                      {pt.health === 'poor' && '考虑撤销或更换'}
                      {pt.health === 'inactive' && '暂无数据'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

interface SummaryCardProps {
  title: string;
  value: number;
  prevValue: number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'orange';
  format: 'number' | 'currency';
}

function SummaryCard({ title, value, prevValue, icon, color, format }: SummaryCardProps) {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
  };

  const displayValue = format === 'currency'
    ? `TJS ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : value.toLocaleString();

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-lg p-6 text-white shadow-lg`}>
      <div className="flex items-center justify-between mb-4">
        <div className="opacity-80">{icon}</div>
        <TrendIndicator current={value} previous={prevValue} />
      </div>
      <h3 className="text-sm font-medium opacity-90">{title}</h3>
      <p className="text-3xl font-bold mt-1">{displayValue}</p>
      <p className="text-xs mt-2 opacity-80">
        {prevValue > 0 ? `上期: ${format === 'currency' ? 'TJS ' : ''}${prevValue.toLocaleString()}` : '暂无对比数据'}
      </p>
    </div>
  );
}
