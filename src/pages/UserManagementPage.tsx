import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/contexts/SupabaseContext';
import toast from 'react-hot-toast';

interface User {
  id: string;
  phone_number: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  level: number;
  vip_level: number | null;
  is_blocked: boolean;
  is_active: boolean;
  created_at: string;
  referral_code: string | null;
  referred_by_id: string | null;
  referral_count: number;
  total_spent: number | null;
  status: string | null;
}

const PAGE_SIZE = 50;

const UserManagementPage: React.FC = () => {
  const { supabase } = useSupabase();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBlocked, setFilterBlocked] = useState<'all' | 'active' | 'blocked'>('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [editingLevel, setEditingLevel] = useState<{ id: string; value: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('users')
        .select(
          'id, phone_number, display_name, first_name, last_name, level, vip_level, is_blocked, is_active, created_at, referral_code, referred_by_id, referral_count, total_spent, status',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (searchQuery.trim()) {
        query = query.or(
          `phone_number.ilike.%${searchQuery.trim()}%,display_name.ilike.%${searchQuery.trim()}%,first_name.ilike.%${searchQuery.trim()}%`
        );
      }
      if (filterBlocked === 'blocked') {
        query = query.eq('is_blocked', true);
      } else if (filterBlocked === 'active') {
        query = query.eq('is_blocked', false);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      setUsers(data || []);
      setTotalCount(count || 0);
    } catch (error: any) {
      toast.error(`加载用户失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase, currentPage, searchQuery, filterBlocked]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // 封禁/解封用户
  const handleToggleBlock = async (user: User) => {
    const action = user.is_blocked ? '解封' : '封禁';
    if (!window.confirm(`确定要${action}用户 ${user.display_name || user.phone_number || user.id} 吗？`)) return;
    setActionLoading(user.id);
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_blocked: !user.is_blocked, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      toast.success(`${action}成功`);
      fetchUsers();
    } catch (error: any) {
      toast.error(`${action}失败: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // 修改等级（带验证和确认）
  const handleLevelSave = async (userId: string) => {
    if (!editingLevel || editingLevel.id !== userId) return;
    const val = parseInt(editingLevel.value, 10);
    if (isNaN(val) || val < 0 || val > 100) {
      toast.error('等级必须在 0-100 之间');
      return;
    }
    const user = users.find((u) => u.id === userId);
    if (user && val === user.level) {
      setEditingLevel(null);
      return;
    }
    if (!window.confirm(`确定将该用户等级修改为 ${val} 吗？`)) return;
    setActionLoading(userId);
    try {
      const { error } = await supabase
        .from('users')
        .update({ level: val, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw error;
      toast.success('等级更新成功');
      setEditingLevel(null);
      fetchUsers();
    } catch (error: any) {
      toast.error(`更新失败: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const getUserDisplayName = (user: User) =>
    user.display_name || user.first_name || user.phone_number || user.id.slice(0, 8);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">用户管理</h1>
        <span className="text-sm text-gray-500">共 {totalCount} 名用户</span>
      </div>

      {/* 搜索与筛选 */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="搜索手机号 / 昵称 / 姓名"
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(0); }}
        />
        <select
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filterBlocked}
          onChange={(e) => { setFilterBlocked(e.target.value as any); setCurrentPage(0); }}
        >
          <option value="all">全部状态</option>
          <option value="active">正常</option>
          <option value="blocked">已封禁</option>
        </select>
        <button
          onClick={() => fetchUsers()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          刷新
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-400">加载中...</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">手机号</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">昵称</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">注册时间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">等级</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">邀请数</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">累计消费</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className={user.is_blocked ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-700">
                      {user.phone_number || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                      {getUserDisplayName(user)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {editingLevel?.id === user.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            className="w-16 px-2 py-1 border border-blue-400 rounded text-sm"
                            value={editingLevel.value}
                            onChange={(e) => setEditingLevel({ id: user.id, value: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleLevelSave(user.id); if (e.key === 'Escape') setEditingLevel(null); }}
                            autoFocus
                          />
                          <button
                            onClick={() => handleLevelSave(user.id)}
                            disabled={actionLoading === user.id}
                            className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                          >✓</button>
                          <button
                            onClick={() => setEditingLevel(null)}
                            className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
                          >✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingLevel({ id: user.id, value: String(user.level ?? 0) })}
                          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium"
                        >
                          Lv.{user.level ?? 0}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {user.referral_count ?? 0}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {user.total_spent != null ? `${Number(user.total_spent).toFixed(2)} TJS` : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.is_blocked
                          ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {user.is_blocked ? '已封禁' : '正常'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleBlock(user)}
                        disabled={actionLoading === user.id}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          user.is_blocked
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        } disabled:opacity-50`}
                      >
                        {actionLoading === user.id ? '处理中...' : user.is_blocked ? '解封' : '封禁'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && (
              <div className="text-center py-12 text-gray-400">暂无用户数据</div>
            )}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
              <span className="text-sm text-gray-500">
                第 {currentPage + 1} / {totalPages} 页，共 {totalCount} 条
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default UserManagementPage;
