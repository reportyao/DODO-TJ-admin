/**
 * 批发商审核管理页面
 * Phase 3: B2B 重构
 *
 * 功能：
 * - 列表展示 wholesaler_profiles 表数据
 * - 支持按状态筛选（pending / approved / rejected）
 * - 支持审核操作：通过 / 拒绝
 * - 展示关联用户信息
 */
import { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { adminQuery, adminUpdate, adminCount } from '../lib/adminApi';
import toast from 'react-hot-toast';

interface WholesalerProfile {
  id: string;
  user_id: string;
  company_name: string | null;
  contact_phone: string | null;
  tax_id: string | null;
  business_address: string | null;
  delivery_address: string | null;
  status: string;
  reject_reason: string | null;
  approved_at: string | null;
  approved_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface UserInfo {
  id: string;
  telegram_username: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待审核', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '已通过', color: 'bg-green-100 text-green-800' },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-800' },
};

export default function WholesalerManagementPage() {
  const { supabase } = useSupabase();
  const [profiles, setProfiles] = useState<WholesalerProfile[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserInfo>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<WholesalerProfile | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const PAGE_SIZE = 20;

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const filters = statusFilter !== 'all'
        ? [{ col: 'status', op: 'eq' as const, val: statusFilter }]
        : [];

      const [data, count] = await Promise.all([
        adminQuery<WholesalerProfile>(supabase, 'wholesaler_profiles', {
          filters,
          orderBy: 'created_at',
          orderAsc: false,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        }),
        adminCount(supabase, 'wholesaler_profiles', filters),
      ]);

      setProfiles(data);
      setTotalCount(count);

      // Fetch user info for all profiles
      const userIds = data.map(p => p.user_id).filter(Boolean);
      if (userIds.length > 0) {
        const users = await adminQuery<UserInfo>(supabase, 'users', {
          select: 'id,telegram_username,first_name,last_name,phone',
          orFilters: userIds.map(id => `id.eq.${id}`).join(','),
        });
        const map: Record<string, UserInfo> = {};
        users.forEach(u => { map[u.id] = u; });
        setUserMap(map);
      }
    } catch (err: any) {
      toast.error(`加载失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase, statusFilter, page]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleApprove = async (profile: WholesalerProfile) => {
    try {
      await adminUpdate(supabase, 'wholesaler_profiles', {
        status: 'approved',
        approved_at: new Date().toISOString(),
        reject_reason: null,
        updated_at: new Date().toISOString(),
      }, [{ col: 'id', op: 'eq', val: profile.id }]);
      toast.success('已通过审核');
      fetchProfiles();
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    try {
      await adminUpdate(supabase, 'wholesaler_profiles', {
        status: 'rejected',
        approved_at: null,
        reject_reason: rejectReason || '未通过审核',
        updated_at: new Date().toISOString(),
      }, [{ col: 'id', op: 'eq', val: rejectTarget.id }]);
      toast.success('已拒绝');
      setRejectModalOpen(false);
      setRejectTarget(null);
      setRejectReason('');
      fetchProfiles();
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    }
  };

  const openRejectModal = (profile: WholesalerProfile) => {
    setRejectTarget(profile);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const getUserDisplay = (userId: string) => {
    const user = userMap[userId];
    if (!user) return userId.slice(0, 8) + '...';
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
    return name || user.telegram_username || user.phone || userId.slice(0, 8);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">批发商管理</h1>
          <p className="text-sm text-gray-500 mt-1">审核和管理批发商认证申请</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">状态筛选:</span>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="border rounded px-3 py-1.5 text-sm"
          >
            <option value="all">全部</option>
            <option value="pending">待审核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已拒绝</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-yellow-700">{statusFilter === 'pending' ? totalCount : '-'}</div>
          <div className="text-sm text-yellow-600">待审核</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{statusFilter === 'approved' ? totalCount : '-'}</div>
          <div className="text-sm text-green-600">已通过</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-700">{statusFilter === 'rejected' ? totalCount : '-'}</div>
          <div className="text-sm text-red-600">已拒绝</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-12 text-gray-500">暂无数据</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">用户</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">公司名称</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">联系电话</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">税务ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">申请时间</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {profiles.map((profile) => (
                <tr key={profile.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {getUserDisplay(profile.user_id)}
                    </div>
                    <div className="text-xs text-gray-400">{profile.user_id.slice(0, 12)}...</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {profile.company_name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {profile.contact_phone || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {profile.tax_id || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_MAP[profile.status]?.color || 'bg-gray-100 text-gray-800'}`}>
                      {STATUS_MAP[profile.status]?.label || profile.status}
                    </span>
                    {profile.reject_reason && (
                      <div className="text-xs text-red-500 mt-1">{profile.reject_reason}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(profile.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {profile.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(profile)}
                          className="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded"
                        >
                          通过
                        </button>
                        <button
                          onClick={() => openRejectModal(profile)}
                          className="px-3 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                        >
                          拒绝
                        </button>
                      </div>
                    )}
                    {profile.status === 'rejected' && (
                      <button
                        onClick={() => handleApprove(profile)}
                        className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
                      >
                        重新通过
                      </button>
                    )}
                    {profile.status === 'approved' && (
                      <span className="text-xs text-gray-400">已审核</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t flex items-center justify-between">
            <span className="text-sm text-gray-500">
              共 {totalCount} 条，第 {page + 1}/{totalPages} 页
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">拒绝原因</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full border rounded px-3 py-2 h-24 resize-none"
              placeholder="请输入拒绝原因（可选）"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setRejectModalOpen(false); setRejectTarget(null); }}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleRejectConfirm}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded"
              >
                确认拒绝
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
