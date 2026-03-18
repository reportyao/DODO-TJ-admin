import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  BarChart3,
  RefreshCw,
  Download,
  Calendar,
  Users,
  TrendingUp,
  DollarSign,
  Target,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface DailyReport {
  date: string;
  promoter_id: string;
  promoter_name: string;
  team_name: string;
  point_name: string;
  contacts: number;
  registrations: number;
  first_charges: number;
  first_charge_amount: number;
  reg_rate: number;
  charge_rate: number;
}

interface AggregatedReport {
  promoter_id: string;
  promoter_name: string;
  team_name: string;
  point_name: string;
  total_contacts: number;
  total_registrations: number;
  total_first_charges: number;
  total_first_charge_amount: number;
  avg_daily_regs: number;
  avg_reg_rate: number;
  avg_charge_rate: number;
  working_days: number;
  daily_salary: number;
  total_salary_cost: number;
  cost_per_registration: number;
  cost_per_charge: number;
}

interface TeamSummary {
  team_name: string;
  member_count: number;
  total_registrations: number;
  total_charges: number;
  total_charge_amount: number;
  total_salary_cost: number;
  cost_per_reg: number;
  cost_per_charge: number;
}

type ReportView = 'daily' | 'summary' | 'team';

// ============================================================
// Main Component
// ============================================================

export default function PromoterReportsPage() {
  const { supabase } = useSupabase();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportView, setReportView] = useState<ReportView>('summary');

  // Date range
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Data
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const [aggregatedReports, setAggregatedReports] = useState<AggregatedReport[]>([]);
  const [teamSummaries, setTeamSummaries] = useState<TeamSummary[]>([]);

  // Pagination for daily view
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // ============================================================
  // Data Fetching
  // ============================================================

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const rangeStart = new Date(startDate);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(endDate);
      rangeEnd.setHours(23, 59, 59, 999);

      // 1. Fetch promoter profiles
      const { data: ppData, error: ppError } = await supabase
        .from('promoter_profiles')
        .select('user_id, team_id, point_id, daily_base_salary, promoter_status, hire_date');

      if (ppError) throw ppError;
      if (!ppData || ppData.length === 0) {
        setDailyReports([]);
        setAggregatedReports([]);
        setTeamSummaries([]);
        setLoading(false);
        return;
      }

      const promoterUserIds = ppData.map(p => p.user_id);

      // 2. Fetch user info
      const { data: usersData } = await supabase
        .from('users')
        .select('id, first_name, last_name, telegram_username, referral_code')
        .in('id', promoterUserIds);

      // 3. Fetch teams & points
      const teamIds = [...new Set(ppData.map(p => p.team_id).filter(Boolean))];
      let teamsMap: Record<string, string> = {};
      if (teamIds.length > 0) {
        const { data: tData } = await supabase.from('promoter_teams').select('id, name').in('id', teamIds as string[]);
        if (tData) teamsMap = Object.fromEntries(tData.map(t => [t.id, t.name]));
      }

      const pointIds = [...new Set(ppData.map(p => p.point_id).filter(Boolean))];
      let pointsMap: Record<string, string> = {};
      if (pointIds.length > 0) {
        const { data: ptData } = await supabase.from('promotion_points').select('id, name').in('id', pointIds as string[]);
        if (ptData) pointsMap = Object.fromEntries(ptData.map(p => [p.id, p.name]));
      }

      // 4. Fetch registrations in range
      const { data: regsData } = await supabase
        .from('users')
        .select('id, referred_by_id, created_at')
        .in('referred_by_id', promoterUserIds)
        .gte('created_at', rangeStart.toISOString())
        .lte('created_at', rangeEnd.toISOString());

      // 5. Fetch all referred users for deposit lookup
      const { data: allReferredUsers } = await supabase
        .from('users')
        .select('id, referred_by_id')
        .in('referred_by_id', promoterUserIds);

      const referredUserIds = allReferredUsers?.map(u => u.id) || [];

      // 6. Fetch deposits in range
      let depositsInRange: any[] = [];
      if (referredUserIds.length > 0) {
        for (let i = 0; i < referredUserIds.length; i += 100) {
          const chunk = referredUserIds.slice(i, i + 100);
          const { data: dData } = await supabase
            .from('deposit_requests')
            .select('id, user_id, amount, created_at')
            .in('user_id', chunk)
            .eq('status', 'APPROVED')
            .gte('created_at', rangeStart.toISOString())
            .lte('created_at', rangeEnd.toISOString());
          if (dData) depositsInRange.push(...dData);
        }
      }

      // 7. Fetch daily logs
      const { data: logsData } = await supabase
        .from('promoter_daily_logs')
        .select('promoter_id, contact_count, log_date')
        .in('promoter_id', promoterUserIds)
        .gte('log_date', startDate)
        .lte('log_date', endDate);

      // 8. Build daily reports
      const dailyMap: Record<string, DailyReport> = {};

      // Generate dates in range
      const dates: string[] = [];
      const d = new Date(startDate);
      const ed = new Date(endDate);
      while (d <= ed) {
        dates.push(d.toISOString().split('T')[0]);
        d.setDate(d.getDate() + 1);
      }

      ppData.forEach(pp => {
        const user = usersData?.find(u => u.id === pp.user_id);
        const name = user?.telegram_username || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'N/A';
        const teamName = pp.team_id ? teamsMap[pp.team_id] || '--' : '--';
        const pointName = pp.point_id ? pointsMap[pp.point_id] || '--' : '--';

        dates.forEach(date => {
          const key = `${pp.user_id}_${date}`;

          // Registrations for this promoter on this date
          const dayRegs = regsData?.filter(r =>
            r.referred_by_id === pp.user_id &&
            r.created_at.startsWith(date)
          ).length || 0;

          // Deposits for this promoter's referred users on this date
          const referredByThis = allReferredUsers?.filter(u => u.referred_by_id === pp.user_id).map(u => u.id) || [];
          const dayDeposits = depositsInRange.filter(dep =>
            referredByThis.includes(dep.user_id) &&
            dep.created_at.startsWith(date)
          );
          const dayCharges = new Set(dayDeposits.map(dep => dep.user_id)).size;
          const dayChargeAmt = dayDeposits.reduce((s: number, dep: any) => s + (parseFloat(dep.amount) || 0), 0);

          // Contacts from daily log
          const dayContacts = logsData?.find(l =>
            l.promoter_id === pp.user_id && l.log_date === date
          )?.contact_count || 0;

          // Only include days with any activity
          if (dayRegs > 0 || dayCharges > 0 || dayContacts > 0) {
            dailyMap[key] = {
              date,
              promoter_id: pp.user_id,
              promoter_name: name,
              team_name: teamName,
              point_name: pointName,
              contacts: dayContacts,
              registrations: dayRegs,
              first_charges: dayCharges,
              first_charge_amount: dayChargeAmt,
              reg_rate: dayContacts > 0 ? Math.round(dayRegs / dayContacts * 1000) / 10 : 0,
              charge_rate: dayRegs > 0 ? Math.round(dayCharges / dayRegs * 1000) / 10 : 0,
            };
          }
        });
      });

      const dailyList = Object.values(dailyMap).sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.registrations - a.registrations;
      });

      setDailyReports(dailyList);

      // 9. Build aggregated reports
      const aggMap: Record<string, AggregatedReport> = {};

      ppData.forEach(pp => {
        const user = usersData?.find(u => u.id === pp.user_id);
        const name = user?.telegram_username || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'N/A';
        const teamName = pp.team_id ? teamsMap[pp.team_id] || '--' : '--';
        const pointName = pp.point_id ? pointsMap[pp.point_id] || '--' : '--';

        const myDailyReports = dailyList.filter(dr => dr.promoter_id === pp.user_id);
        const totalContacts = myDailyReports.reduce((s, dr) => s + dr.contacts, 0);
        const totalRegs = myDailyReports.reduce((s, dr) => s + dr.registrations, 0);
        const totalCharges = myDailyReports.reduce((s, dr) => s + dr.first_charges, 0);
        const totalChargeAmt = myDailyReports.reduce((s, dr) => s + dr.first_charge_amount, 0);
        const workingDays = myDailyReports.length;
        const totalSalaryCost = workingDays * (pp.daily_base_salary || 0);

        aggMap[pp.user_id] = {
          promoter_id: pp.user_id,
          promoter_name: name,
          team_name: teamName,
          point_name: pointName,
          total_contacts: totalContacts,
          total_registrations: totalRegs,
          total_first_charges: totalCharges,
          total_first_charge_amount: totalChargeAmt,
          avg_daily_regs: workingDays > 0 ? Math.round(totalRegs / workingDays * 10) / 10 : 0,
          avg_reg_rate: totalContacts > 0 ? Math.round(totalRegs / totalContacts * 1000) / 10 : 0,
          avg_charge_rate: totalRegs > 0 ? Math.round(totalCharges / totalRegs * 1000) / 10 : 0,
          working_days: workingDays,
          daily_salary: pp.daily_base_salary || 0,
          total_salary_cost: totalSalaryCost,
          cost_per_registration: totalRegs > 0 ? Math.round(totalSalaryCost / totalRegs * 100) / 100 : 0,
          cost_per_charge: totalCharges > 0 ? Math.round(totalSalaryCost / totalCharges * 100) / 100 : 0,
        };
      });

      const aggList = Object.values(aggMap)
        .filter(a => a.total_registrations > 0 || a.working_days > 0)
        .sort((a, b) => b.total_registrations - a.total_registrations);

      setAggregatedReports(aggList);

      // 10. Build team summaries
      const teamMap: Record<string, TeamSummary> = {};
      aggList.forEach(a => {
        const tn = a.team_name || '未分组';
        if (!teamMap[tn]) {
          teamMap[tn] = {
            team_name: tn,
            member_count: 0,
            total_registrations: 0,
            total_charges: 0,
            total_charge_amount: 0,
            total_salary_cost: 0,
            cost_per_reg: 0,
            cost_per_charge: 0,
          };
        }
        teamMap[tn].member_count += 1;
        teamMap[tn].total_registrations += a.total_registrations;
        teamMap[tn].total_charges += a.total_first_charges;
        teamMap[tn].total_charge_amount += a.total_first_charge_amount;
        teamMap[tn].total_salary_cost += a.total_salary_cost;
      });

      Object.values(teamMap).forEach(ts => {
        ts.cost_per_reg = ts.total_registrations > 0 ? Math.round(ts.total_salary_cost / ts.total_registrations * 100) / 100 : 0;
        ts.cost_per_charge = ts.total_charges > 0 ? Math.round(ts.total_salary_cost / ts.total_charges * 100) / 100 : 0;
      });

      setTeamSummaries(Object.values(teamMap).sort((a, b) => b.total_registrations - a.total_registrations));

    } catch (err: any) {
      console.error('Failed to fetch reports:', err);
      setError(err.message || '加载报表失败');
    } finally {
      setLoading(false);
    }
  }, [supabase, startDate, endDate]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // ============================================================
  // Quick date range presets
  // ============================================================

  const setQuickRange = (preset: string) => {
    const now = new Date();
    let start: Date;

    switch (preset) {
      case 'today':
        start = new Date(now);
        break;
      case 'yesterday':
        start = new Date(now);
        start.setDate(start.getDate() - 1);
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(start.toISOString().split('T')[0]);
        return;
      case 'week':
        start = new Date(now);
        const day = start.getDay();
        start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
        return;
      default:
        return;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(now.toISOString().split('T')[0]);
  };

  // ============================================================
  // Export
  // ============================================================

  const csvEscape = (val: any): string => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const exportReport = () => {
    let csvContent = '';

    if (reportView === 'daily') {
      const headers = ['日期', '姓名', '团队', '点位', '接触', '注册', '充值赠送', '金额(TJS)', '注册率%', '充值率%'];
      const rows = dailyReports.map(r => [
        r.date, r.promoter_name, r.team_name, r.point_name,
        r.contacts, r.registrations, r.first_charges,
        r.first_charge_amount.toFixed(0), r.reg_rate, r.charge_rate,
      ]);
      csvContent = [headers.map(csvEscape).join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
    } else if (reportView === 'summary') {
      const headers = ['姓名', '团队', '点位', '工作天数', '总接触', '总注册', '总充值赠送', '总金额(TJS)', '日均注册', '注册率%', '充值率%', '日薪', '总薪资', '注册成本', '充值成本'];
      const rows = aggregatedReports.map(r => [
        r.promoter_name, r.team_name, r.point_name, r.working_days,
        r.total_contacts, r.total_registrations, r.total_first_charges,
        r.total_first_charge_amount.toFixed(0), r.avg_daily_regs,
        r.avg_reg_rate, r.avg_charge_rate, r.daily_salary,
        r.total_salary_cost.toFixed(0), r.cost_per_registration.toFixed(2),
        r.cost_per_charge.toFixed(2),
      ]);
      csvContent = [headers.map(csvEscape).join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
    } else {
      const headers = ['团队', '人数', '总注册', '总充值', '总金额(TJS)', '总薪资(TJS)', '注册成本', '充值成本'];
      const rows = teamSummaries.map(r => [
        r.team_name, r.member_count, r.total_registrations, r.total_charges,
        r.total_charge_amount.toFixed(0), r.total_salary_cost.toFixed(0),
        r.cost_per_reg.toFixed(2), r.cost_per_charge.toFixed(2),
      ]);
      csvContent = [headers.map(csvEscape).join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
    }

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `promoter_report_${reportView}_${startDate}_${endDate}.csv`;
    link.click();
  };

  // ============================================================
  // Pagination
  // ============================================================

  const totalPages = Math.ceil(dailyReports.length / pageSize);
  const paginatedDaily = dailyReports.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-7 h-7" />
            KPI报表
          </h1>
          <p className="text-gray-600 mt-1">地推人员绩效分析与成本核算</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportReport}>
            <Download className="w-4 h-4 mr-1" /> 导出CSV
          </Button>
          <Button size="sm" onClick={fetchReports} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
        </div>
      </div>

      {/* Date Range & Quick Presets */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-500">至</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1">
            {[
              { key: 'today', label: '今日' },
              { key: 'yesterday', label: '昨日' },
              { key: 'week', label: '本周' },
              { key: 'month', label: '本月' },
              { key: 'last_month', label: '上月' },
            ].map(p => (
              <button
                key={p.key}
                onClick={() => setQuickRange(p.key)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { key: 'summary' as ReportView, label: '汇总报表', icon: <TrendingUp className="w-4 h-4" /> },
          { key: 'daily' as ReportView, label: '每日明细', icon: <Calendar className="w-4 h-4" /> },
          { key: 'team' as ReportView, label: '团队对比', icon: <Users className="w-4 h-4" /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => { setReportView(tab.key); setCurrentPage(1); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              reportView === tab.key
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      )}

      {/* ==================== Summary View ==================== */}
      {!loading && reportView === 'summary' && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MiniStatCard
              label="总注册"
              value={aggregatedReports.reduce((s, r) => s + r.total_registrations, 0)}
              icon={<Users className="w-5 h-5 text-blue-500" />}
            />
            <MiniStatCard
              label="总充值赠送"
              value={aggregatedReports.reduce((s, r) => s + r.total_first_charges, 0)}
              icon={<DollarSign className="w-5 h-5 text-green-500" />}
            />
            <MiniStatCard
              label="总充值赠送金额"
              value={`TJS ${aggregatedReports.reduce((s, r) => s + r.total_first_charge_amount, 0).toLocaleString()}`}
              icon={<TrendingUp className="w-5 h-5 text-purple-500" />}
            />
            <MiniStatCard
              label="总薪资成本"
              value={`TJS ${aggregatedReports.reduce((s, r) => s + r.total_salary_cost, 0).toLocaleString()}`}
              icon={<Target className="w-5 h-5 text-orange-500" />}
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>姓名</TableHead>
                    <TableHead>团队</TableHead>
                    <TableHead>点位</TableHead>
                    <TableHead className="text-right">工作天</TableHead>
                    <TableHead className="text-right">总接触</TableHead>
                    <TableHead className="text-right">总注册</TableHead>
                    <TableHead className="text-right">总充值赠送</TableHead>
                    <TableHead className="text-right">金额(TJS)</TableHead>
                    <TableHead className="text-right">日均注册</TableHead>
                    <TableHead className="text-right">注册率</TableHead>
                    <TableHead className="text-right">充值率</TableHead>
                    <TableHead className="text-right">薪资成本</TableHead>
                    <TableHead className="text-right">注册成本</TableHead>
                    <TableHead className="text-right">充值成本</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregatedReports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={14} className="text-center py-12 text-gray-500">
                        所选时间段内暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    aggregatedReports.map(r => (
                      <TableRow key={r.promoter_id}>
                        <TableCell className="font-medium">{r.promoter_name}</TableCell>
                        <TableCell className="text-gray-600">{r.team_name}</TableCell>
                        <TableCell className="text-gray-600">{r.point_name}</TableCell>
                        <TableCell className="text-right">{r.working_days}</TableCell>
                        <TableCell className="text-right">{r.total_contacts}</TableCell>
                        <TableCell className="text-right font-medium text-blue-600">{r.total_registrations}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">{r.total_first_charges}</TableCell>
                        <TableCell className="text-right">{r.total_first_charge_amount.toFixed(0)}</TableCell>
                        <TableCell className="text-right">{r.avg_daily_regs}</TableCell>
                        <TableCell className="text-right">
                          <span className={r.avg_reg_rate >= 30 ? 'text-green-600' : r.avg_reg_rate >= 20 ? 'text-yellow-600' : 'text-red-600'}>
                            {r.avg_reg_rate}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={r.avg_charge_rate >= 25 ? 'text-green-600' : r.avg_charge_rate >= 15 ? 'text-yellow-600' : 'text-red-600'}>
                            {r.avg_charge_rate}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{r.total_salary_cost.toFixed(0)}</TableCell>
                        <TableCell className="text-right">
                          {r.cost_per_registration > 0 ? r.cost_per_registration.toFixed(1) : '--'}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.cost_per_charge > 0 ? r.cost_per_charge.toFixed(1) : '--'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* ==================== Daily View ==================== */}
      {!loading && reportView === 'daily' && (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>团队</TableHead>
                    <TableHead>点位</TableHead>
                    <TableHead className="text-right">接触</TableHead>
                    <TableHead className="text-right">注册</TableHead>
                    <TableHead className="text-right">充值赠送</TableHead>
                    <TableHead className="text-right">金额(TJS)</TableHead>
                    <TableHead className="text-right">注册率</TableHead>
                    <TableHead className="text-right">充值率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDaily.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-12 text-gray-500">
                        所选时间段内暂无每日数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedDaily.map((r, idx) => (
                      <TableRow key={`${r.promoter_id}_${r.date}_${idx}`}>
                        <TableCell className="font-medium">{r.date}</TableCell>
                        <TableCell>{r.promoter_name}</TableCell>
                        <TableCell className="text-gray-600">{r.team_name}</TableCell>
                        <TableCell className="text-gray-600">{r.point_name}</TableCell>
                        <TableCell className="text-right">{r.contacts}</TableCell>
                        <TableCell className="text-right font-medium text-blue-600">{r.registrations}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">{r.first_charges}</TableCell>
                        <TableCell className="text-right">{r.first_charge_amount.toFixed(0)}</TableCell>
                        <TableCell className="text-right">{r.reg_rate > 0 ? `${r.reg_rate}%` : '--'}</TableCell>
                        <TableCell className="text-right">{r.charge_rate > 0 ? `${r.charge_rate}%` : '--'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                共 {dailyReports.length} 条记录，第 {currentPage}/{totalPages} 页
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" /> 上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  下一页 <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ==================== Team View ==================== */}
      {!loading && reportView === 'team' && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>团队</TableHead>
                  <TableHead className="text-right">人数</TableHead>
                  <TableHead className="text-right">总注册</TableHead>
                  <TableHead className="text-right">总充值</TableHead>
                  <TableHead className="text-right">充值金额(TJS)</TableHead>
                  <TableHead className="text-right">薪资成本(TJS)</TableHead>
                  <TableHead className="text-right">注册成本</TableHead>
                  <TableHead className="text-right">充值成本</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamSummaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-gray-500">
                      所选时间段内暂无团队数据
                    </TableCell>
                  </TableRow>
                ) : (
                  teamSummaries.map(ts => {
                    const roi = ts.total_salary_cost > 0
                      ? ((ts.total_charge_amount - ts.total_salary_cost) / ts.total_salary_cost * 100).toFixed(1)
                      : '--';
                    return (
                      <TableRow key={ts.team_name}>
                        <TableCell className="font-medium">{ts.team_name}</TableCell>
                        <TableCell className="text-right">{ts.member_count}</TableCell>
                        <TableCell className="text-right font-medium text-blue-600">{ts.total_registrations}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">{ts.total_charges}</TableCell>
                        <TableCell className="text-right">{ts.total_charge_amount.toFixed(0)}</TableCell>
                        <TableCell className="text-right">{ts.total_salary_cost.toFixed(0)}</TableCell>
                        <TableCell className="text-right">{ts.cost_per_reg > 0 ? ts.cost_per_reg.toFixed(1) : '--'}</TableCell>
                        <TableCell className="text-right">{ts.cost_per_charge > 0 ? ts.cost_per_charge.toFixed(1) : '--'}</TableCell>
                        <TableCell className="text-right">
                          {roi !== '--' ? (
                            <span className={parseFloat(roi) >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                              {roi}%
                            </span>
                          ) : '--'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function MiniStatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
      <div className="p-2 bg-gray-50 rounded-lg">{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-bold text-gray-900">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      </div>
    </div>
  );
}
