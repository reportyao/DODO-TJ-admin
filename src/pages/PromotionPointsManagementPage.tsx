import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { toast } from 'react-hot-toast';
import {
  MapPin,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Search,
  AlertCircle,
  TrendingUp,
  Users,
  DollarSign,
  UserPlus,
  ArrowUp,
  ArrowDown,
  Minus,
  Download,
  BarChart3,
  Eye,
  EyeOff,
  Activity,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface PromotionPoint {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  area_size: 'large' | 'medium' | 'small';
  point_status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

interface PointWithStats extends PromotionPoint {
  staff_count: number;
  registrations: number;
  charges: number;
  charge_amount: number;
  contacts: number;
  reg_per_staff: number;
  charge_per_staff: number;
  reg_conversion_rate: number;
  charge_conversion_rate: number;
  health: 'good' | 'fair' | 'poor' | 'inactive';
}

interface PointStaffMember {
  user_id: string;
  user_name: string;
  referral_code: string | null;
  promoter_status: string;
  registrations: number;
  charges: number;
  charge_amount: number;
}

type TimeRange = 'today' | 'week' | 'month';
type ActiveView = 'management' | 'analytics';
type SortField = keyof Pick<PointWithStats, 'name' | 'staff_count' | 'registrations' | 'charges' | 'charge_amount' | 'reg_per_staff' | 'health'>;

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
    const dayOfWeek = now.getDay() || 7;
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

function getAreaSizeLabel(size: string) {
  switch (size) {
    case 'large': return '大型';
    case 'medium': return '中型';
    case 'small': return '小型';
    default: return size;
  }
}

function getAreaSizeBadge(size: string) {
  switch (size) {
    case 'large':
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">大型</span>;
    case 'medium':
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">中型</span>;
    case 'small':
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">小型</span>;
    default:
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">{size}</span>;
  }
}

function getPointStatusBadge(status: string) {
  return status === 'active'
    ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">启用</span>
    : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">停用</span>;
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

function getHealthSuggestion(health: string) {
  switch (health) {
    case 'good': return '保持现有投入';
    case 'fair': return '考虑增派人手或优化话术';
    case 'poor': return '建议撤销或更换点位';
    default: return '暂无数据，待观察';
  }
}

function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) {
    return <Minus className="w-3.5 h-3.5 text-gray-400" />;
  }
  if (current > previous) {
    const pct = previous > 0 ? Math.round((current - previous) / previous * 100) : 100;
    return (
      <span className="flex items-center gap-0.5 text-xs font-medium text-green-600">
        <ArrowUp className="w-3.5 h-3.5" />
        {pct}%
      </span>
    );
  }
  if (current < previous) {
    const pct = previous > 0 ? Math.round((previous - current) / previous * 100) : 0;
    return (
      <span className="flex items-center gap-0.5 text-xs font-medium text-red-600">
        <ArrowDown className="w-3.5 h-3.5" />
        {pct}%
      </span>
    );
  }
  return <Minus className="w-3.5 h-3.5 text-gray-400" />;
}

// ============================================================
// Main Component
// ============================================================

export default function PromotionPointsManagementPage() {
  const { supabase } = useSupabase();

  // View state
  const [activeView, setActiveView] = useState<ActiveView>('management');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Points data
  const [points, setPoints] = useState<PromotionPoint[]>([]);
  const [pointsWithStats, setPointsWithStats] = useState<PointWithStats[]>([]);

  // Analytics state
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [sortField, setSortField] = useState<SortField>('registrations');
  const [sortAsc, setSortAsc] = useState(false);

  // Summary stats for analytics
  const [totalStats, setTotalStats] = useState({
    total_points: 0,
    active_points: 0,
    total_staff: 0,
    total_registrations: 0,
    total_charges: 0,
    total_charge_amount: 0,
    prev_registrations: 0,
    prev_charges: 0,
    prev_charge_amount: 0,
  });

  // Dialog state
  const [showAddPoint, setShowAddPoint] = useState(false);
  const [editingPoint, setEditingPoint] = useState<PromotionPoint | null>(null);
  const [deletePointTarget, setDeletePointTarget] = useState<PromotionPoint | null>(null);
  const [deletingPoint, setDeletingPoint] = useState(false);
  const [pointForm, setPointForm] = useState({
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    area_size: 'medium' as 'large' | 'medium' | 'small',
    point_status: 'active' as 'active' | 'inactive',
  });

  // Point detail dialog
  const [showPointDetail, setShowPointDetail] = useState(false);
  const [detailPoint, setDetailPoint] = useState<PointWithStats | null>(null);
  const [detailStaff, setDetailStaff] = useState<PointStaffMember[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // ============================================================
  // Data Fetching - Management View
  // ============================================================

  const fetchPoints = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('promotion_points')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Count staff per point
      const { data: ppData } = await supabase
        .from('promoter_profiles')
        .select('point_id')
        .eq('promoter_status', 'active');

      const staffCounts: Record<string, number> = {};
      ppData?.forEach(pp => {
        if (pp.point_id) {
          staffCounts[pp.point_id] = (staffCounts[pp.point_id] || 0) + 1;
        }
      });

      const enriched = (data || []).map(p => ({
        ...p,
        staff_count: staffCounts[p.id] || 0,
      }));

      setPoints(enriched as PromotionPoint[]);
    } catch (err: any) {
      console.error('Failed to fetch points:', err);
      toast.error('加载点位失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // ============================================================
  // Data Fetching - Analytics View
  // ============================================================

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const params = getTimeRangeParams(timeRange);

      // Always fetch all points from the table to get accurate total count
      const { data: allPointsData } = await supabase
        .from('promotion_points')
        .select('*')
        .order('created_at', { ascending: false });

      // Also fetch staff counts for all points
      const { data: ppData } = await supabase
        .from('promoter_profiles')
        .select('user_id, point_id, promoter_status')
        .eq('promoter_status', 'active');

      const staffCounts: Record<string, number> = {};
      ppData?.forEach(pp => {
        if (pp.point_id) {
          staffCounts[pp.point_id] = (staffCounts[pp.point_id] || 0) + 1;
        }
      });

      // Try to use the RPC function first (get_promoter_command_center)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_promoter_command_center', {
        p_range_start: params.range_start,
        p_range_end: params.range_end,
        p_prev_start: params.prev_start,
        p_prev_end: params.prev_end,
      });

      if (rpcError) {
        console.warn('RPC get_promoter_command_center failed, falling back to manual query:', rpcError);
        await fetchAnalyticsManual(params);
        return;
      }

      if (rpcData) {
        // Build a map of RPC point stats by point_id
        const rpcPointMap: Record<string, any> = {};
        (rpcData.points || []).forEach((pt: any) => {
          if (pt.point_id) rpcPointMap[pt.point_id] = pt;
        });

        // Merge: use all points from the table, enrich with RPC stats where available
        const ptList: PointWithStats[] = (allPointsData || []).map(pt => {
          const rpcPt = rpcPointMap[pt.id];
          const sc = rpcPt?.staff_count || staffCounts[pt.id] || 0;
          const regs = rpcPt?.registrations || 0;
          const charges = rpcPt?.charges || 0;
          const chargeAmount = parseFloat(rpcPt?.charge_amount) || 0;
          const contacts = rpcPt?.contacts || 0;
          const regPerStaff = sc > 0 ? Math.round(regs / sc * 10) / 10 : 0;

          let health: 'good' | 'fair' | 'poor' | 'inactive' = 'inactive';
          if (pt.point_status === 'active' && sc > 0) {
            if (regPerStaff >= 15) health = 'good';
            else if (regPerStaff >= 8) health = 'fair';
            else health = 'poor';
          }

          return {
            ...pt,
            staff_count: sc,
            registrations: regs,
            charges,
            charge_amount: chargeAmount,
            contacts,
            reg_per_staff: regPerStaff,
            charge_per_staff: sc > 0 ? Math.round(charges / sc * 10) / 10 : 0,
            reg_conversion_rate: contacts > 0 ? Math.round(regs / contacts * 1000) / 10 : 0,
            charge_conversion_rate: regs > 0 ? Math.round(charges / regs * 1000) / 10 : 0,
            health,
          };
        });

        setPointsWithStats(ptList);

        // Calculate totals
        const totals = ptList.reduce((acc, pt) => ({
          total_registrations: acc.total_registrations + pt.registrations,
          total_charges: acc.total_charges + pt.charges,
          total_charge_amount: acc.total_charge_amount + pt.charge_amount,
          total_staff: acc.total_staff + pt.staff_count,
        }), { total_registrations: 0, total_charges: 0, total_charge_amount: 0, total_staff: 0 });

        // Get previous period data from summary if available
        const summary = rpcData.summary || {};

        setTotalStats({
          total_points: ptList.length,
          active_points: ptList.filter(p => p.point_status === 'active').length,
          total_staff: totals.total_staff,
          total_registrations: totals.total_registrations,
          total_charges: totals.total_charges,
          total_charge_amount: totals.total_charge_amount,
          prev_registrations: summary.prev_registrations || 0,
          prev_charges: summary.prev_first_charges || 0,
          prev_charge_amount: parseFloat(summary.prev_first_charge_amount) || 0,
        });
      }
    } catch (err: any) {
      console.error('Failed to fetch analytics:', err);
      toast.error('加载分析数据失败: ' + err.message);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [supabase, timeRange]);

  // Fallback manual query when RPC is not available
  const fetchAnalyticsManual = async (params: ReturnType<typeof getTimeRangeParams>) => {
    try {
      // 1. Fetch all points
      const { data: allPoints, error: ptError } = await supabase
        .from('promotion_points')
        .select('*')
        .order('created_at', { ascending: false });
      if (ptError) throw ptError;

      // 2. Fetch promoter profiles with point assignments
      const { data: ppData } = await supabase
        .from('promoter_profiles')
        .select('user_id, point_id, promoter_status')
        .eq('promoter_status', 'active');

      const staffCounts: Record<string, number> = {};
      const pointPromoterIds: Record<string, string[]> = {};
      ppData?.forEach(pp => {
        if (pp.point_id) {
          staffCounts[pp.point_id] = (staffCounts[pp.point_id] || 0) + 1;
          if (!pointPromoterIds[pp.point_id]) pointPromoterIds[pp.point_id] = [];
          pointPromoterIds[pp.point_id].push(pp.user_id);
        }
      });

      const allPromoterIds = ppData?.map(p => p.user_id) || [];

      // 3. Fetch registrations in current range
      let regsData: any[] = [];
      if (allPromoterIds.length > 0) {
        for (let i = 0; i < allPromoterIds.length; i += 100) {
          const chunk = allPromoterIds.slice(i, i + 100);
          const { data } = await supabase
            .from('users')
            .select('id, referred_by_id, created_at')
            .in('referred_by_id', chunk)
            .gte('created_at', params.range_start)
            .lt('created_at', params.range_end);
          if (data) regsData.push(...data);
        }
      }

      // 4. Fetch registrations in previous range
      let prevRegsData: any[] = [];
      if (allPromoterIds.length > 0) {
        for (let i = 0; i < allPromoterIds.length; i += 100) {
          const chunk = allPromoterIds.slice(i, i + 100);
          const { data } = await supabase
            .from('users')
            .select('id, referred_by_id, created_at')
            .in('referred_by_id', chunk)
            .gte('created_at', params.prev_start)
            .lt('created_at', params.prev_end);
          if (data) prevRegsData.push(...data);
        }
      }

      // 5. Fetch all referred user IDs for deposit lookup
      const { data: allReferredUsers } = await supabase
        .from('users')
        .select('id, referred_by_id')
        .in('referred_by_id', allPromoterIds.length > 0 ? allPromoterIds : ['__none__']);

      const referredUserIds = allReferredUsers?.map(u => u.id) || [];

      // 6. Fetch deposits in current range
      let depositsData: any[] = [];
      if (referredUserIds.length > 0) {
        for (let i = 0; i < referredUserIds.length; i += 100) {
          const chunk = referredUserIds.slice(i, i + 100);
          const { data } = await supabase
            .from('deposit_requests')
            .select('id, user_id, amount, created_at')
            .in('user_id', chunk)
            .eq('status', 'APPROVED')
            .gte('created_at', params.range_start)
            .lt('created_at', params.range_end);
          if (data) depositsData.push(...data);
        }
      }

      // 7. Fetch deposits in previous range
      let prevDepositsData: any[] = [];
      if (referredUserIds.length > 0) {
        for (let i = 0; i < referredUserIds.length; i += 100) {
          const chunk = referredUserIds.slice(i, i + 100);
          const { data } = await supabase
            .from('deposit_requests')
            .select('id, user_id, amount, created_at')
            .in('user_id', chunk)
            .eq('status', 'APPROVED')
            .gte('created_at', params.prev_start)
            .lt('created_at', params.prev_end);
          if (data) prevDepositsData.push(...data);
        }
      }

      // 8. Fetch daily logs for contacts
      const { data: logsData } = await supabase
        .from('promoter_daily_logs')
        .select('promoter_id, contact_count, log_date')
        .in('promoter_id', allPromoterIds.length > 0 ? allPromoterIds : ['__none__']);

      // Build referral map: referred_user_id -> promoter_id
      const referralMap: Record<string, string> = {};
      allReferredUsers?.forEach(u => {
        if (u.referred_by_id) referralMap[u.id] = u.referred_by_id;
      });

      // Build point stats
      const ptStats: PointWithStats[] = (allPoints || []).map(pt => {
        const promoterIds = pointPromoterIds[pt.id] || [];
        const sc = staffCounts[pt.id] || 0;

        // Count registrations for this point
        const regs = regsData.filter(r => promoterIds.includes(r.referred_by_id)).length;
        const prevRegs = prevRegsData.filter(r => promoterIds.includes(r.referred_by_id)).length;

        // Count charges for this point
        const pointDeposits = depositsData.filter(d => {
          const promoterId = referralMap[d.user_id];
          return promoterId && promoterIds.includes(promoterId);
        });
        const charges = new Set(pointDeposits.map(d => d.user_id)).size;
        const chargeAmount = pointDeposits.reduce((sum: number, d: any) => sum + (parseFloat(d.amount) || 0), 0);

        const prevPointDeposits = prevDepositsData.filter(d => {
          const promoterId = referralMap[d.user_id];
          return promoterId && promoterIds.includes(promoterId);
        });
        const prevCharges = new Set(prevPointDeposits.map(d => d.user_id)).size;
        const prevChargeAmount = prevPointDeposits.reduce((sum: number, d: any) => sum + (parseFloat(d.amount) || 0), 0);

        // Count contacts
        const contacts = logsData?.filter(l => promoterIds.includes(l.promoter_id))
          .reduce((sum, l) => sum + (l.contact_count || 0), 0) || 0;

        const regPerStaff = sc > 0 ? Math.round(regs / sc * 10) / 10 : 0;
        const chargePerStaff = sc > 0 ? Math.round(charges / sc * 10) / 10 : 0;

        // Determine health
        let health: 'good' | 'fair' | 'poor' | 'inactive' = 'inactive';
        if (pt.point_status === 'active' && sc > 0) {
          if (regPerStaff >= 15) health = 'good';
          else if (regPerStaff >= 8) health = 'fair';
          else health = 'poor';
        }

        return {
          ...pt,
          staff_count: sc,
          registrations: regs,
          charges,
          charge_amount: chargeAmount,
          contacts,
          reg_per_staff: regPerStaff,
          charge_per_staff: chargePerStaff,
          reg_conversion_rate: contacts > 0 ? Math.round(regs / contacts * 1000) / 10 : 0,
          charge_conversion_rate: regs > 0 ? Math.round(charges / regs * 1000) / 10 : 0,
          health,
        };
      });

      setPointsWithStats(ptStats);

      // Calculate totals
      const totals = ptStats.reduce((acc, pt) => ({
        total_registrations: acc.total_registrations + pt.registrations,
        total_charges: acc.total_charges + pt.charges,
        total_charge_amount: acc.total_charge_amount + pt.charge_amount,
        total_staff: acc.total_staff + pt.staff_count,
      }), { total_registrations: 0, total_charges: 0, total_charge_amount: 0, total_staff: 0 });

      const prevTotalRegs = prevRegsData.length;
      const prevTotalCharges = new Set(prevDepositsData.map(d => d.user_id)).size;
      const prevTotalChargeAmount = prevDepositsData.reduce((sum: number, d: any) => sum + (parseFloat(d.amount) || 0), 0);

      setTotalStats({
        total_points: ptStats.length,
        active_points: ptStats.filter(p => p.point_status === 'active').length,
        total_staff: totals.total_staff,
        total_registrations: totals.total_registrations,
        total_charges: totals.total_charges,
        total_charge_amount: totals.total_charge_amount,
        prev_registrations: prevTotalRegs,
        prev_charges: prevTotalCharges,
        prev_charge_amount: prevTotalChargeAmount,
      });
    } catch (err: any) {
      console.error('Manual analytics fetch failed:', err);
      toast.error('加载分析数据失败: ' + err.message);
    }
  };

  // ============================================================
  // Fetch Point Detail (staff members and their stats)
  // ============================================================

  const fetchPointDetail = useCallback(async (point: PointWithStats) => {
    setDetailLoading(true);
    setDetailPoint(point);
    setShowPointDetail(true);
    try {
      const params = getTimeRangeParams(timeRange);

      // 1. Get promoters assigned to this point
      const { data: ppData, error: ppError } = await supabase
        .from('promoter_profiles')
        .select('user_id, promoter_status')
        .eq('point_id', point.id);
      if (ppError) throw ppError;

      if (!ppData || ppData.length === 0) {
        setDetailStaff([]);
        setDetailLoading(false);
        return;
      }

      const userIds = ppData.map(p => p.user_id);

      // 2. Get user info
      const { data: usersData } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone_number, referral_code')
        .in('id', userIds);

      const userMap: Record<string, any> = {};
      usersData?.forEach(u => {
        userMap[u.id] = u;
      });

      // 3. Get registrations per promoter
      const { data: regsData } = await supabase
        .from('users')
        .select('id, referred_by_id')
        .in('referred_by_id', userIds)
        .gte('created_at', params.range_start)
        .lt('created_at', params.range_end);

      const regCounts: Record<string, number> = {};
      const referredIds: string[] = [];
      regsData?.forEach(r => {
        if (r.referred_by_id) {
          regCounts[r.referred_by_id] = (regCounts[r.referred_by_id] || 0) + 1;
          referredIds.push(r.id);
        }
      });

      // 4. Get all referred users for deposit lookup
      const { data: allRefs } = await supabase
        .from('users')
        .select('id, referred_by_id')
        .in('referred_by_id', userIds);

      const refMap: Record<string, string> = {};
      allRefs?.forEach(r => {
        if (r.referred_by_id) refMap[r.id] = r.referred_by_id;
      });

      const allRefIds = allRefs?.map(r => r.id) || [];

      // 5. Get deposits
      let depositsData: any[] = [];
      if (allRefIds.length > 0) {
        for (let i = 0; i < allRefIds.length; i += 100) {
          const chunk = allRefIds.slice(i, i + 100);
          const { data } = await supabase
            .from('deposit_requests')
            .select('id, user_id, amount')
            .in('user_id', chunk)
            .eq('status', 'APPROVED')
            .gte('created_at', params.range_start)
            .lt('created_at', params.range_end);
          if (data) depositsData.push(...data);
        }
      }

      const chargeCounts: Record<string, number> = {};
      const chargeAmounts: Record<string, number> = {};
      depositsData.forEach(d => {
        const promoterId = refMap[d.user_id];
        if (promoterId) {
          chargeCounts[promoterId] = (chargeCounts[promoterId] || 0) + 1;
          chargeAmounts[promoterId] = (chargeAmounts[promoterId] || 0) + (parseFloat(d.amount) || 0);
        }
      });

      // Build staff list
      const staffList: PointStaffMember[] = ppData.map(pp => {
        const user = userMap[pp.user_id];
        const name = user
          ? (user.phone_number || `${user.first_name || ''} ${user.last_name || ''}`.trim() || '暂无')
          : '暂无';

        return {
          user_id: pp.user_id,
          user_name: name,
          phone_number: user?.phone_number || null,
          referral_code: user?.referral_code || null,
          promoter_status: pp.promoter_status,
          registrations: regCounts[pp.user_id] || 0,
          charges: chargeCounts[pp.user_id] || 0,
          charge_amount: chargeAmounts[pp.user_id] || 0,
        };
      }).sort((a, b) => b.registrations - a.registrations);

      setDetailStaff(staffList);
    } catch (err: any) {
      console.error('Failed to fetch point detail:', err);
      toast.error('加载点位详情失败: ' + err.message);
    } finally {
      setDetailLoading(false);
    }
  }, [supabase, timeRange]);

  // ============================================================
  // Effects
  // ============================================================

  useEffect(() => {
    fetchPoints();
  }, [fetchPoints]);

  useEffect(() => {
    if (activeView === 'analytics') {
      fetchAnalytics();
    }
  }, [activeView, fetchAnalytics]);

  // ============================================================
  // CRUD Operations
  // ============================================================

  const handleSavePoint = async () => {
    if (!pointForm.name.trim()) {
      toast.error('请输入点位名称');
      return;
    }
    try {
      const payload = {
        name: pointForm.name,
        address: pointForm.address,
        latitude: pointForm.latitude ? (isNaN(parseFloat(pointForm.latitude)) ? null : parseFloat(pointForm.latitude)) : null,
        longitude: pointForm.longitude ? (isNaN(parseFloat(pointForm.longitude)) ? null : parseFloat(pointForm.longitude)) : null,
        area_size: pointForm.area_size,
        point_status: pointForm.point_status,
      };

      if (editingPoint) {
        const { error } = await supabase
          .from('promotion_points')
          .update(payload)
          .eq('id', editingPoint.id);
        if (error) throw error;
        toast.success('点位更新成功');
      } else {
        const { error } = await supabase
          .from('promotion_points')
          .insert(payload);
        if (error) throw error;
        toast.success('点位创建成功');
      }
      setShowAddPoint(false);
      setEditingPoint(null);
      resetPointForm();
      fetchPoints();
      if (activeView === 'analytics') fetchAnalytics();
    } catch (err: any) {
      toast.error('操作失败: ' + err.message);
    }
  };

  const handleDeletePoint = (point: PromotionPoint) => {
    setDeletePointTarget(point);
  };

  const confirmDeletePoint = async () => {
    const point = deletePointTarget;
    if (!point) return;
    setDeletingPoint(true);
    try {
      // First unlink promoters from this point
      await supabase
        .from('promoter_profiles')
        .update({ point_id: null })
        .eq('point_id', point.id);
      const { error } = await supabase
        .from('promotion_points')
        .delete()
        .eq('id', point.id);
      if (error) throw error;
      toast.success('点位已删除');
      setDeletePointTarget(null);
      fetchPoints();
      if (activeView === 'analytics') fetchAnalytics();
    } catch (err: any) {
      toast.error('删除失败: ' + err.message);
    } finally {
      setDeletingPoint(false);
    }
  };

  const handleToggleStatus = async (point: PromotionPoint) => {
    const newStatus = point.point_status === 'active' ? 'inactive' : 'active';
    try {
      const { error } = await supabase
        .from('promotion_points')
        .update({ point_status: newStatus })
        .eq('id', point.id);

      if (error) throw error;
      toast.success(`点位已${newStatus === 'active' ? '启用' : '停用'}`);
      fetchPoints();
      if (activeView === 'analytics') fetchAnalytics();
    } catch (err: any) {
      toast.error('操作失败: ' + err.message);
    }
  };

  const resetPointForm = () => {
    setPointForm({ name: '', address: '', latitude: '', longitude: '', area_size: 'medium', point_status: 'active' });
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

  const exportAnalytics = () => {
    const headers = ['点位名称', '地址', '面积类型', '状态', '人员数', '注册数', '充值数', '充值金额(TJS)', '人均注册', '人均充值', '注册转化率(%)', '充值转化率(%)', '健康度', '建议'];
    const rows = sortedPoints.map(pt => [
      csvEscape(pt.name),
      csvEscape(pt.address),
      csvEscape(getAreaSizeLabel(pt.area_size)),
      csvEscape(pt.point_status === 'active' ? '启用' : '停用'),
      pt.staff_count,
      pt.registrations,
      pt.charges,
      pt.charge_amount.toFixed(0),
      pt.reg_per_staff.toFixed(1),
      pt.charge_per_staff.toFixed(1),
      pt.reg_conversion_rate.toFixed(1),
      pt.charge_conversion_rate.toFixed(1),
      csvEscape(pt.health === 'good' ? '优秀' : pt.health === 'fair' ? '一般' : pt.health === 'poor' ? '较差' : '无数据'),
      csvEscape(getHealthSuggestion(pt.health)),
    ]);

    const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `点位分析报告_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('报告已导出');
  };

  // ============================================================
  // Filtering & Sorting
  // ============================================================

  const filteredPoints = points.filter(p => {
    const matchSearch = !searchTerm || 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.address || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.point_status === statusFilter;
    return matchSearch && matchStatus;
  });

  const sortedPoints = [...pointsWithStats]
    .filter(p => {
      const matchSearch = !searchTerm ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.address || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'all' || p.point_status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortAsc ? aVal - bVal : bVal - aVal;
      }
      return sortAsc
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '';
    return sortAsc ? ' ↑' : ' ↓';
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-7 h-7" />
            点位管理与分析
          </h1>
          <p className="text-gray-600 mt-1">管理地推点位信息，分析各点位的推广效果和健康度</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => {
              setEditingPoint(null);
              resetPointForm();
              setShowAddPoint(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" /> 添加点位
          </Button>
        </div>
      </div>

      {/* View Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { key: 'management' as ActiveView, label: '点位管理', icon: <MapPin className="w-4 h-4" /> },
            { key: 'analytics' as ActiveView, label: '效果分析', icon: <BarChart3 className="w-4 h-4" /> },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeView === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索点位名称或地址..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">全部状态</option>
          <option value="active">启用中</option>
          <option value="inactive">已停用</option>
        </select>

        {activeView === 'analytics' && (
          <>
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
              onClick={fetchAnalytics}
              disabled={analyticsLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${analyticsLoading ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button
              onClick={exportAnalytics}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm text-gray-700"
            >
              <Download className="w-4 h-4" />
              导出
            </button>
          </>
        )}

        {activeView === 'management' && (
          <button
            onClick={fetchPoints}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        )}
      </div>

      {/* ==================== Management View ==================== */}
      {activeView === 'management' && (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>点位名称</TableHead>
                    <TableHead>地址</TableHead>
                    <TableHead>面积</TableHead>
                    <TableHead>人员数</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>坐标</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPoints.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-gray-500">
                        <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>暂无点位数据</p>
                        <p className="text-sm mt-1">点击"添加点位"创建第一个推广点位</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPoints.map(pt => (
                      <TableRow key={pt.id}>
                        <TableCell className="font-medium">{pt.name}</TableCell>
                        <TableCell className="text-sm text-gray-600 max-w-xs truncate">{pt.address || '--'}</TableCell>
                        <TableCell>{getAreaSizeBadge(pt.area_size)}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-gray-400" />
                            {(pt as any).staff_count || 0}
                          </span>
                        </TableCell>
                        <TableCell>{getPointStatusBadge(pt.point_status)}</TableCell>
                        <TableCell className="text-xs text-gray-500">
                          {pt.latitude && pt.longitude
                            ? `${pt.latitude.toFixed(4)}, ${pt.longitude.toFixed(4)}`
                            : '--'}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {new Date(pt.created_at).toLocaleDateString('zh-CN')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingPoint(pt);
                                setPointForm({
                                  name: pt.name,
                                  address: pt.address || '',
                                  latitude: pt.latitude?.toString() || '',
                                  longitude: pt.longitude?.toString() || '',
                                  area_size: pt.area_size,
                                  point_status: pt.point_status,
                                });
                                setShowAddPoint(true);
                              }}
                              className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                              title="编辑"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleToggleStatus(pt)}
                              className="p-1.5 text-gray-400 hover:text-yellow-600 rounded"
                              title={pt.point_status === 'active' ? '停用' : '启用'}
                            >
                              {pt.point_status === 'active' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => handleDeletePoint(pt)}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ==================== Analytics View ==================== */}
      {activeView === 'analytics' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-5 text-white shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <MapPin className="w-7 h-7 opacity-80" />
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                  {totalStats.active_points}/{totalStats.total_points} 启用
                </span>
              </div>
              <h3 className="text-sm font-medium opacity-90">总点位数</h3>
              <p className="text-3xl font-bold mt-1">{totalStats.total_points}</p>
              <p className="text-xs mt-2 opacity-80">在岗人员: {totalStats.total_staff} 人</p>
            </div>

            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-5 text-white shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <UserPlus className="w-7 h-7 opacity-80" />
                <TrendIndicator current={totalStats.total_registrations} previous={totalStats.prev_registrations} />
              </div>
              <h3 className="text-sm font-medium opacity-90">总注册数</h3>
              <p className="text-3xl font-bold mt-1">{totalStats.total_registrations.toLocaleString()}</p>
              <p className="text-xs mt-2 opacity-80">
                {totalStats.prev_registrations > 0 ? `上期: ${totalStats.prev_registrations.toLocaleString()}` : '暂无对比数据'}
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-5 text-white shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <DollarSign className="w-7 h-7 opacity-80" />
                <TrendIndicator current={totalStats.total_charges} previous={totalStats.prev_charges} />
              </div>
              <h3 className="text-sm font-medium opacity-90">总充值用户</h3>
              <p className="text-3xl font-bold mt-1">{totalStats.total_charges.toLocaleString()}</p>
              <p className="text-xs mt-2 opacity-80">
                {totalStats.prev_charges > 0 ? `上期: ${totalStats.prev_charges.toLocaleString()}` : '暂无对比数据'}
              </p>
            </div>

            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-5 text-white shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <TrendingUp className="w-7 h-7 opacity-80" />
                <TrendIndicator current={totalStats.total_charge_amount} previous={totalStats.prev_charge_amount} />
              </div>
              <h3 className="text-sm font-medium opacity-90">总充值金额</h3>
              <p className="text-3xl font-bold mt-1">TJS {totalStats.total_charge_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className="text-xs mt-2 opacity-80">
                {totalStats.prev_charge_amount > 0 ? `上期: TJS ${totalStats.prev_charge_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '暂无对比数据'}
              </p>
            </div>
          </div>

          {/* Health Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { health: 'good', label: '优秀', color: 'bg-green-50 border-green-200', textColor: 'text-green-700', count: pointsWithStats.filter(p => p.health === 'good').length },
              { health: 'fair', label: '一般', color: 'bg-yellow-50 border-yellow-200', textColor: 'text-yellow-700', count: pointsWithStats.filter(p => p.health === 'fair').length },
              { health: 'poor', label: '较差', color: 'bg-red-50 border-red-200', textColor: 'text-red-700', count: pointsWithStats.filter(p => p.health === 'poor').length },
              { health: 'inactive', label: '无数据', color: 'bg-gray-50 border-gray-200', textColor: 'text-gray-700', count: pointsWithStats.filter(p => p.health === 'inactive').length },
            ].map(item => (
              <div key={item.health} className={`${item.color} border rounded-lg p-4 flex items-center justify-between`}>
                <div>
                  <p className={`text-sm font-medium ${item.textColor}`}>{item.label}点位</p>
                  <p className={`text-2xl font-bold ${item.textColor}`}>{item.count}</p>
                </div>
                <Activity className={`w-8 h-8 ${item.textColor} opacity-50`} />
              </div>
            ))}
          </div>

          {/* Analytics Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                点位效果分析
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {analyticsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : sortedPoints.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>暂无分析数据</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="px-4 py-3 text-left font-medium text-gray-500">
                          <button onClick={() => handleSort('name')} className="hover:text-gray-900">
                            点位{getSortIcon('name')}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-center font-medium text-gray-500">面积</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">
                          <button onClick={() => handleSort('staff_count')} className="hover:text-gray-900">
                            人数{getSortIcon('staff_count')}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">
                          <button onClick={() => handleSort('registrations')} className="hover:text-gray-900">
                            注册{getSortIcon('registrations')}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">
                          <button onClick={() => handleSort('charges')} className="hover:text-gray-900">
                            充值{getSortIcon('charges')}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">
                          <button onClick={() => handleSort('charge_amount')} className="hover:text-gray-900">
                            金额(TJS){getSortIcon('charge_amount')}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">
                          <button onClick={() => handleSort('reg_per_staff')} className="hover:text-gray-900">
                            人均注册{getSortIcon('reg_per_staff')}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">充值转化率</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-500">
                          <button onClick={() => handleSort('health')} className="hover:text-gray-900">
                            健康度{getSortIcon('health')}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-gray-500">建议</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-500">详情</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPoints.map((pt) => (
                        <tr key={pt.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{pt.name}</td>
                          <td className="px-4 py-3 text-center">{getAreaSizeBadge(pt.area_size)}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{pt.staff_count}</td>
                          <td className="px-4 py-3 text-right font-medium text-blue-600">{pt.registrations}</td>
                          <td className="px-4 py-3 text-right font-medium text-green-600">{pt.charges}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{pt.charge_amount.toFixed(0)}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{pt.reg_per_staff.toFixed(1)}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{pt.charge_conversion_rate.toFixed(1)}%</td>
                          <td className="px-4 py-3 text-center">{getHealthBadge(pt.health)}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{getHealthSuggestion(pt.health)}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => fetchPointDetail(pt)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                              title="查看详情"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ==================== Add/Edit Point Dialog ==================== */}
      <Dialog open={showAddPoint} onOpenChange={(open) => { if (!open) { setShowAddPoint(false); setEditingPoint(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPoint ? '编辑点位' : '添加点位'}</DialogTitle>
            <DialogDescription>
              {editingPoint ? '修改点位基本信息' : '创建一个新的地推推广点位'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">点位名称 *</label>
              <input
                type="text"
                value={pointForm.name}
                onChange={(e) => setPointForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如: Dousti广场-入口处"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
              <input
                type="text"
                value={pointForm.address}
                onChange={(e) => setPointForm(prev => ({ ...prev, address: e.target.value }))}
                placeholder="详细地址"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">纬度</label>
                <input
                  type="text"
                  value={pointForm.latitude}
                  onChange={(e) => setPointForm(prev => ({ ...prev, latitude: e.target.value }))}
                  placeholder="38.5598"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">经度</label>
                <input
                  type="text"
                  value={pointForm.longitude}
                  onChange={(e) => setPointForm(prev => ({ ...prev, longitude: e.target.value }))}
                  placeholder="68.7738"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">面积类型</label>
                <select
                  value={pointForm.area_size}
                  onChange={(e) => setPointForm(prev => ({ ...prev, area_size: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="large">大型</option>
                  <option value="medium">中型</option>
                  <option value="small">小型</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                <select
                  value={pointForm.point_status}
                  onChange={(e) => setPointForm(prev => ({ ...prev, point_status: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">启用</option>
                  <option value="inactive">停用</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowAddPoint(false); setEditingPoint(null); }}>取消</Button>
              <Button onClick={handleSavePoint}>{editingPoint ? '保存' : '创建'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== Point Detail Dialog ==================== */}
      <Dialog open={showPointDetail} onOpenChange={(open) => { if (!open) setShowPointDetail(false); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              {detailPoint?.name} - 点位详情
            </DialogTitle>
            <DialogDescription>
              查看该点位的人员配置和各人员推广效果
            </DialogDescription>
          </DialogHeader>

          {detailPoint && (
            <div className="space-y-4">
              {/* Point Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-blue-600 font-medium">人员数</p>
                  <p className="text-xl font-bold text-blue-700">{detailPoint.staff_count}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-green-600 font-medium">注册数</p>
                  <p className="text-xl font-bold text-green-700">{detailPoint.registrations}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-purple-600 font-medium">充值数</p>
                  <p className="text-xl font-bold text-purple-700">{detailPoint.charges}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-orange-600 font-medium">充值金额</p>
                  <p className="text-xl font-bold text-orange-700">TJS {detailPoint.charge_amount.toFixed(0)}</p>
                </div>
              </div>

              {/* Point Info */}
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>面积: {getAreaSizeBadge(detailPoint.area_size)}</span>
                <span>健康度: {getHealthBadge(detailPoint.health)}</span>
                <span>人均注册: <strong>{(detailPoint.reg_per_staff || 0).toFixed(1)}</strong></span>
                <span>充值转化率: <strong>{(detailPoint.charge_conversion_rate || 0).toFixed(1)}%</strong></span>
              </div>

              {/* Staff Table */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">人员明细</h3>
                {detailLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                  </div>
                ) : detailStaff.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    该点位暂无分配人员
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>排名</TableHead>
                        <TableHead>姓名</TableHead>
                        <TableHead>邀请码</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-right">注册数</TableHead>
                        <TableHead className="text-right">充值数</TableHead>
                        <TableHead className="text-right">充值金额(TJS)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailStaff.map((staff, idx) => (
                        <TableRow key={staff.user_id}>
                          <TableCell>
                            {idx === 0 ? <span className="text-lg">🥇</span> :
                             idx === 1 ? <span className="text-lg">🥈</span> :
                             idx === 2 ? <span className="text-lg">🥉</span> :
                             <span className="text-sm text-gray-500 font-medium">{idx + 1}</span>}
                          </TableCell>
                          <TableCell className="font-medium">
                            {staff.user_name}
                            {staff.phone_number && (
                              <div className="text-xs text-gray-500">{staff.first_name || staff.phone_number || '暂无'}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{staff.referral_code || '--'}</TableCell>
                          <TableCell>
                            {staff.promoter_status === 'active'
                              ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">在岗</span>
                              : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">{staff.promoter_status}</span>
                            }
                          </TableCell>
                          <TableCell className="text-right font-medium text-blue-600">{staff.registrations}</TableCell>
                          <TableCell className="text-right font-medium text-green-600">{staff.charges}</TableCell>
                          <TableCell className="text-right text-gray-900">{staff.charge_amount.toFixed(0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除点位确认弹窗 */}
      <Dialog open={!!deletePointTarget} onOpenChange={(open) => { if (!open) setDeletePointTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除点位</DialogTitle>
            <DialogDescription>
              确定要删除点位 <strong>{deletePointTarget?.name}</strong> 吗？
              该操作将解除所有关联的地推人员绑定，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeletePointTarget(null)}>取消</Button>
            <Button
              variant="destructive"
              onClick={confirmDeletePoint}
              disabled={deletingPoint}
            >
              {deletingPoint ? '删除中...' : '确认删除'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
