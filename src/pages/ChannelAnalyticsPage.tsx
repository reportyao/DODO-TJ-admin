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
  BarChart3,
  RefreshCw,
  Download,
  Settings,
  TrendingUp,
  Users,
  DollarSign,
  UserPlus,
  ArrowUp,
  ArrowDown,
  Minus,
  AlertCircle,
  Plus,
  Trash2,
  Save,
  Lightbulb,
  Target,
  Zap,
  Hash,
  Eye,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface ChannelStat {
  channel: string;
  staff_count: number;
  registrations: number;
  charges: number;
  charge_amount: number;
  conversion_rate: number;
  prev_registrations: number;
  prev_charges: number;
  prev_charge_amount: number;
}

interface ChannelWithCost extends ChannelStat {
  cost: number;
  cost_per_registration: number;
  cost_per_charge: number;
  roi: number;
}

interface ChannelCostConfig {
  [channel: string]: {
    monthly_cost: number;
    description: string;
  };
}

interface InviteCodeRecord {
  id: string;
  code: string;
  promoter_id: string;
  channel: string;
  point_id: string | null;
  is_active: boolean;
  notes: string;
  created_at: string;
  promoter_name?: string;
  point_name?: string;
}

type TimeRange = 'today' | 'week' | 'month';
type ActiveTab = 'analytics' | 'codes' | 'cost_config';
type SortField = 'channel' | 'registrations' | 'charges' | 'charge_amount' | 'conversion_rate' | 'cost_per_charge' | 'roi';

// ============================================================
// Constants
// ============================================================

const CHANNEL_OPTIONS = [
  { value: 'offline_street', label: '线下-街头地推' },
  { value: 'offline_university', label: '线下-大学校园' },
  { value: 'offline_market', label: '线下-市场商圈' },
  { value: 'offline_mall', label: '线下-商场' },
  { value: 'online_instagram', label: '线上-Instagram' },
  { value: 'online_telegram', label: '线上-Telegram广告(历史)' },
  { value: 'online_whatsapp', label: '线上-WhatsApp推广' },
  { value: 'online_facebook', label: '线上-Facebook' },
  { value: 'partner_taxi', label: '合作-出租车司机' },
  { value: 'partner_barber', label: '合作-理发店' },
  { value: 'partner_shop', label: '合作-商铺' },
  { value: 'referral_organic', label: '自然裂变' },
  { value: 'other', label: '其他' },
];

function getChannelLabel(channel: string): string {
  const found = CHANNEL_OPTIONS.find(c => c.value === channel);
  return found ? found.label : channel;
}

function getChannelColor(channel: string): string {
  if (channel.startsWith('offline_')) return 'bg-blue-100 text-blue-800';
  if (channel.startsWith('online_')) return 'bg-purple-100 text-purple-800';
  if (channel.startsWith('partner_')) return 'bg-orange-100 text-orange-800';
  if (channel === 'referral_organic') return 'bg-green-100 text-green-800';
  return 'bg-gray-100 text-gray-800';
}

function getChannelIcon(channel: string): string {
  if (channel.startsWith('offline_')) return '🏪';
  if (channel.startsWith('online_')) return '📱';
  if (channel.startsWith('partner_')) return '🤝';
  if (channel === 'referral_organic') return '🔗';
  return '📊';
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

export default function ChannelAnalyticsPage() {
  const { supabase } = useSupabase();

  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('analytics');
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('month');

  // Analytics data
  const [channelStats, setChannelStats] = useState<ChannelWithCost[]>([]);
  const [summary, setSummary] = useState({
    total_registrations: 0,
    total_charges: 0,
    total_charge_amount: 0,
    total_cost: 0,
    overall_roi: 0,
    prev_total_registrations: 0,
    prev_total_charges: 0,
    prev_total_charge_amount: 0,
    total_channels: 0,
    total_staff: 0,
  });

  // Cost config
  const [costConfig, setCostConfig] = useState<ChannelCostConfig>({});
  const [costConfigLoading, setCostConfigLoading] = useState(false);
  const [showCostConfig, setShowCostConfig] = useState(false);
  const [editingCosts, setEditingCosts] = useState<{ channel: string; monthly_cost: string; description: string }[]>([]);

  // Invite codes management
  const [inviteCodes, setInviteCodes] = useState<InviteCodeRecord[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [showAddCode, setShowAddCode] = useState(false);
  const [codeForm, setCodeForm] = useState({
    code: '',
    promoter_search: '',
    promoter_id: '',
    promoter_name: '',
    channel: 'offline_street',
    point_id: '',
    notes: '',
  });
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const [searchingUser, setSearchingUser] = useState(false);
  const [points, setPoints] = useState<{ id: string; name: string }[]>([]);

  // Sort state
  const [sortField, setSortField] = useState<SortField>('registrations');
  const [sortAsc, setSortAsc] = useState(false);

  // Delete code confirmation
  const [deleteCodeTarget, setDeleteCodeTarget] = useState<InviteCodeRecord | null>(null);
  const [deletingCode, setDeletingCode] = useState(false);

  // ============================================================
  // Data Fetching - Cost Config
  // ============================================================

  const fetchCostConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'channel_cost_config')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Failed to fetch cost config:', error);
      }

      if (data?.value) {
        setCostConfig(data.value as ChannelCostConfig);
      }
    } catch (err: any) {
      console.error('Failed to fetch cost config:', err);
    }
  }, [supabase]);

  // ============================================================
  // Data Fetching - Analytics
  // ============================================================

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const params = getTimeRangeParams(timeRange);

      // Try RPC function first
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_channel_stats', {
        p_range_start: params.range_start,
        p_range_end: params.range_end,
        p_prev_start: params.prev_start,
        p_prev_end: params.prev_end,
      });

      if (rpcError) {
        console.warn('RPC get_channel_stats failed, falling back to manual query:', rpcError);
        await fetchAnalyticsManual(params);
        return;
      }

      if (rpcData) {
        processRpcData(rpcData);
      }
    } catch (err: any) {
      console.error('Failed to fetch analytics:', err);
      toast.error('加载渠道分析数据失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, timeRange, costConfig]);

  const processRpcData = (rpcData: any) => {
    const channels: ChannelStat[] = rpcData.channels || [];
    const rpcSummary = rpcData.summary || {};

    // Merge with cost config
    const channelsWithCost: ChannelWithCost[] = channels.map(ch => {
      const channelCost = costConfig[ch.channel];
      const cost = channelCost ? channelCost.monthly_cost : 0;
      // For non-monthly ranges, prorate the cost
      let adjustedCost = cost;
      if (timeRange === 'today') adjustedCost = cost / 30;
      else if (timeRange === 'week') adjustedCost = cost / 4;

      return {
        ...ch,
        cost: Math.round(adjustedCost),
        cost_per_registration: ch.registrations > 0 ? Math.round(adjustedCost / ch.registrations * 10) / 10 : 0,
        cost_per_charge: ch.charges > 0 ? Math.round(adjustedCost / ch.charges * 10) / 10 : 0,
        roi: adjustedCost > 0 ? Math.round(ch.charge_amount / adjustedCost * 10) / 10 : 0,
      };
    });

    setChannelStats(channelsWithCost);

    const totalCost = channelsWithCost.reduce((sum, ch) => sum + ch.cost, 0);
    const totalChargeAmount = parseFloat(rpcSummary.total_charge_amount) || 0;

    setSummary({
      total_registrations: rpcSummary.total_registrations || 0,
      total_charges: rpcSummary.total_charges || 0,
      total_charge_amount: totalChargeAmount,
      total_cost: totalCost,
      overall_roi: totalCost > 0 ? Math.round(totalChargeAmount / totalCost * 10) / 10 : 0,
      prev_total_registrations: rpcSummary.prev_total_registrations || 0,
      prev_total_charges: rpcSummary.prev_total_charges || 0,
      prev_total_charge_amount: parseFloat(rpcSummary.prev_total_charge_amount) || 0,
      total_channels: rpcSummary.total_channels || 0,
      total_staff: rpcSummary.total_staff || 0,
    });
  };

  // Fallback manual query
  const fetchAnalyticsManual = async (params: ReturnType<typeof getTimeRangeParams>) => {
    try {
      // 1. Fetch managed invite codes with channel info
      const { data: codesData, error: codesError } = await supabase
        .from('managed_invite_codes')
        .select('promoter_id, channel')
        .eq('is_active', true);

      if (codesError) throw codesError;

      if (!codesData || codesData.length === 0) {
        setChannelStats([]);
        setSummary({
          total_registrations: 0, total_charges: 0, total_charge_amount: 0,
          total_cost: 0, overall_roi: 0, prev_total_registrations: 0,
          prev_total_charges: 0, prev_total_charge_amount: 0,
          total_channels: 0, total_staff: 0,
        });
        setLoading(false);
        return;
      }

      // Build channel -> promoter_ids mapping
      const channelPromoters: Record<string, string[]> = {};
      codesData.forEach(c => {
        if (c.channel) {
          if (!channelPromoters[c.channel]) channelPromoters[c.channel] = [];
          if (!channelPromoters[c.channel].includes(c.promoter_id)) {
            channelPromoters[c.channel].push(c.promoter_id);
          }
        }
      });

      const allPromoterIds = [...new Set(codesData.map(c => c.promoter_id))];

      // 2. Fetch registrations in current range
      let regsData: any[] = [];
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

      // 3. Fetch registrations in previous range
      let prevRegsData: any[] = [];
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

      // 4. Fetch all referred users for deposit lookup
      const { data: allRefs } = await supabase
        .from('users')
        .select('id, referred_by_id')
        .in('referred_by_id', allPromoterIds);

      const refMap: Record<string, string> = {};
      allRefs?.forEach(r => {
        if (r.referred_by_id) refMap[r.id] = r.referred_by_id;
      });
      const allRefIds = allRefs?.map(r => r.id) || [];

      // 5. Fetch deposits in current range
      let depositsData: any[] = [];
      for (let i = 0; i < allRefIds.length; i += 100) {
        const chunk = allRefIds.slice(i, i + 100);
        const { data } = await supabase
          .from('deposit_requests')
          .select('id, user_id, amount, created_at')
          .in('user_id', chunk)
          .eq('status', 'APPROVED')
          .gte('created_at', params.range_start)
          .lt('created_at', params.range_end);
        if (data) depositsData.push(...data);
      }

      // 6. Fetch deposits in previous range
      let prevDepositsData: any[] = [];
      for (let i = 0; i < allRefIds.length; i += 100) {
        const chunk = allRefIds.slice(i, i + 100);
        const { data } = await supabase
          .from('deposit_requests')
          .select('id, user_id, amount, created_at')
          .in('user_id', chunk)
          .eq('status', 'APPROVED')
          .gte('created_at', params.prev_start)
          .lt('created_at', params.prev_end);
        if (data) prevDepositsData.push(...data);
      }

      // Build channel stats
      const channelStatsMap: Record<string, ChannelStat> = {};

      Object.entries(channelPromoters).forEach(([channel, promoterIds]) => {
        const regs = regsData.filter(r => promoterIds.includes(r.referred_by_id)).length;
        const prevRegs = prevRegsData.filter(r => promoterIds.includes(r.referred_by_id)).length;

        const channelDeposits = depositsData.filter(d => {
          const promoterId = refMap[d.user_id];
          return promoterId && promoterIds.includes(promoterId);
        });
        const charges = new Set(channelDeposits.map(d => d.user_id)).size;
        const chargeAmount = channelDeposits.reduce((sum: number, d: any) => sum + parseFloat(d.amount || 0), 0);

        const prevChannelDeposits = prevDepositsData.filter(d => {
          const promoterId = refMap[d.user_id];
          return promoterId && promoterIds.includes(promoterId);
        });
        const prevCharges = new Set(prevChannelDeposits.map(d => d.user_id)).size;
        const prevChargeAmount = prevChannelDeposits.reduce((sum: number, d: any) => sum + parseFloat(d.amount || 0), 0);

        channelStatsMap[channel] = {
          channel,
          staff_count: promoterIds.length,
          registrations: regs,
          charges,
          charge_amount: chargeAmount,
          conversion_rate: regs > 0 ? Math.round(charges / regs * 1000) / 10 : 0,
          prev_registrations: prevRegs,
          prev_charges: prevCharges,
          prev_charge_amount: prevChargeAmount,
        };
      });

      // Merge with cost config
      const channelsWithCost: ChannelWithCost[] = Object.values(channelStatsMap).map(ch => {
        const channelCost = costConfig[ch.channel];
        const cost = channelCost ? channelCost.monthly_cost : 0;
        let adjustedCost = cost;
        if (timeRange === 'today') adjustedCost = cost / 30;
        else if (timeRange === 'week') adjustedCost = cost / 4;

        return {
          ...ch,
          cost: Math.round(adjustedCost),
          cost_per_registration: ch.registrations > 0 ? Math.round(adjustedCost / ch.registrations * 10) / 10 : 0,
          cost_per_charge: ch.charges > 0 ? Math.round(adjustedCost / ch.charges * 10) / 10 : 0,
          roi: adjustedCost > 0 ? Math.round(ch.charge_amount / adjustedCost * 10) / 10 : 0,
        };
      });

      setChannelStats(channelsWithCost);

      const totalCost = channelsWithCost.reduce((sum, ch) => sum + ch.cost, 0);
      const totalChargeAmount = channelsWithCost.reduce((sum, ch) => sum + ch.charge_amount, 0);

      setSummary({
        total_registrations: channelsWithCost.reduce((sum, ch) => sum + ch.registrations, 0),
        total_charges: channelsWithCost.reduce((sum, ch) => sum + ch.charges, 0),
        total_charge_amount: totalChargeAmount,
        total_cost: totalCost,
        overall_roi: totalCost > 0 ? Math.round(totalChargeAmount / totalCost * 10) / 10 : 0,
        prev_total_registrations: channelsWithCost.reduce((sum, ch) => sum + ch.prev_registrations, 0),
        prev_total_charges: channelsWithCost.reduce((sum, ch) => sum + ch.prev_charges, 0),
        prev_total_charge_amount: channelsWithCost.reduce((sum, ch) => sum + ch.prev_charge_amount, 0),
        total_channels: channelsWithCost.length,
        total_staff: channelsWithCost.reduce((sum, ch) => sum + ch.staff_count, 0),
      });
    } catch (err: any) {
      console.error('Manual analytics fetch failed:', err);
      toast.error('加载渠道分析数据失败: ' + err.message);
    }
  };

  // ============================================================
  // Data Fetching - Invite Codes
  // ============================================================

  const fetchInviteCodes = useCallback(async () => {
    setCodesLoading(true);
    try {
      const { data, error } = await supabase
        .from('managed_invite_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        setInviteCodes([]);
        setCodesLoading(false);
        return;
      }

      // Enrich with promoter names and point names
      const promoterIds = [...new Set(data.map(c => c.promoter_id))];
      const pointIds = [...new Set(data.map(c => c.point_id).filter(Boolean))];

      const { data: usersData } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone_number')
        .in('id', promoterIds);

      const userMap: Record<string, string> = {};
      usersData?.forEach(u => {
        userMap[u.id] = u.phone_number || `${u.first_name || ''} ${u.last_name || ''}`.trim() || '668265e0';
      });

      let pointMap: Record<string, string> = {};
      if (pointIds.length > 0) {
        const { data: ptData } = await supabase
          .from('promotion_points')
          .select('id, name')
          .in('id', pointIds as string[]);
        if (ptData) pointMap = Object.fromEntries(ptData.map(p => [p.id, p.name]));
      }

      const enriched: InviteCodeRecord[] = data.map(c => ({
        ...c,
        promoter_name: userMap[c.promoter_id] || '668265e0',
        point_name: c.point_id ? (pointMap[c.point_id] || '--') : '--',
      }));

      setInviteCodes(enriched);
    } catch (err: any) {
      console.error('Failed to fetch invite codes:', err);
      toast.error('加载邀请码数据失败: ' + err.message);
    } finally {
      setCodesLoading(false);
    }
  }, [supabase]);

  // ============================================================
  // Fetch Points (for dropdown)
  // ============================================================

  const fetchPoints = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('promotion_points')
        .select('id, name')
        .eq('point_status', 'active')
        .order('name');
      if (data) setPoints(data);
    } catch (err) {
      console.error('Failed to fetch points:', err);
    }
  }, [supabase]);

  // ============================================================
  // Effects
  // ============================================================

  useEffect(() => {
    fetchCostConfig();
    fetchPoints();
  }, [fetchCostConfig, fetchPoints]);

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchAnalytics();
    } else if (activeTab === 'codes') {
      fetchInviteCodes();
    }
  }, [activeTab, fetchAnalytics, fetchInviteCodes]);

  // ============================================================
  // Cost Config Operations
  // ============================================================

  const openCostConfig = () => {
    // Initialize editing state from current config
    const entries = Object.entries(costConfig).map(([channel, config]) => ({
      channel,
      monthly_cost: config.monthly_cost.toString(),
      description: config.description,
    }));
    // Add empty row if no entries
    if (entries.length === 0) {
      entries.push({ channel: 'offline_street', monthly_cost: '0', description: '' });
    }
    setEditingCosts(entries);
    setShowCostConfig(true);
  };

  const addCostRow = () => {
    setEditingCosts(prev => [...prev, { channel: 'other', monthly_cost: '0', description: '' }]);
  };

  const removeCostRow = (index: number) => {
    setEditingCosts(prev => prev.filter((_, i) => i !== index));
  };

  const saveCostConfig = async () => {
    setCostConfigLoading(true);
    try {
      const newConfig: ChannelCostConfig = {};
      editingCosts.forEach(entry => {
        if (entry.channel) {
          newConfig[entry.channel] = {
            monthly_cost: parseFloat(entry.monthly_cost) || 0,
            description: entry.description,
          };
        }
      });

      const { error } = await supabase
        .from('system_config')
        .upsert({
          key: 'channel_cost_config',
          value: newConfig,
          description: '渠道成本配置：各推广渠道的月度投入成本，用于计算获客成本和ROI',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'key'
        });

      if (error) throw error;

      setCostConfig(newConfig);
      setShowCostConfig(false);
      toast.success('渠道成本配置已保存');

      // Refresh analytics with new cost data
      if (activeTab === 'analytics') {
        fetchAnalytics();
      }
    } catch (err: any) {
      toast.error('保存失败: ' + err.message);
    } finally {
      setCostConfigLoading(false);
    }
  };

  // ============================================================
  // Invite Code Operations
  // ============================================================

  const searchUsers = async () => {
    if (!codeForm.promoter_search.trim()) return;
    setSearchingUser(true);
    try {
      const term = codeForm.promoter_search.trim();
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone_number, referral_code')
        .or(`phone_number.eq.${term},phone_number.ilike.%${term}%,referral_code.ilike.%${term}%`)
        .limit(10);

      if (error) throw error;
      setSearchedUsers(data || []);
    } catch (err: any) {
      toast.error('搜索失败: ' + err.message);
    } finally {
      setSearchingUser(false);
    }
  };

  const handleAddCode = async () => {
    if (!codeForm.code.trim()) {
      toast.error('请输入邀请码');
      return;
    }
    if (!codeForm.promoter_id) {
      toast.error('请选择地推人员');
      return;
    }
    try {
      const { error } = await supabase
        .from('managed_invite_codes')
        .insert({
          code: codeForm.code.trim(),
          promoter_id: codeForm.promoter_id,
          channel: codeForm.channel,
          point_id: codeForm.point_id || null,
          notes: codeForm.notes,
        });

      if (error) throw error;

      toast.success('邀请码已添加');
      setShowAddCode(false);
      resetCodeForm();
      fetchInviteCodes();
    } catch (err: any) {
      toast.error('添加失败: ' + err.message);
    }
  };

  const handleToggleCode = async (code: InviteCodeRecord) => {
    try {
      const { error } = await supabase
        .from('managed_invite_codes')
        .update({ is_active: !code.is_active })
        .eq('id', code.id);

      if (error) throw error;
      toast.success(`邀请码已${code.is_active ? '停用' : '启用'}`);
      fetchInviteCodes();
    } catch (err: any) {
      toast.error('操作失败: ' + err.message);
    }
  };

  const handleDeleteCode = (code: InviteCodeRecord) => {
    setDeleteCodeTarget(code);
  };

  const confirmDeleteCode = async () => {
    if (!deleteCodeTarget) return;
    setDeletingCode(true);
    try {
      const { error } = await supabase
        .from('managed_invite_codes')
        .delete()
        .eq('id', deleteCodeTarget.id);

      if (error) throw error;
      toast.success('邀请码已删除');
      setDeleteCodeTarget(null);
      fetchInviteCodes();
    } catch (err: any) {
      toast.error('删除失败: ' + err.message);
    } finally {
      setDeletingCode(false);
    }
  };

  const resetCodeForm = () => {
    setCodeForm({
      code: '', promoter_search: '', promoter_id: '', promoter_name: '',
      channel: 'offline_street', point_id: '', notes: '',
    });
    setSearchedUsers([]);
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
    const headers = ['渠道', '人员数', '注册数', '充值数', '充值金额(TJS)', '转化率(%)', '投入成本(TJS)', '获客成本(TJS)', '充值获客成本(TJS)', 'ROI'];
    const rows = sortedChannels.map(ch => [
      csvEscape(getChannelLabel(ch.channel)),
      ch.staff_count,
      ch.registrations,
      ch.charges,
      ch.charge_amount.toFixed(0),
      ch.conversion_rate.toFixed(1),
      ch.cost,
      ch.cost_per_registration.toFixed(1),
      ch.cost_per_charge.toFixed(1),
      ch.roi > 0 ? `${ch.roi.toFixed(1)}x` : '--',
    ]);

    const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `渠道效果分析_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('报告已导出');
  };

  // ============================================================
  // Sorting
  // ============================================================

  const sortedChannels = [...channelStats].sort((a, b) => {
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

  // Generate insights
  const getInsights = (): { type: 'success' | 'warning' | 'info'; message: string }[] => {
    const insights: { type: 'success' | 'warning' | 'info'; message: string }[] = [];
    if (channelStats.length === 0) return insights;

    // Best ROI channel
    const bestRoi = [...channelStats].filter(c => c.roi > 0).sort((a, b) => b.roi - a.roi)[0];
    if (bestRoi) {
      insights.push({
        type: 'success',
        message: `${getChannelLabel(bestRoi.channel)} ROI最高 (${bestRoi.roi.toFixed(1)}x)，建议增加投放预算`,
      });
    }

    // Lowest conversion channel
    const lowConversion = [...channelStats].filter(c => c.registrations > 10).sort((a, b) => a.conversion_rate - b.conversion_rate)[0];
    if (lowConversion && lowConversion.conversion_rate < 20) {
      insights.push({
        type: 'warning',
        message: `${getChannelLabel(lowConversion.channel)} 转化率偏低 (${lowConversion.conversion_rate.toFixed(1)}%)，建议优化话术或调整策略`,
      });
    }

    // Highest cost per charge
    const highCost = [...channelStats].filter(c => c.cost_per_charge > 0).sort((a, b) => b.cost_per_charge - a.cost_per_charge)[0];
    if (highCost && highCost.cost_per_charge > 100) {
      insights.push({
        type: 'warning',
        message: `${getChannelLabel(highCost.channel)} 付费获客成本较高 (TJS ${highCost.cost_per_charge.toFixed(0)}/人)，需评估投入产出`,
      });
    }

    // Best conversion channel
    const bestConversion = [...channelStats].filter(c => c.registrations > 5).sort((a, b) => b.conversion_rate - a.conversion_rate)[0];
    if (bestConversion && bestConversion.conversion_rate > 25) {
      insights.push({
        type: 'info',
        message: `${getChannelLabel(bestConversion.channel)} 转化率最高 (${bestConversion.conversion_rate.toFixed(1)}%)，用户质量优秀`,
      });
    }

    return insights;
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
            <BarChart3 className="w-7 h-7" />
            渠道效果分析
          </h1>
          <p className="text-gray-600 mt-1">追踪和对比不同推广渠道的效果与投资回报率</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={openCostConfig}>
            <Settings className="w-4 h-4 mr-1" /> 成本配置
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { key: 'analytics' as ActiveTab, label: 'ROI分析', icon: <TrendingUp className="w-4 h-4" /> },
            { key: 'codes' as ActiveTab, label: '邀请码管理', icon: <Hash className="w-4 h-4" />, count: inviteCodes.length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ==================== Analytics Tab ==================== */}
      {activeTab === 'analytics' && (
        <>
          {/* Time Range & Actions */}
          <div className="flex items-center justify-between">
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
            <div className="flex items-center gap-2">
              <button
                onClick={fetchAnalytics}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </button>
              <button
                onClick={exportAnalytics}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm text-gray-700"
              >
                <Download className="w-4 h-4" />
                导出
              </button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-5 text-white shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <Target className="w-7 h-7 opacity-80" />
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                  {summary.total_channels} 个渠道
                </span>
              </div>
              <h3 className="text-sm font-medium opacity-90">总注册</h3>
              <p className="text-3xl font-bold mt-1">{summary.total_registrations.toLocaleString()}</p>
              <div className="mt-2">
                <TrendIndicator current={summary.total_registrations} previous={summary.prev_total_registrations} />
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-5 text-white shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <DollarSign className="w-7 h-7 opacity-80" />
                <TrendIndicator current={summary.total_charges} previous={summary.prev_total_charges} />
              </div>
              <h3 className="text-sm font-medium opacity-90">总充值用户</h3>
              <p className="text-3xl font-bold mt-1">{summary.total_charges.toLocaleString()}</p>
              <p className="text-xs mt-2 opacity-80">人员: {summary.total_staff} 人</p>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-5 text-white shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <TrendingUp className="w-7 h-7 opacity-80" />
                <TrendIndicator current={summary.total_charge_amount} previous={summary.prev_total_charge_amount} />
              </div>
              <h3 className="text-sm font-medium opacity-90">总充值金额</h3>
              <p className="text-3xl font-bold mt-1">TJS {summary.total_charge_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>

            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-5 text-white shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <DollarSign className="w-7 h-7 opacity-80" />
              </div>
              <h3 className="text-sm font-medium opacity-90">总投入成本</h3>
              <p className="text-3xl font-bold mt-1">TJS {summary.total_cost.toLocaleString()}</p>
              <p className="text-xs mt-2 opacity-80">
                {summary.total_charges > 0
                  ? `获客成本: TJS ${(summary.total_cost / summary.total_charges).toFixed(0)}/人`
                  : '暂无数据'}
              </p>
            </div>

            <div className={`bg-gradient-to-br ${summary.overall_roi >= 2 ? 'from-emerald-500 to-emerald-600' : summary.overall_roi >= 1 ? 'from-yellow-500 to-yellow-600' : 'from-red-500 to-red-600'} rounded-lg p-5 text-white shadow-lg`}>
              <div className="flex items-center justify-between mb-3">
                <Zap className="w-7 h-7 opacity-80" />
              </div>
              <h3 className="text-sm font-medium opacity-90">综合ROI</h3>
              <p className="text-3xl font-bold mt-1">{summary.overall_roi > 0 ? `${summary.overall_roi.toFixed(1)}x` : '--'}</p>
              <p className="text-xs mt-2 opacity-80">
                {summary.overall_roi >= 2 ? '投入产出优秀' : summary.overall_roi >= 1 ? '投入产出持平' : summary.total_cost > 0 ? '投入大于产出' : '未配置成本'}
              </p>
            </div>
          </div>

          {/* Insights */}
          {getInsights().length > 0 && (
            <div className="space-y-2">
              {getInsights().map((insight, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${
                    insight.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
                    insight.type === 'warning' ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' :
                    'bg-blue-50 text-blue-800 border border-blue-200'
                  }`}
                >
                  <Lightbulb className="w-4 h-4 flex-shrink-0" />
                  {insight.message}
                </div>
              ))}
            </div>
          )}

          {/* Channel Analytics Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                渠道ROI对比
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : sortedChannels.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>暂无渠道分析数据</p>
                  <p className="text-sm mt-1">请先在"邀请码管理"中为地推人员分配渠道</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="px-4 py-3 text-left font-medium text-gray-500">
                          <button onClick={() => handleSort('channel')} className="hover:text-gray-900">
                            渠道{getSortIcon('channel')}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">人员</th>
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
                          <button onClick={() => handleSort('conversion_rate')} className="hover:text-gray-900">
                            转化率{getSortIcon('conversion_rate')}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">投入(TJS)</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">
                          <button onClick={() => handleSort('cost_per_charge')} className="hover:text-gray-900">
                            获客成本{getSortIcon('cost_per_charge')}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">
                          <button onClick={() => handleSort('roi')} className="hover:text-gray-900">
                            ROI{getSortIcon('roi')}
                          </button>
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-gray-500">环比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedChannels.map((ch) => (
                        <tr key={ch.channel} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span>{getChannelIcon(ch.channel)}</span>
                              <span className="font-medium text-gray-900">{getChannelLabel(ch.channel)}</span>
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getChannelColor(ch.channel)}`}>
                                {ch.channel.startsWith('offline_') ? '线下' :
                                 ch.channel.startsWith('online_') ? '线上' :
                                 ch.channel.startsWith('partner_') ? '合作' : '其他'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{ch.staff_count}</td>
                          <td className="px-4 py-3 text-right font-medium text-blue-600">{ch.registrations}</td>
                          <td className="px-4 py-3 text-right font-medium text-green-600">{ch.charges}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{ch.charge_amount.toFixed(0)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-medium ${ch.conversion_rate >= 25 ? 'text-green-600' : ch.conversion_rate >= 15 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {ch.conversion_rate.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{ch.cost > 0 ? ch.cost.toLocaleString() : '--'}</td>
                          <td className="px-4 py-3 text-right text-gray-900">
                            {ch.cost_per_charge > 0 ? `${ch.cost_per_charge.toFixed(0)}` : '--'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {ch.roi > 0 ? (
                              <span className={`font-bold ${ch.roi >= 3 ? 'text-green-600' : ch.roi >= 1.5 ? 'text-blue-600' : ch.roi >= 1 ? 'text-yellow-600' : 'text-red-600'}`}>
                                {ch.roi.toFixed(1)}x
                              </span>
                            ) : (
                              <span className="text-gray-400">--</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <TrendIndicator current={ch.registrations} previous={ch.prev_registrations} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Totals row */}
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold border-t-2">
                        <td className="px-4 py-3 text-gray-900">合计</td>
                        <td className="px-4 py-3 text-right text-gray-900">{summary.total_staff}</td>
                        <td className="px-4 py-3 text-right text-blue-600">{summary.total_registrations}</td>
                        <td className="px-4 py-3 text-right text-green-600">{summary.total_charges}</td>
                        <td className="px-4 py-3 text-right text-gray-900">{summary.total_charge_amount.toFixed(0)}</td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {summary.total_registrations > 0 ? `${(summary.total_charges / summary.total_registrations * 100).toFixed(1)}%` : '--'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">{summary.total_cost > 0 ? summary.total_cost.toLocaleString() : '--'}</td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {summary.total_cost > 0 && summary.total_charges > 0 ? `${(summary.total_cost / summary.total_charges).toFixed(0)}` : '--'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {summary.overall_roi > 0 ? (
                            <span className={`font-bold ${summary.overall_roi >= 2 ? 'text-green-600' : 'text-yellow-600'}`}>
                              {summary.overall_roi.toFixed(1)}x
                            </span>
                          ) : '--'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <TrendIndicator current={summary.total_registrations} previous={summary.prev_total_registrations} />
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ==================== Invite Codes Tab ==================== */}
      {activeTab === 'codes' && (
        <>
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              管理地推人员的邀请码与渠道归属关系，实现精准的渠道归因分析
            </p>
            <Button size="sm" onClick={() => { resetCodeForm(); setShowAddCode(true); }}>
              <Plus className="w-4 h-4 mr-1" /> 添加邀请码
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {codesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>邀请码</TableHead>
                      <TableHead>地推人员</TableHead>
                      <TableHead>渠道</TableHead>
                      <TableHead>关联点位</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>备注</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inviteCodes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-gray-500">
                          <Hash className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>暂无邀请码记录</p>
                          <p className="text-sm mt-1">点击"添加邀请码"将地推人员的邀请码与渠道关联</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      inviteCodes.map(code => (
                        <TableRow key={code.id}>
                          <TableCell className="font-mono font-medium text-blue-600">{code.code}</TableCell>
                          <TableCell className="font-medium">{code.promoter_name}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getChannelColor(code.channel)}`}>
                              {getChannelLabel(code.channel)}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{code.point_name}</TableCell>
                          <TableCell>
                            {code.is_active
                              ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">启用</span>
                              : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">停用</span>
                            }
                          </TableCell>
                          <TableCell className="text-sm text-gray-600 max-w-xs truncate">{code.notes || '--'}</TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {new Date(code.created_at).toLocaleDateString('zh-CN')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleToggleCode(code)}
                                className="p-1.5 text-gray-400 hover:text-yellow-600 rounded"
                                title={code.is_active ? '停用' : '启用'}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteCode(code)}
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
        </>
      )}

      {/* ==================== Cost Config Dialog ==================== */}
      <Dialog open={showCostConfig} onOpenChange={setShowCostConfig}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              渠道成本配置
            </DialogTitle>
            <DialogDescription>
              配置各推广渠道的月度投入成本，用于计算获客成本和ROI。非月度时间范围会自动按比例折算。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editingCosts.map((entry, idx) => (
              <div key={idx} className="flex items-end gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">渠道</label>
                  <select
                    value={entry.channel}
                    onChange={(e) => {
                      const newCosts = [...editingCosts];
                      newCosts[idx].channel = e.target.value;
                      setEditingCosts(newCosts);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    {CHANNEL_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-36">
                  <label className="block text-xs font-medium text-gray-500 mb-1">月度成本 (TJS)</label>
                  <input
                    type="number"
                    value={entry.monthly_cost}
                    onChange={(e) => {
                      const newCosts = [...editingCosts];
                      newCosts[idx].monthly_cost = e.target.value;
                      setEditingCosts(newCosts);
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">说明</label>
                  <input
                    type="text"
                    value={entry.description}
                    onChange={(e) => {
                      const newCosts = [...editingCosts];
                      newCosts[idx].description = e.target.value;
                      setEditingCosts(newCosts);
                    }}
                    placeholder="如: 6人×日薪100TJS×30天"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={() => removeCostRow(idx)}
                  className="p-2 text-gray-400 hover:text-red-600 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button
              onClick={addCostRow}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" /> 添加渠道成本
            </button>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCostConfig(false)}>取消</Button>
              <Button onClick={saveCostConfig} disabled={costConfigLoading}>
                <Save className="w-4 h-4 mr-1" />
                {costConfigLoading ? '保存中...' : '保存配置'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== Add Invite Code Dialog ==================== */}
      <Dialog open={showAddCode} onOpenChange={(open) => { if (!open) setShowAddCode(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>添加邀请码</DialogTitle>
            <DialogDescription>
              将地推人员的邀请码与渠道关联，实现渠道归因追踪
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search promoter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">搜索地推人员</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={codeForm.promoter_search}
                  onChange={(e) => setCodeForm(prev => ({ ...prev, promoter_search: e.target.value }))}
                  onKeyPress={(e) => e.key === 'Enter' && searchUsers()}
                  placeholder="输入手机号、用户名或邀请码"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <Button size="sm" onClick={searchUsers} disabled={searchingUser}>
                  {searchingUser ? <RefreshCw className="w-4 h-4 animate-spin" /> : '搜索'}
                </Button>
              </div>
            </div>

            {/* Search results */}
            {searchedUsers.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  点击用户将自动填充邀请码
                </div>
                <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                  {searchedUsers.map(u => (
                    <div
                      key={u.id}
                      className={`flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer ${
                        codeForm.promoter_id === u.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => {
                        const name = u.phone_number || `${u.first_name || ''} ${u.last_name || ''}`.trim() || '668265e0';
                        setCodeForm(prev => ({
                          ...prev,
                          promoter_id: u.id,
                          promoter_name: name,
                          code: u.referral_code || prev.code,
                        }));
                      }}
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {u.phone_number || `${u.first_name || ''} ${u.last_name || ''}`.trim() || '668265e0'}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            邀请码: <span className="font-mono font-semibold text-blue-600">{u.referral_code || '--'}</span>
                          </span>
                          <span>|</span>
                          <span>手机号: {u.phone_number || '--'}</span>
                        </div>
                      </div>
                      {codeForm.promoter_id === u.id && (
                        <span className="text-blue-600 text-xs font-medium">✓ 已选择</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {codeForm.promoter_name && (
              <div className="bg-blue-50 px-3 py-2 rounded-lg text-sm">
                已选择: <strong>{codeForm.promoter_name}</strong>
              </div>
            )}

            {/* Invite code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">邀请码 *</label>
              <input
                type="text"
                value={codeForm.code}
                onChange={(e) => setCodeForm(prev => ({ ...prev, code: e.target.value }))}
                placeholder="用户的邀请码"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Channel */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">渠道 *</label>
              <select
                value={codeForm.channel}
                onChange={(e) => setCodeForm(prev => ({ ...prev, channel: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                {CHANNEL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Point */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">关联点位</label>
              <select
                value={codeForm.point_id}
                onChange={(e) => setCodeForm(prev => ({ ...prev, point_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">不关联点位</option>
                {points.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <input
                type="text"
                value={codeForm.notes}
                onChange={(e) => setCodeForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="可选备注"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddCode(false)}>取消</Button>
              <Button onClick={handleAddCode}>添加</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除邀请码确认弹窗 */}
      <Dialog open={!!deleteCodeTarget} onOpenChange={(open) => { if (!open) setDeleteCodeTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除邀请码</DialogTitle>
            <DialogDescription>
              确定要删除邀请码 <strong>{deleteCodeTarget?.code}</strong> 吗？
              {deleteCodeTarget?.promoter_name && (
                <span className="block mt-1 text-gray-600">所属推广员：{deleteCodeTarget.promoter_name}</span>
              )}
              删除后该邀请码将无法使用，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeleteCodeTarget(null)}>取消</Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteCode}
              disabled={deletingCode}
            >
              {deletingCode ? '删除中...' : '确认删除'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
