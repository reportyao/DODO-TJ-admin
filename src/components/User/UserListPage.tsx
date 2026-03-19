import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import toast from 'react-hot-toast';

const LIMIT = 50;

interface User {
  id: string;
  phone_number: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  level: number;
  commission_rate: number;
  status: string;
  created_at: string;
}

export const UserListPage = () => {
  const { supabase } = useSupabase();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const from = (page - 1) * LIMIT;
      const to = from + LIMIT - 1;

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {throw error;}

      setUsers(data || []);
      setHasMore((data || []).length === LIMIT);
    } catch (error: any) {
      toast.error(`加载用户列表失败: ${error.message}`);
      console.error('Error loading users:', error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-2xl font-bold">用户管理</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-10">加载中...</div>
        ) : users.length === 0 ? (
          <EmptyState title="暂无用户" message="当前没有用户数据" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>手机号</TableHead>
                  <TableHead>显示名</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead>等级</TableHead>
                  <TableHead>返利率(%)</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>注册时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.phone_number}</TableCell>
                    <TableCell>{user.display_name || user.first_name || 'N/A'}</TableCell>
                    <TableCell>
                      {user.first_name || user.last_name 
                        ? `${user.first_name || ''} ${user.last_name || ''}`.trim() 
                        : 'N/A'}
                    </TableCell>
                    <TableCell>{user.level}</TableCell>
                    <TableCell>{user.commission_rate || 0}%</TableCell>
                    <TableCell>{user.status}</TableCell>
                    <TableCell>{formatDateTime(user.created_at)}</TableCell>
                    <TableCell className="flex space-x-2">
                      <Button variant="outline" size="sm" onClick={() => navigate(`/users/${user.id}`)}>
                        详情
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/users/${user.id}/financial`)}>
                        财务
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-between items-center mt-4">
              <Button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                variant="outline"
              >
                上一页
              </Button>
              <span className="text-sm text-gray-600">
                第 {page} 页
              </span>
              <Button 
                onClick={() => setPage(p => p + 1)}
                disabled={!hasMore}
                variant="outline"
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
