import React, { useState, useEffect } from 'react';
import { useSupabase } from '@/contexts/SupabaseContext';
import toast from 'react-hot-toast';

interface User {
  id: string;
  phone_number: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  level: number;

}

const UserManagementPage: React.FC = () => {
  const { supabase } = useSupabase();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('id, phone_number, display_name, first_name, last_name, level')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {throw error;}
      setUsers(data || []);
    } catch (error: any) {
      toast.error(`加载用户失败: ${error.message}`);
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLevelChange = async (userId: string, newLevel: number) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ level: newLevel })
        .eq('id', userId);

      if (error) {throw error;}
      toast.success('等级更新成功');
      fetchUsers();
    } catch (error: any) {
      toast.error(`更新失败: ${error.message}`);
    }
  };



  if (loading) {
    return <div className="p-6">加载中...</div>;
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-6">用户管理</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                手机号
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                显示名
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                姓名
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                等级
              </th>

            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {(users || []).map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {user.phone_number}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {user.display_name || user.first_name || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {user.first_name || user.last_name ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="number"
                    className="w-20 px-2 py-1 border border-gray-300 rounded"
                    defaultValue={user.level}
                    onBlur={(e) => { const val = parseInt(e.target.value, 10); if (!isNaN(val)) handleLevelChange(user.id, val); }}
                  />
                </td>

              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="text-center py-10 text-gray-500">
            暂无用户数据
          </div>
        )}
      </div>
    </div>
  );
};

export default UserManagementPage;
