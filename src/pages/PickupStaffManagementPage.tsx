/**
 * PickupStaffManagementPage - 核销员管理页面
 * 
 * 功能：
 *   1. 核销员列表（显示手机号、姓名、绑定自提点、状态、添加时间）
 *   2. 添加核销员（通过手机号/用户ID搜索普通用户 → 选择自提点 → 添加）
 *   3. 启用/停用核销员
 *   4. 更换绑定自提点
 *   5. 查看核销员的历史核销日志
 * 
 * 设计模式参考 PromoterManagementPage.tsx
 */

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
import { auditLog } from '../lib/auditLogger';
import {
  Users,
  UserPlus,
  Search,
  RefreshCw,
  MapPin,
  Shield,
  ShieldCheck,
  ShieldOff,
  ClipboardList,
  Eye,
  X,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface PickupStaff {
  user_id: string;
  point_id: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  user_name?: string;
  phone_number?: string;
  point_name?: string;
}

interface PickupPoint {
  id: string;
  name: string;
  name_i18n?: { zh?: string; ru?: string; tg?: string } | null;
  address: string;
  is_active: boolean;
}

interface PickupLog {
  id: string;
  prize_id: string;
  pickup_code: string;
  operation_type: string;
  order_type: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
}

// ============================================================
// Main Component
// ============================================================

export default function PickupStaffManagementPage() {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();

  // Staff list state
  const [staffList, setStaffList] = useState<PickupStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Pickup points for dropdown
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);

  // Add staff dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newStaffSearch, setNewStaffSearch] = useState('');
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const [searchingUser, setSearchingUser] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedPointId, setSelectedPointId] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);

  // Edit point dialog
  const [showEditPointDialog, setShowEditPointDialog] = useState(false);
  const [editingStaff, setEditingStaff] = useState<PickupStaff | null>(null);
  const [editPointId, setEditPointId] = useState('');

  // View logs dialog
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [logsStaff, setLogsStaff] = useState<PickupStaff | null>(null);
  const [staffLogs, setStaffLogs] = useState<PickupLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // ============================================================
  // Data Fetching
  // ============================================================

  const fetchPickupPoints = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pickup_points')
        .select('id, name, name_i18n, address, is_active')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setPickupPoints(data || []);
    } catch (err: any) {
      console.error('Failed to fetch pickup points:', err);
    }
  }, [supabase]);

  const fetchStaffList = useCallback(async () => {
    setLoading(true);
    try {
      const { data: staffData, error: staffError } = await supabase
        .from('pickup_staff_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (staffError) throw staffError;

      if (!staffData || staffData.length === 0) {
        setStaffList([]);
        setLoading(false);
        return;
      }

      // Fetch user info
      const userIds = staffData.map(s => s.user_id);
      const { data: usersData } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone_number')
        .in('id', userIds);

      // Fetch pickup point names
      const pointIds = [...new Set(staffData.map(s => s.point_id).filter(Boolean))];
      let pointsMap: Record<string, string> = {};
      if (pointIds.length > 0) {
        const { data: ptData } = await supabase
          .from('pickup_points')
          .select('id, name')
          .in('id', pointIds as string[]);
        if (ptData) pointsMap = Object.fromEntries(ptData.map(p => [p.id, p.name]));
      }

      const enriched: PickupStaff[] = staffData.map(s => {
        const user = usersData?.find(u => u.id === s.user_id);
        return {
          ...s,
          user_name: [user?.first_name, user?.last_name].filter(Boolean).join(' ') || '暂无',
          phone_number: user?.phone_number || '',
          point_name: s.point_id ? pointsMap[s.point_id] || '未知' : '未绑定',
        };
      });

      setStaffList(enriched);
    } catch (err: any) {
      console.error('Failed to fetch staff list:', err);
      toast.error('加载核销员列表失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchStaffList();
    fetchPickupPoints();
  }, [fetchStaffList, fetchPickupPoints]);

  // ============================================================
  // Search Users
  // ============================================================

  const handleSearchUser = async () => {
    if (!newStaffSearch.trim()) return;
    setSearchingUser(true);
    setSearchedUsers([]);

    try {
      // Search by phone number or user ID
      const term = newStaffSearch.trim();
      let query = supabase
        .from('users')
        .select('id, first_name, last_name, phone_number, avatar_url')
        .limit(10);

      // If it looks like a UUID, search by ID
      if (term.length > 30 && term.includes('-')) {
        query = query.eq('id', term);
      } else {
        // Search by phone number (partial match)
        query = query.ilike('phone_number', `%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error('未找到匹配的用户');
        return;
      }

      // Filter out users who are already staff
      const existingIds = staffList.map(s => s.user_id);
      const filtered = data.filter(u => !existingIds.includes(u.id));

      if (filtered.length === 0) {
        toast.error('搜索到的用户已经是核销员');
        return;
      }

      setSearchedUsers(filtered);
    } catch (err: any) {
      console.error('Search user error:', err);
      toast.error('搜索失败: ' + err.message);
    } finally {
      setSearchingUser(false);
    }
  };

  // ============================================================
  // Add Staff
  // ============================================================

  const handleAddStaff = async () => {
    if (!selectedUserId) {
      toast.error('请选择用户');
      return;
    }
    if (!selectedPointId) {
      toast.error('请选择自提点');
      return;
    }

    setAddingStaff(true);
    try {
      const { error } = await supabase
        .from('pickup_staff_profiles')
        .insert({
          user_id: selectedUserId,
          point_id: selectedPointId,
          status: 'active',
          created_by: admin?.id || null,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('该用户已经是核销员');
        } else {
          throw error;
        }
        return;
      }

      // Audit log
      if (admin) {
        await auditLog(supabase, {
          adminId: admin.id,
          action: 'ADD_PICKUP_STAFF',
          targetType: 'pickup_staff_profiles',
          targetId: selectedUserId,
          newData: { user_id: selectedUserId, point_id: selectedPointId },
          details: { point_name: pickupPoints.find(p => p.id === selectedPointId)?.name },
        });
      }

      toast.success('核销员添加成功');
      setShowAddDialog(false);
      resetAddForm();
      fetchStaffList();
    } catch (err: any) {
      console.error('Add staff error:', err);
      toast.error('添加失败: ' + err.message);
    } finally {
      setAddingStaff(false);
    }
  };

  const resetAddForm = () => {
    setNewStaffSearch('');
    setSearchedUsers([]);
    setSelectedUserId('');
    setSelectedPointId('');
  };

  // ============================================================
  // Toggle Status
  // ============================================================

  const handleToggleStatus = async (staff: PickupStaff) => {
    const newStatus = staff.status === 'active' ? 'inactive' : 'active';
    const actionText = newStatus === 'active' ? '启用' : '停用';

    if (!confirm(`确定要${actionText}核销员 ${staff.user_name}（${staff.phone_number}）吗？`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('pickup_staff_profiles')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('user_id', staff.user_id);

      if (error) throw error;

      // Audit log
      if (admin) {
        await auditLog(supabase, {
          adminId: admin.id,
          action: newStatus === 'active' ? 'ENABLE_PICKUP_STAFF' : 'DISABLE_PICKUP_STAFF',
          targetType: 'pickup_staff_profiles',
          targetId: staff.user_id,
          oldData: { status: staff.status },
          newData: { status: newStatus },
        });
      }

      toast.success(`已${actionText}核销员 ${staff.user_name}`);
      fetchStaffList();
    } catch (err: any) {
      console.error('Toggle status error:', err);
      toast.error(`${actionText}失败: ` + err.message);
    }
  };

  // ============================================================
  // Edit Pickup Point
  // ============================================================

  const openEditPoint = (staff: PickupStaff) => {
    setEditingStaff(staff);
    setEditPointId(staff.point_id || '');
    setShowEditPointDialog(true);
  };

  const handleUpdatePoint = async () => {
    if (!editingStaff) return;

    try {
      const { error } = await supabase
        .from('pickup_staff_profiles')
        .update({ point_id: editPointId || null, updated_at: new Date().toISOString() })
        .eq('user_id', editingStaff.user_id);

      if (error) throw error;

      // Audit log
      if (admin) {
        await auditLog(supabase, {
          adminId: admin.id,
          action: 'UPDATE_PICKUP_STAFF_POINT',
          targetType: 'pickup_staff_profiles',
          targetId: editingStaff.user_id,
          oldData: { point_id: editingStaff.point_id },
          newData: { point_id: editPointId || null },
          details: {
            old_point_name: editingStaff.point_name,
            new_point_name: pickupPoints.find(p => p.id === editPointId)?.name || '未绑定',
          },
        });
      }

      toast.success('自提点更新成功');
      setShowEditPointDialog(false);
      setEditingStaff(null);
      fetchStaffList();
    } catch (err: any) {
      console.error('Update point error:', err);
      toast.error('更新失败: ' + err.message);
    }
  };

  // ============================================================
  // View Logs
  // ============================================================

  const openViewLogs = async (staff: PickupStaff) => {
    setLogsStaff(staff);
    setShowLogsDialog(true);
    setLoadingLogs(true);
    setStaffLogs([]);

    try {
      const { data, error } = await supabase
        .from('pickup_logs')
        .select('id, prize_id, pickup_code, operation_type, order_type, source, notes, created_at')
        .eq('operator_id', staff.user_id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setStaffLogs(data || []);
    } catch (err: any) {
      console.error('Load logs error:', err);
      toast.error('加载核销日志失败');
    } finally {
      setLoadingLogs(false);
    }
  };

  // ============================================================
  // Filter
  // ============================================================

  const filteredStaff = staffList.filter(s => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (s.user_name || '').toLowerCase().includes(term) ||
      (s.phone_number || '').toLowerCase().includes(term) ||
      (s.point_name || '').toLowerCase().includes(term)
    );
  });

  // Stats
  const stats = {
    total: staffList.length,
    active: staffList.filter(s => s.status === 'active').length,
    inactive: staffList.filter(s => s.status !== 'active').length,
  };

  // ============================================================
  // Helpers
  // ============================================================

  const getStatusBadge = (status: string) => {
    if (status === 'active') {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">启用</span>;
    }
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">停用</span>;
  };

  const getOperationTypeBadge = (type: string) => {
    const map: Record<string, { label: string; color: string }> = {
      'STAFF_VERIFY': { label: '前端核销', color: 'bg-blue-100 text-blue-800' },
      'FRONTEND_VERIFY': { label: '前端核销', color: 'bg-blue-100 text-blue-800' },
      'ADMIN_VERIFY': { label: '管理后台', color: 'bg-purple-100 text-purple-800' },
      'CLAIM': { label: '用户领取', color: 'bg-yellow-100 text-yellow-800' },
      'EXTEND': { label: '延期', color: 'bg-orange-100 text-orange-800' },
    };
    const info = map[type] || { label: type, color: 'bg-gray-100 text-gray-600' };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}>{info.label}</span>;
  };

  const getOrderTypeBadge = (type: string | null) => {
    if (!type) return '-';
    const map: Record<string, string> = {
      lottery: '积分商城',
      group_buy: '拼团',
      full_purchase: '全款购买',
    };
    return map[type] || type;
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
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
            <ShieldCheck className="w-7 h-7 text-green-600" />
            核销员管理
          </h1>
          <p className="text-gray-500 mt-1">管理前端自提点核销员的权限和绑定关系</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchStaffList()}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={() => {
              resetAddForm();
              setShowAddDialog(true);
            }}
          >
            <UserPlus className="w-4 h-4 mr-1" />
            添加核销员
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">总核销员</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <Users className="w-8 h-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">启用中</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
              <ShieldCheck className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">已停用</p>
                <p className="text-2xl font-bold text-gray-400">{stats.inactive}</p>
              </div>
              <ShieldOff className="w-8 h-8 text-gray-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">核销员列表</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索姓名、手机号、自提点..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-gray-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p>加载中...</p>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-lg font-medium">暂无核销员</p>
              <p className="text-sm mt-1">点击"添加核销员"按钮开始配置</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead>绑定自提点</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>添加时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((staff) => (
                  <TableRow key={staff.user_id}>
                    <TableCell className="font-medium">{staff.user_name}</TableCell>
                    <TableCell className="font-mono text-sm">{staff.phone_number || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-sm">{staff.point_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(staff.status)}</TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {formatDateTime(staff.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditPoint(staff)}
                          title="更换自提点"
                        >
                          <MapPin className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openViewLogs(staff)}
                          title="查看核销日志"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(staff)}
                          title={staff.status === 'active' ? '停用' : '启用'}
                          className={staff.status === 'active' ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}
                        >
                          {staff.status === 'active' ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ========== Add Staff Dialog ========== */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              添加核销员
            </DialogTitle>
            <DialogDescription>
              通过手机号搜索用户，选择自提点后添加为核销员
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Search user */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">搜索用户</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStaffSearch}
                  onChange={(e) => setNewStaffSearch(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearchUser()}
                  placeholder="输入手机号或用户ID"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <Button
                  variant="outline"
                  onClick={handleSearchUser}
                  disabled={searchingUser}
                >
                  {searchingUser ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* Search results */}
            {searchedUsers.length > 0 && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">选择用户</label>
                {searchedUsers.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedUserId === user.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">
                          {[user.first_name, user.last_name].filter(Boolean).join(' ') || '未设置姓名'}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">{user.phone_number || user.id.slice(0, 8)}</p>
                      </div>
                      {selectedUserId === user.id && (
                        <Shield className="w-5 h-5 text-blue-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Select pickup point */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">绑定自提点</label>
              <select
                value={selectedPointId}
                onChange={(e) => setSelectedPointId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">请选择自提点</option>
                {pickupPoints.map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.name} - {point.address}
                  </option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddDialog(false);
                  resetAddForm();
                }}
              >
                取消
              </Button>
              <Button
                onClick={handleAddStaff}
                disabled={!selectedUserId || !selectedPointId || addingStaff}
              >
                {addingStaff ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                    添加中...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-1" />
                    确认添加
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========== Edit Point Dialog ========== */}
      <Dialog open={showEditPointDialog} onOpenChange={setShowEditPointDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              更换自提点
            </DialogTitle>
            <DialogDescription>
              为核销员 {editingStaff?.user_name}（{editingStaff?.phone_number}）更换绑定的自提点
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">当前自提点</label>
              <p className="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
                {editingStaff?.point_name || '未绑定'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">新自提点</label>
              <select
                value={editPointId}
                onChange={(e) => setEditPointId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">不绑定</option>
                {pickupPoints.map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.name} - {point.address}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowEditPointDialog(false)}>
                取消
              </Button>
              <Button onClick={handleUpdatePoint}>
                确认更换
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========== View Logs Dialog ========== */}
      <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              核销日志 - {logsStaff?.user_name}
            </DialogTitle>
            <DialogDescription>
              {logsStaff?.phone_number} | 绑定自提点: {logsStaff?.point_name}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            {loadingLogs ? (
              <div className="text-center py-8 text-gray-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                <p>加载中...</p>
              </div>
            ) : staffLogs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <ClipboardList className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p>暂无核销日志</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>提货码</TableHead>
                    <TableHead>操作类型</TableHead>
                    <TableHead>订单类型</TableHead>
                    <TableHead>备注</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-gray-500 whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium">
                        {log.pickup_code}
                      </TableCell>
                      <TableCell>{getOperationTypeBadge(log.operation_type)}</TableCell>
                      <TableCell className="text-sm">{getOrderTypeBadge(log.order_type)}</TableCell>
                      <TableCell className="text-sm text-gray-500 max-w-[200px] truncate">
                        {log.notes || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
