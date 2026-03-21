import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/EmptyState';
import toast from 'react-hot-toast';
import { Search, X } from 'lucide-react';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const from = (page - 1) * LIMIT;
      const to = from + LIMIT - 1;

      let query = supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      // 如果有搜索条件，按手机号、姓名、邀请码模糊搜索
      if (activeSearch.trim()) {
        // 安全处理：转义 PostgREST 过滤器中的特殊字符，防止过滤器注入
        const term = activeSearch.trim()
          .replace(/\\/g, '\\\\')  // 转义反斜杠
          .replace(/,/g, '\\,')     // 转义逗号（PostgREST OR 分隔符）
          .replace(/\(/g, '\\(')    // 转义括号
          .replace(/\)/g, '\\)');
        query = query.or(
          `phone_number.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,referral_code.eq.${term}`
        );
      }

      const { data, error } = await query.range(from, to);

      if (error) {throw error;}

      setUsers(data || []);
      setHasMore((data || []).length === LIMIT);
    } catch (error: any) {
      toast.error(`加载用户列表失败: ${error.message}`);
      console.error('Error loading users:', error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, page, activeSearch]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = () => {
    setPage(1); // 搜索时重置到第一页
    setActiveSearch(searchTerm);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setPage(1);
    setActiveSearch('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-2xl font-bold">用户管理</CardTitle>
      </CardHeader>
      <CardContent>
        {/* 搜索栏 */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="搜索手机号、姓名或邀请码..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyPress}
              className="pl-10 pr-10"
            />
            {searchTerm && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button onClick={handleSearch} variant="default">
            搜索
          </Button>
        </div>

        {activeSearch && (
          <div className="mb-3 text-sm text-gray-500">
            搜索: &quot;{activeSearch}&quot;
            <button onClick={handleClearSearch} className="ml-2 text-blue-500 hover:underline">
              清除
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-10">加载中...</div>
        ) : users.length === 0 ? (
          <EmptyState 
            title={activeSearch ? "未找到匹配用户" : "暂无用户"} 
            message={activeSearch ? `没有找到与 "${activeSearch}" 匹配的用户` : "当前没有用户数据"} 
          />
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
                    <TableCell>{user.display_name || user.first_name || '668265e0'}</TableCell>
                    <TableCell>
                      {user.first_name || user.last_name 
                        ? `${user.first_name || ''} ${user.last_name || ''}`.trim() 
                        : '暂无'}
                    </TableCell>
                    <TableCell>{user.level}</TableCell>
                    <TableCell>{user.commission_rate || 0}%</TableCell>
                    <TableCell>{user.status === 'ACTIVE' ? '正常' : user.status === 'BLOCKED' ? '已封禁' : user.status === 'INACTIVE' ? '未激活' : user.status}</TableCell>
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
