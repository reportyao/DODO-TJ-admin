import React, { useState, useEffect } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { toast } from 'react-hot-toast';
import { sha256 } from '../utils/sha256';

interface AdminUser {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  role: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
}

const ROLES = [
  { value: 'super_admin', label: '超级管理员', color: 'red' },
  { value: 'admin', label: '管理员', color: 'blue' },
  { value: 'operator', label: '运营人员', color: 'green' },
  { value: 'finance', label: '财务人员', color: 'yellow' },
  { value: 'viewer', label: '只读用户', color: 'gray' }
];

const STATUS_OPTIONS = [
  { value: 'active', label: '正常', color: 'green' },
  { value: 'inactive', label: '停用', color: 'gray' },
  { value: 'suspended', label: '暂停', color: 'red' }
];

export default function AdminManagementPage() {
  const { supabase } = useSupabase();
  const { admin: currentAdmin } = useAdminAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    display_name: '',
    email: '',
    role: 'viewer',
    status: 'active'
  });

  useEffect(() => {
    loadAdmins();
  }, []);

  const loadAdmins = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {throw error;}
      setAdmins(data || []);
    } catch (error: any) {
      toast.error('加载管理员列表失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingAdmin(null);
    setFormData({
      username: '',
      password: '',
      display_name: '',
      email: '',
      role: 'viewer',
      status: 'active'
    });
    setShowModal(true);
  };

  const handleEdit = (admin: AdminUser) => {
    setEditingAdmin(admin);
    setFormData({
      username: admin.username,
      password: '',
      display_name: admin.display_name || '',
      email: admin.email || '',
      role: admin.role,
      status: admin.status
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingAdmin) {
        // 更新管理员
        const updateData: any = {
          display_name: formData.display_name || null,
          email: formData.email || null,
          role: formData.role,
          status: formData.status,
          updated_at: new Date().toISOString()
        };

        // 如果填写了新密码，则更新密码
        if (formData.password) {
          updateData.password_hash = sha256(formData.password);
        }

        const { error } = await supabase
          .from('admin_users')
          .update(updateData)
          .eq('id', editingAdmin.id);

        if (error) {throw error;}
        toast.success('管理员更新成功');
      } else {
        // 创建新管理员
        if (!formData.password) {
          toast.error('请输入密码');
          return;
        }

        // 生成密码哈希
        const passwordHash = sha256(formData.password);

        const { error } = await supabase
          .from('admin_users')
          .insert({
            username: formData.username,
            password_hash: passwordHash,
            display_name: formData.display_name || null,
            email: formData.email || null,
            role: formData.role,
            status: formData.status,
            created_by: currentAdmin?.id
          });

        if (error) {throw error;}
        toast.success('管理员创建成功');
      }

      setShowModal(false);
      loadAdmins();
    } catch (error: any) {
      toast.error(error.message || '操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    // 防止删除自己
    if (id === currentAdmin?.id) {
      toast.error('不能删除当前登录的管理员账号');
      return;
    }

    // 防止删除最后一个 super_admin
    const targetAdmin = admins.find(a => a.id === id);
    if (targetAdmin?.role === 'super_admin') {
      const superAdminCount = admins.filter(a => a.role === 'super_admin' && a.status === 'active').length;
      if (superAdminCount <= 1) {
        toast.error('系统必须保留至少一个活跃的超级管理员');
        return;
      }
    }

    if (!confirm(`确定要删除管理员“${targetAdmin?.username}”吗？此操作不可恢复。`)) {return;}

    try {
      const { error } = await supabase
        .from('admin_users')
        .delete()
        .eq('id', id);

      if (error) {throw error;}
      toast.success('管理员已删除');
      loadAdmins();
    } catch (error: any) {
      toast.error('删除失败: ' + error.message);
    }
  };

  const getRoleLabel = (role: string) => {
    return ROLES.find(r => r.value === role)?.label || role;
  };

  const getRoleColor = (role: string) => {
    return ROLES.find(r => r.value === role)?.color || 'gray';
  };

  const getStatusLabel = (status: string) => {
    return STATUS_OPTIONS.find(s => s.value === status)?.label || status;
  };

  const getStatusColor = (status: string) => {
    return STATUS_OPTIONS.find(s => s.value === status)?.color || 'gray';
  };

  if (loading) {
    return <div className="p-6">加载中...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">管理员管理</h1>
        <button
          onClick={handleCreate}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          + 创建管理员
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">用户名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">显示名称</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">角色</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">最后登录</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {(admins || []).map((admin) => (
              <tr key={admin.id}>
                <td className="px-6 py-4 whitespace-nowrap">{admin.username}</td>
                <td className="px-6 py-4 whitespace-nowrap">{admin.display_name || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${getRoleColor(admin.role) === 'red' ? 'bg-red-100 text-red-800' : getRoleColor(admin.role) === 'blue' ? 'bg-blue-100 text-blue-800' : getRoleColor(admin.role) === 'green' ? 'bg-green-100 text-green-800' : getRoleColor(admin.role) === 'yellow' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                    {getRoleLabel(admin.role)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(admin.status) === 'green' ? 'bg-green-100 text-green-800' : getStatusColor(admin.status) === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                    {getStatusLabel(admin.status)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {admin.last_login_at ? new Date(admin.last_login_at).toLocaleString('zh-CN') : '从未登录'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => handleEdit(admin)}
                    className="text-indigo-600 hover:text-indigo-900 mr-4"
                  >
                    编辑
                  </button>
                  {admin.id !== currentAdmin?.id && (
                    <button
                      onClick={() => handleDelete(admin.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 创建/编辑模态框 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingAdmin ? '编辑管理员' : '创建管理员'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">用户名</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                  disabled={!!editingAdmin}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  密码 {editingAdmin && '(留空则不修改)'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  required={!editingAdmin}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">显示名称</label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">邮箱</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">角色</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {ROLES.map(role => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {STATUS_OPTIONS.map(status => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
                >
                  {editingAdmin ? '更新' : '创建'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
