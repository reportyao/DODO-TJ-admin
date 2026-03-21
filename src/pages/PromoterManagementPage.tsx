import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { useAdminAuth } from '../contexts/AdminAuthContext';
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
  Users,
  UserPlus,
  Search,
  RefreshCw,
  Edit,
  Trash2,
  MapPin,
  Shield,
  Plus,
  X,
  Download,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Calendar,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface PromoterProfile {
  user_id: string;
  team_id: string | null;
  point_id: string | null;
  promoter_status: 'active' | 'paused' | 'dismissed';
  hire_date: string | null;
  daily_base_salary: number;
  daily_deposit_limit: number;
  created_at: string;
  // Joined fields
  user_name?: string;
  phone_number?: string;
  referral_code?: string;
  team_name?: string;
  point_name?: string;
}

interface Team {
  id: string;
  name: string;
  leader_user_id: string | null;
  leader_name?: string;
  member_count?: number;
  created_at: string;
}

interface PromotionPoint {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  area_size: 'large' | 'medium' | 'small';
  point_status: 'active' | 'inactive';
  created_at: string;
  staff_count?: number;
}

interface DailyLog {
  id?: string;
  promoter_id: string;
  log_date: string;
  contact_count: number;
  note: string;
}

type ActiveTab = 'promoters' | 'teams' | 'points';

// ============================================================
// Main Component
// ============================================================

export default function PromoterManagementPage() {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('promoters');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Promoters state
  const [promoters, setPromoters] = useState<PromoterProfile[]>([]);
  const [showAddPromoter, setShowAddPromoter] = useState(false);
  const [editingPromoter, setEditingPromoter] = useState<PromoterProfile | null>(null);
  const [newPromoterSearch, setNewPromoterSearch] = useState('');
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const [searchingUser, setSearchingUser] = useState(false);

  // Teams state
  const [teams, setTeams] = useState<Team[]>([]);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamForm, setTeamForm] = useState({ name: '', leader_user_id: '' });

  // Points state
  const [points, setPoints] = useState<PromotionPoint[]>([]);
  const [showAddPoint, setShowAddPoint] = useState(false);
  const [editingPoint, setEditingPoint] = useState<PromotionPoint | null>(null);
  const [pointForm, setPointForm] = useState({
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    area_size: 'medium' as 'large' | 'medium' | 'small',
    point_status: 'active' as 'active' | 'inactive',
  });

  // Promoter form state
  const [promoterForm, setPromoterForm] = useState({
    user_id: '',
    team_id: '',
    point_id: '',
    daily_base_salary: 0,
    daily_deposit_limit: 5000,
    hire_date: new Date().toISOString().split('T')[0],
  });

  // Daily log state
  const [showDailyLog, setShowDailyLog] = useState(false);
  const [dailyLogPromoter, setDailyLogPromoter] = useState<PromoterProfile | null>(null);
  const [dailyLogForm, setDailyLogForm] = useState<DailyLog>({
    promoter_id: '',
    log_date: new Date().toISOString().split('T')[0],
    contact_count: 0,
    note: '',
  });
  const [dailyLogHistory, setDailyLogHistory] = useState<DailyLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [savingLog, setSavingLog] = useState(false);

  // ============================================================
  // Data Fetching
  // ============================================================

  const fetchPromoters = useCallback(async () => {
    setLoading(true);
    try {
      const { data: ppData, error: ppError } = await supabase
        .from('promoter_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (ppError) throw ppError;

      if (!ppData || ppData.length === 0) {
        setPromoters([]);
        setLoading(false);
        return;
      }

      // Fetch user info
      const userIds = ppData.map(p => p.user_id);
      const { data: usersData } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone_number, referral_code')
        .in('id', userIds);

      // Fetch teams
      const teamIds = [...new Set(ppData.map(p => p.team_id).filter(Boolean))];
      let teamsMap: Record<string, string> = {};
      if (teamIds.length > 0) {
        const { data: tData } = await supabase
          .from('promoter_teams')
          .select('id, name')
          .in('id', teamIds as string[]);
        if (tData) teamsMap = Object.fromEntries(tData.map(t => [t.id, t.name]));
      }

      // Fetch points
      const pointIds = [...new Set(ppData.map(p => p.point_id).filter(Boolean))];
      let pointsMap: Record<string, string> = {};
      if (pointIds.length > 0) {
        const { data: ptData } = await supabase
          .from('promotion_points')
          .select('id, name')
          .in('id', pointIds as string[]);
        if (ptData) pointsMap = Object.fromEntries(ptData.map(p => [p.id, p.name]));
      }

      const enriched: PromoterProfile[] = ppData.map(pp => {
        const user = usersData?.find(u => u.id === pp.user_id);
        return {
          ...pp,
          user_name: [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.phone_number || '668265e0',
          phone_number: user?.phone_number || '',
          referral_code: user?.referral_code || '',
          team_name: pp.team_id ? teamsMap[pp.team_id] || '' : '',
          point_name: pp.point_id ? pointsMap[pp.point_id] || '' : '',
        };
      });

      setPromoters(enriched);
    } catch (err: any) {
      console.error('Failed to fetch promoters:', err);
      toast.error('加载地推人员失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('promoter_teams')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Enrich with leader name and member count
      if (data && data.length > 0) {
        const leaderIds = data.map(t => t.leader_user_id).filter(Boolean);
        let leadersMap: Record<string, string> = {};
        if (leaderIds.length > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, first_name, last_name, phone_number')
            .in('id', leaderIds as string[]);
          if (usersData) {
            leadersMap = Object.fromEntries(usersData.map(u => [
              u.id,
              u.phone_number || [u.first_name, u.last_name].filter(Boolean).join(' ') || '668265e0'
            ]));
          }
        }

        // Count members per team
        const { data: ppData } = await supabase
          .from('promoter_profiles')
          .select('team_id')
          .eq('promoter_status', 'active');

        const memberCounts: Record<string, number> = {};
        ppData?.forEach(pp => {
          if (pp.team_id) {
            memberCounts[pp.team_id] = (memberCounts[pp.team_id] || 0) + 1;
          }
        });

        const enriched: Team[] = data.map(t => ({
          ...t,
          leader_name: (t.leader_user_id && leadersMap[t.leader_user_id]) ? leadersMap[t.leader_user_id] : '',
          member_count: memberCounts[t.id] || 0,
        }));

        setTeams(enriched);
      } else {
        setTeams([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch teams:', err);
      toast.error('加载团队失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

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

      const enriched: PromotionPoint[] = (data || []).map(p => ({
        ...p,
        staff_count: staffCounts[p.id] || 0,
      }));

      setPoints(enriched);
    } catch (err: any) {
      console.error('Failed to fetch points:', err);
      toast.error('加载点位失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (activeTab === 'promoters') fetchPromoters();
    else if (activeTab === 'teams') fetchTeams();
    else if (activeTab === 'points') fetchPoints();
  }, [activeTab, fetchPromoters, fetchTeams, fetchPoints]);

  // Always load teams and points on mount (needed for dropdown menus in promoter dialogs)
  useEffect(() => {
    const loadDropdownData = async () => {
      try {
        const { data: tData } = await supabase
          .from('promoter_teams')
          .select('id, name, leader_user_id, created_at')
          .order('created_at', { ascending: false });
        if (tData && tData.length > 0) setTeams(prev => prev.length === 0 ? tData.map(t => ({ ...t, leader_name: '', member_count: 0 })) : prev);

        const { data: pData } = await supabase
          .from('promotion_points')
          .select('id, name, address, latitude, longitude, area_size, point_status, created_at')
          .order('created_at', { ascending: false });
        if (pData && pData.length > 0) setPoints(prev => prev.length === 0 ? pData.map(p => ({ ...p, staff_count: 0 })) : prev);
      } catch (err) {
        console.error('Failed to load dropdown data:', err);
      }
    };
    loadDropdownData();
  }, [supabase]);

  // ============================================================
  // User Search (for adding promoters)
  // ============================================================

  const searchUsers = async () => {
    if (!newPromoterSearch.trim()) return;
    setSearchingUser(true);
    try {
      // Sanitize input: remove special characters that could break PostgREST filter syntax
      const sanitized = newPromoterSearch.trim().replace(/[,().'"\\]/g, '');
      if (!sanitized) {
        setSearchedUsers([]);
        setSearchingUser(false);
        return;
      }
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone_number, referral_code')
        .or(`phone_number.eq.${sanitized},phone_number.ilike.%${sanitized}%,referral_code.eq.${sanitized}`)
        .limit(10);

      if (error) throw error;

      // Filter out users who are already promoters
      const existingIds = new Set(promoters.map(p => p.user_id));
      setSearchedUsers((data || []).filter(u => !existingIds.has(u.id)));
    } catch (err: any) {
      toast.error('搜索失败: ' + err.message);
    } finally {
      setSearchingUser(false);
    }
  };

  // ============================================================
  // CRUD Operations - Promoters
  // ============================================================

  const validatePromoterForm = (): boolean => {
    if (promoterForm.daily_base_salary < 0) {
      toast.error('日工不能为负数');
      return false;
    }
    if (promoterForm.daily_deposit_limit <= 0) {
      toast.error('日充値限额必须大于 0');
      return false;
    }
    return true;
  };

  const handleAddPromoter = async (userId: string) => {
    if (!validatePromoterForm()) return;
    try {
      const { error } = await supabase
        .from('promoter_profiles')
        .insert({
          user_id: userId,
          team_id: promoterForm.team_id || null,
          point_id: promoterForm.point_id || null,
          daily_base_salary: promoterForm.daily_base_salary,
          daily_deposit_limit: promoterForm.daily_deposit_limit,
          hire_date: promoterForm.hire_date,
          promoter_status: 'active',
        });

      if (error) throw error;

      toast.success('地推人员添加成功');
      setShowAddPromoter(false);
      setNewPromoterSearch('');
      setSearchedUsers([]);
      setPromoterForm({ user_id: '', team_id: '', point_id: '', daily_base_salary: 0, daily_deposit_limit: 5000, hire_date: new Date().toISOString().split('T')[0] });
      fetchPromoters();
    } catch (err: any) {
      toast.error('添加失败: ' + err.message);
    }
  };

  const handleUpdatePromoter = async () => {
    if (!editingPromoter) return;
    if (!validatePromoterForm()) return;
    try {
      const { error } = await supabase
        .from('promoter_profiles')
        .update({
          team_id: promoterForm.team_id || null,
          point_id: promoterForm.point_id || null,
          daily_base_salary: promoterForm.daily_base_salary,
          daily_deposit_limit: promoterForm.daily_deposit_limit,
          promoter_status: editingPromoter.promoter_status,
        })
        .eq('user_id', editingPromoter.user_id);

      if (error) throw error;

      toast.success('更新成功');
      setEditingPromoter(null);
      fetchPromoters();
    } catch (err: any) {
      toast.error('更新失败: ' + err.message);
    }
  };

  const handleTogglePromoterStatus = async (promoter: PromoterProfile) => {
    const newStatus = promoter.promoter_status === 'active' ? 'paused' : 'active';
    try {
      const { error } = await supabase
        .from('promoter_profiles')
        .update({ promoter_status: newStatus })
        .eq('user_id', promoter.user_id);

      if (error) throw error;

      toast.success(`已${newStatus === 'active' ? '激活' : '暂停'}地推人员`);
      fetchPromoters();
    } catch (err: any) {
      toast.error('操作失败: ' + err.message);
    }
  };

   const [dismissTarget, setDismissTarget] = useState<PromoterProfile | null>(null);

  const handleDismissPromoter = (promoter: PromoterProfile) => {
    setDismissTarget(promoter);
  };

  const confirmDismissPromoter = async () => {
    if (!dismissTarget) return;
    try {
      const { error } = await supabase
        .from('promoter_profiles')
        .update({ promoter_status: 'dismissed' })
        .eq('user_id', dismissTarget.user_id);
      if (error) throw error;
      toast.success('已解除地推人员');
      setDismissTarget(null);
      fetchPromoters();
    } catch (err: any) {
      toast.error('操作失败: ' + err.message);
    }
  };

  // ============================================================
  // Daily Log Operations
  // ============================================================

  const openDailyLog = async (promoter: PromoterProfile) => {
    setDailyLogPromoter(promoter);
    setDailyLogForm({
      promoter_id: promoter.user_id,
      log_date: new Date().toISOString().split('T')[0],
      contact_count: 0,
      note: '',
    });
    setShowDailyLog(true);
    await fetchDailyLogs(promoter.user_id);
  };

  const fetchDailyLogs = async (promoterId: string) => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('promoter_daily_logs')
        .select('*')
        .eq('promoter_id', promoterId)
        .order('log_date', { ascending: false })
        .limit(14);

      if (error) throw error;
      setDailyLogHistory(data || []);
    } catch (err: any) {
      toast.error('加载日志失败: ' + err.message);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleSaveDailyLog = async () => {
    if (!dailyLogPromoter) return;
    if (dailyLogForm.contact_count < 0) {
      toast.error('接触人数不能为负数');
      return;
    }
    setSavingLog(true);
    try {
      // Use upsert with the unique constraint (promoter_id, log_date)
      const { error } = await supabase
        .from('promoter_daily_logs')
        .upsert(
          {
            promoter_id: dailyLogPromoter.user_id,
            log_date: dailyLogForm.log_date,
            contact_count: dailyLogForm.contact_count,
            note: dailyLogForm.note,
          },
          { onConflict: 'promoter_id,log_date' }
        );

      if (error) throw error;

      toast.success(`${dailyLogForm.log_date} 日志已保存`);
      await fetchDailyLogs(dailyLogPromoter.user_id);
      // Reset form for next entry but keep the promoter
      setDailyLogForm(prev => ({
        ...prev,
        contact_count: 0,
        note: '',
      }));
    } catch (err: any) {
      toast.error('保存日志失败: ' + err.message);
    } finally {
      setSavingLog(false);
    }
  };

  const handleEditDailyLog = (log: DailyLog) => {
    setDailyLogForm({
      promoter_id: log.promoter_id,
      log_date: log.log_date,
      contact_count: log.contact_count,
      note: log.note || '',
    });
  };

  // ============================================================
  // CRUD Operations - Teams
  // ============================================================

  const handleSaveTeam = async () => {
    if (!teamForm.name.trim()) {
      toast.error('请输入团队名称');
      return;
    }
    try {
      // 如果填写了队长用户ID，先验证该用户是否存在
      let validLeaderUserId: string | null = null;
      if (teamForm.leader_user_id && teamForm.leader_user_id.trim()) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('id', teamForm.leader_user_id.trim())
          .maybeSingle();
        
        if (userError) {
          console.error('Validate leader user error:', userError);
        }
        
        if (!userData) {
          toast.error('队长用户ID不存在，请检查后重试');
          return;
        }
        validLeaderUserId = userData.id;
      }
      
      // 检查团队名称是否已存在
      const { data: existingTeams, error: checkError } = await supabase
        .from('promoter_teams')
        .select('id, name')
        .eq('name', teamForm.name.trim());
      
      if (checkError) {
        console.error('Check team name error:', checkError);
      }
      
      // 如果是新建或编辑时改了名字，检查是否重复
      if (existingTeams && existingTeams.length > 0) {
        const isDuplicate = editingTeam 
          ? existingTeams.some(t => t.id !== editingTeam.id)
          : true;
        
        if (isDuplicate) {
          toast.error(`团队名称 "${teamForm.name.trim()}" 已存在，请使用其他名称`);
          return;
        }
      }
      
      const teamPayload = {
        name: teamForm.name.trim(),
        leader_user_id: validLeaderUserId,
      };
      
      if (editingTeam) {
        const { error } = await supabase
          .from('promoter_teams')
          .update(teamPayload)
          .eq('id', editingTeam.id);
        if (error) throw error;
        toast.success('团队更新成功');
      } else {
        const { error } = await supabase
          .from('promoter_teams')
          .insert(teamPayload);
        if (error) {
          console.error('Insert team error:', error);
          if (error.code === '23505') {
            toast.error('团队名称已存在，请使用其他名称');
            return;
          }
          if (error.code === '23503') {
            toast.error('队长用户ID不存在，请检查后重试');
            return;
          }
          throw error;
        }
        toast.success('团队创建成功');
      }
      setShowAddTeam(false);
      setEditingTeam(null);
      setTeamForm({ name: '', leader_user_id: '' });
      fetchTeams();
    } catch (err: any) {
      console.error('Save team error:', err);
      toast.error('操作失败: ' + (err.message || '未知错误'));
    }
  };

  const handleDeleteTeam = async (team: Team) => {
    if (!confirm(`确定要删除团队 "${team.name}" 吗？该团队下的人员将变为无团队状态。`)) return;
    try {
      // Clear team_id from promoter_profiles
      await supabase
        .from('promoter_profiles')
        .update({ team_id: null })
        .eq('team_id', team.id);

      const { error } = await supabase
        .from('promoter_teams')
        .delete()
        .eq('id', team.id);

      if (error) throw error;

      toast.success('团队已删除');
      fetchTeams();
    } catch (err: any) {
      toast.error('删除失败: ' + err.message);
    }
  };

  // ============================================================
  // CRUD Operations - Points
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
      setPointForm({ name: '', address: '', latitude: '', longitude: '', area_size: 'medium', point_status: 'active' });
      fetchPoints();
    } catch (err: any) {
      toast.error('操作失败: ' + err.message);
    }
  };

  const handleDeletePoint = async (point: PromotionPoint) => {
    if (!confirm(`确定要删除点位 "${point.name}" 吗？`)) return;
    try {
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
      fetchPoints();
    } catch (err: any) {
      toast.error('删除失败: ' + err.message);
    }
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

  const exportPromoters = () => {
    const headers = ['姓名', '手机号', '邀请码', '团队', '点位', '状态', '日薪(TJS)', '充值额度(TJS)', '入职日期'];
    const rows = promoters.map(p => [
      p.user_name,
      p.phone_number,
      p.referral_code,
      p.team_name || '--',
      p.point_name || '--',
      p.promoter_status === 'active' ? '在岗' : p.promoter_status === 'paused' ? '暂停' : '已解除',
      p.daily_base_salary,
      p.daily_deposit_limit ?? 5000,
      p.hire_date || '--',
    ]);
    const csvContent = [headers.map(csvEscape).join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `promoters_${Date.now()}.csv`;
    link.click();
  };

  // ============================================================
  // Filter
  // ============================================================

  const filteredPromoters = promoters.filter(p => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (p.user_name?.toLowerCase().includes(term)) ||
      (p.phone_number?.toLowerCase().includes(term)) ||
      (p.referral_code?.toLowerCase().includes(term)) ||
      (p.team_name?.toLowerCase().includes(term)) ||
      (p.point_name?.toLowerCase().includes(term))
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">在岗</span>;
      case 'paused':
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">暂停</span>;
      case 'dismissed':
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">已解除</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const getPointStatusBadge = (status: string) => {
    return status === 'active'
      ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">启用</span>
      : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">停用</span>;
  };

  const getAreaSizeLabel = (size: string) => {
    switch (size) {
      case 'large': return '大型';
      case 'medium': return '中型';
      case 'small': return '小型';
      default: return size;
    }
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
            <Users className="w-7 h-7" />
            地推人员管理
          </h1>
          <p className="text-gray-600 mt-1">管理地推人员、团队和推广点位</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { key: 'promoters' as ActiveTab, label: '地推人员', icon: <Users className="w-4 h-4" />, count: promoters.length },
            { key: 'teams' as ActiveTab, label: '团队管理', icon: <Shield className="w-4 h-4" />, count: teams.length },
            { key: 'points' as ActiveTab, label: '点位管理', icon: <MapPin className="w-4 h-4" />, count: points.length },
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
              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* ==================== Promoters Tab ==================== */}
      {activeTab === 'promoters' && (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="搜索姓名、邀请码、团队..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportPromoters}>
                <Download className="w-4 h-4 mr-1" /> 导出
              </Button>
              <Button size="sm" onClick={() => setShowAddPromoter(true)}>
                <UserPlus className="w-4 h-4 mr-1" /> 添加地推人员
              </Button>
            </div>
          </div>

          {/* Promoters Table */}
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
                      <TableHead>姓名</TableHead>
                      <TableHead>手机号</TableHead>
                      <TableHead>邀请码</TableHead>
                      <TableHead>团队</TableHead>
                      <TableHead>点位</TableHead>
                      <TableHead>日薪</TableHead>
                      <TableHead>充值额度</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>入职日期</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPromoters.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-gray-500">
                          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>暂无地推人员</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPromoters.map(p => (
                        <TableRow key={p.user_id}>
                          <TableCell className="font-medium">{p.user_name}</TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {p.phone_number || '--'}
                          </TableCell>
                          <TableCell>
                            <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">{p.referral_code || '--'}</code>
                          </TableCell>
                          <TableCell>{p.team_name || '--'}</TableCell>
                          <TableCell>{p.point_name || '--'}</TableCell>
                          <TableCell>{p.daily_base_salary > 0 ? `${p.daily_base_salary} TJS` : '--'}</TableCell>
                          <TableCell>{p.daily_deposit_limit > 0 ? `${p.daily_deposit_limit} TJS` : '5000 TJS'}</TableCell>
                          <TableCell>{getStatusBadge(p.promoter_status)}</TableCell>
                          <TableCell className="text-sm text-gray-600">{p.hire_date || '--'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {/* Daily Log Button */}
                              <button
                                onClick={() => openDailyLog(p)}
                                className="p-1.5 text-gray-400 hover:text-indigo-600 rounded"
                                title="录入日志"
                              >
                                <ClipboardList className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingPromoter(p);
                                  setPromoterForm({
                                    user_id: p.user_id,
                                    team_id: p.team_id || '',
                                    point_id: p.point_id || '',
                                    daily_base_salary: p.daily_base_salary,
                                    daily_deposit_limit: p.daily_deposit_limit ?? 5000,
                                    hire_date: p.hire_date || '',
                                  });
                                }}
                                className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                                title="编辑"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleTogglePromoterStatus(p)}
                                className={`p-1.5 rounded text-xs font-medium ${
                                  p.promoter_status === 'active'
                                    ? 'text-yellow-600 hover:bg-yellow-50'
                                    : 'text-green-600 hover:bg-green-50'
                                }`}
                                title={p.promoter_status === 'active' ? '暂停' : '激活'}
                              >
                                {p.promoter_status === 'active' ? '暂停' : '激活'}
                              </button>
                              {p.promoter_status !== 'dismissed' && (
                                <button
                                  onClick={() => handleDismissPromoter(p)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                                  title="解除"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
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

      {/* ==================== Teams Tab ==================== */}
      {activeTab === 'teams' && (
        <>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setShowAddTeam(true); setTeamForm({ name: '', leader_user_id: '' }); }}>
              <Plus className="w-4 h-4 mr-1" /> 创建团队
            </Button>
          </div>

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
                      <TableHead>团队名称</TableHead>
                      <TableHead>队长</TableHead>
                      <TableHead>成员数</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teams.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-gray-500">
                          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>暂无团队</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      teams.map(t => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell>{t.leader_name || '--'}</TableCell>
                          <TableCell>{t.member_count || 0}</TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {new Date(t.created_at).toLocaleDateString('zh-CN')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setEditingTeam(t);
                                  setTeamForm({ name: t.name, leader_user_id: t.leader_user_id || '' });
                                  setShowAddTeam(true);
                                }}
                                className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTeam(t)}
                                className="p-1.5 text-gray-400 hover:text-red-600 rounded"
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

      {/* ==================== Points Tab ==================== */}
      {activeTab === 'points' && (
        <>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => {
              setShowAddPoint(true);
              setPointForm({ name: '', address: '', latitude: '', longitude: '', area_size: 'medium', point_status: 'active' });
            }}>
              <Plus className="w-4 h-4 mr-1" /> 添加点位
            </Button>
          </div>

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
                      <TableHead>创建时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {points.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                          <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>暂无点位</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      points.map(pt => (
                        <TableRow key={pt.id}>
                          <TableCell className="font-medium">{pt.name}</TableCell>
                          <TableCell className="text-sm text-gray-600 max-w-xs truncate">{pt.address || '--'}</TableCell>
                          <TableCell>{getAreaSizeLabel(pt.area_size)}</TableCell>
                          <TableCell>{pt.staff_count || 0}</TableCell>
                          <TableCell>{getPointStatusBadge(pt.point_status)}</TableCell>
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
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeletePoint(pt)}
                                className="p-1.5 text-gray-400 hover:text-red-600 rounded"
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

      {/* ==================== Add Promoter Dialog ==================== */}
      <Dialog open={showAddPromoter} onOpenChange={setShowAddPromoter}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>添加地推人员</DialogTitle>
            <DialogDescription>搜索平台用户并将其设置为地推人员</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search user */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">搜索用户</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPromoterSearch}
                  onChange={(e) => setNewPromoterSearch(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchUsers()}
                  placeholder="输入手机号、用户名或邀请码"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <Button size="sm" onClick={searchUsers} disabled={searchingUser}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Search results */}
            {searchedUsers.length > 0 && (
              <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                {searchedUsers.map(u => (
                  <div
                    key={u.id}
                    className={`flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer ${
                      promoterForm.user_id === u.id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => setPromoterForm(prev => ({ ...prev, user_id: u.id }))}
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {u.phone_number || [u.first_name, u.last_name].filter(Boolean).join(' ') || '668265e0'}
                      </div>
                      <div className="text-xs text-gray-500">
                        ID: {u.phone_number} | 邀请码: {u.referral_code || '--'}
                      </div>
                    </div>
                    {promoterForm.user_id === u.id && (
                      <span className="text-blue-600 text-sm font-medium">已选</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Team & Point selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分配团队</label>
                <select
                  value={promoterForm.team_id}
                  onChange={(e) => setPromoterForm(prev => ({ ...prev, team_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">无团队</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分配点位</label>
                <select
                  value={promoterForm.point_id}
                  onChange={(e) => setPromoterForm(prev => ({ ...prev, point_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">无点位</option>
                  {points.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日薪 (TJS)</label>
                <input
                  type="number"
                  min="0"
                  value={promoterForm.daily_base_salary}
                  onChange={(e) => setPromoterForm(prev => ({ ...prev, daily_base_salary: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">入职日期</label>
                <input
                  type="date"
                  value={promoterForm.hire_date}
                  onChange={(e) => setPromoterForm(prev => ({ ...prev, hire_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日充值额度 (TJS)</label>
              <input
                type="number"
                min="0"
                step="100"
                value={promoterForm.daily_deposit_limit}
                onChange={(e) => setPromoterForm(prev => ({ ...prev, daily_deposit_limit: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="默认 5000 TJS"
              />
              <p className="text-xs text-gray-500 mt-1">该地推人员每日可代客充值的最大总额，默认 5000 TJS</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddPromoter(false)}>取消</Button>
              <Button
                onClick={() => promoterForm.user_id && handleAddPromoter(promoterForm.user_id)}
                disabled={!promoterForm.user_id}
              >
                确认添加
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== Edit Promoter Dialog ==================== */}
      <Dialog open={!!editingPromoter} onOpenChange={(open) => !open && setEditingPromoter(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑地推人员</DialogTitle>
            <DialogDescription>{editingPromoter?.user_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分配团队</label>
                <select
                  value={promoterForm.team_id}
                  onChange={(e) => setPromoterForm(prev => ({ ...prev, team_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">无团队</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分配点位</label>
                <select
                  value={promoterForm.point_id}
                  onChange={(e) => setPromoterForm(prev => ({ ...prev, point_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">无点位</option>
                  {points.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日薪 (TJS)</label>
                <input
                  type="number"
                  min="0"
                  value={promoterForm.daily_base_salary}
                  onChange={(e) => setPromoterForm(prev => ({ ...prev, daily_base_salary: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日充值额度 (TJS)</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={promoterForm.daily_deposit_limit}
                  onChange={(e) => setPromoterForm(prev => ({ ...prev, daily_deposit_limit: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="默认 5000 TJS"
                />
                <p className="text-xs text-gray-500 mt-1">每日可代客充值最大总额</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingPromoter(null)}>取消</Button>
              <Button onClick={handleUpdatePromoter}>保存</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== Daily Log Dialog ==================== */}
      <Dialog open={showDailyLog} onOpenChange={(open) => { if (!open) { setShowDailyLog(false); setDailyLogPromoter(null); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              代录工作日志
            </DialogTitle>
            <DialogDescription>
              {dailyLogPromoter?.user_name} · {dailyLogPromoter?.referral_code || ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {/* Log Entry Form */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold text-blue-800">录入日志</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    <Calendar className="w-3 h-3 inline mr-1" />日期
                  </label>
                  <input
                    type="date"
                    value={dailyLogForm.log_date}
                    onChange={(e) => setDailyLogForm(prev => ({ ...prev, log_date: e.target.value }))}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">接触人数</label>
                  <input
                    type="number"
                    min="0"
                    value={dailyLogForm.contact_count}
                    onChange={(e) => setDailyLogForm(prev => ({ ...prev, contact_count: parseInt(e.target.value) || 0 }))}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    size="sm"
                    onClick={handleSaveDailyLog}
                    disabled={savingLog}
                    className="w-full"
                  >
                    {savingLog ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : null}
                    保存
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">备注（可选）</label>
                <input
                  type="text"
                  value={dailyLogForm.note}
                  onChange={(e) => setDailyLogForm(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="例如：天气不好人流少、换了新话术效果好..."
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-blue-600">同一日期重复保存会自动覆盖（upsert），可放心修改。</p>
            </div>

            {/* Log History */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">最近14天日志</h4>
              {loadingLogs ? (
                <div className="flex items-center justify-center py-6">
                  <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                </div>
              ) : dailyLogHistory.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">
                  暂无日志记录
                </div>
              ) : (
                <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                  {dailyLogHistory.map(log => (
                    <div
                      key={log.id || log.log_date}
                      className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleEditDailyLog(log)}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-medium text-gray-900 w-24">{log.log_date}</span>
                        <span className="text-sm">
                          接触 <span className="font-semibold text-blue-600">{log.contact_count}</span> 人
                        </span>
                        {log.note && (
                          <span className="text-xs text-gray-500 truncate max-w-[200px]">{log.note}</span>
                        )}
                      </div>
                      <Edit className="w-3 h-3 text-gray-400" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => { setShowDailyLog(false); setDailyLogPromoter(null); }}>关闭</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== Team Dialog ==================== */}
      <Dialog open={showAddTeam} onOpenChange={(open) => { if (!open) { setShowAddTeam(false); setEditingTeam(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTeam ? '编辑团队' : '创建团队'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">团队名称</label>
              <input
                type="text"
                value={teamForm.name}
                onChange={(e) => setTeamForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如: A组-市中心"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">队长 (用户ID，可选)</label>
              <input
                type="text"
                value={teamForm.leader_user_id}
                onChange={(e) => setTeamForm(prev => ({ ...prev, leader_user_id: e.target.value }))}
                placeholder="输入用户ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowAddTeam(false); setEditingTeam(null); }}>取消</Button>
              <Button onClick={handleSaveTeam}>{editingTeam ? '保存' : '创建'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== Point Dialog ==================== */}
      <Dialog open={showAddPoint} onOpenChange={(open) => { if (!open) { setShowAddPoint(false); setEditingPoint(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPoint ? '编辑点位' : '添加点位'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">点位名称</label>
              <input
                type="text"
                value={pointForm.name}
                onChange={(e) => setPointForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如: 鲁达基大道-Auchan超市"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
              <input
                type="text"
                value={pointForm.address}
                onChange={(e) => setPointForm(prev => ({ ...prev, address: e.target.value }))}
                placeholder="详细地址"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">经度</label>
                <input
                  type="text"
                  value={pointForm.longitude}
                  onChange={(e) => setPointForm(prev => ({ ...prev, longitude: e.target.value }))}
                  placeholder="68.7738"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
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

      {/* 解雇确认弹窗 */}
      <Dialog open={!!dismissTarget} onOpenChange={(open) => !open && setDismissTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认解雇地推人员</DialogTitle>
            <DialogDescription>
              确定要解除 <strong>{dismissTarget?.user_name}</strong> 的地推人员身份吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDismissTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={confirmDismissPromoter}>确认解雇</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
