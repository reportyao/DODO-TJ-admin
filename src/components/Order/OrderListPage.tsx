import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Tables, Enums } from '@/types/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Search, Filter, Loader2, ExternalLink } from 'lucide-react';

type Order = Tables<'full_purchase_orders'>;
type OrderStatus = Enums<'OrderStatus'>;

interface OrderWithDetails extends Order {
  user?: {
    id: string;
    display_name: string;
    phone_number: string;
  };
  lottery?: {
    title_i18n: any;
  };
}

const LIMIT = 20;

const getStatusColor = (status: OrderStatus) => {
  switch (status) {
    case 'PENDING': return 'bg-yellow-100 text-yellow-800';
    case 'PAID': return 'bg-green-100 text-green-800';
    case 'SHIPPED': return 'bg-blue-100 text-blue-800';
    case 'DELIVERED': return 'bg-purple-100 text-purple-800';
    case 'CANCELLED': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: '全部' },
  { value: 'PENDING', label: '待支付' },
  { value: 'PAID', label: '已支付' },
  { value: 'SHIPPED', label: '已发货' },
  { value: 'DELIVERED', label: '已送达' },
  { value: 'CANCELLED', label: '已取消' },
];

export const OrderListPage: React.FC = () => {
  const { supabase } = useSupabase();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const from = (page - 1) * LIMIT;
      const to = from + LIMIT - 1;

      let query = supabase
        .from('full_purchase_orders')
        .select(`
          *,
          user:users(id, display_name, phone_number),
          lottery:lotteries(title_i18n)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }

      if (searchQuery.trim()) {
        // 尝试按订单 ID 或用户手机号搜索
        if (searchQuery.length > 20) { // 可能是 UUID
          query = query.eq('id', searchQuery.trim());
        } else {
          // 手机号搜索需要通过用户表关联，Supabase 这种关联搜索比较复杂
          // 这里简单处理，如果不是 UUID 则按 ID 前缀匹配（如果支持）
          // 或者先查用户 ID 再查订单
          const { data: users } = await supabase
            .from('users')
            .select('id')
            .ilike('phone_number', `%${searchQuery.trim()}%`);
          
          if (users && users.length > 0) {
            query = query.in('user_id', users.map(u => u.id));
          } else {
            // 如果没查到用户，尝试匹配订单 ID 前缀
            query = query.ilike('id', `${searchQuery.trim()}%`);
          }
        }
      }

      const { data, error, count } = await query;

      if (error) throw error;

      setOrders(data || []);
      setTotalCount(count || 0);
      setHasMore((data || []).length === LIMIT);
    } catch (error: any) {
      toast.error(`加载订单列表失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, page, statusFilter, searchQuery]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOrders();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">订单管理</CardTitle>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/shipping')}>
              物流管理
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* 筛选与搜索 */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索订单 ID 或用户手机号..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setStatusFilter(opt.value); setPage(1); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition-colors ${
                    statusFilter === opt.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
              <p className="text-gray-500">加载订单中...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed rounded-xl">
              <p className="text-gray-500">未找到匹配的订单</p>
              {(statusFilter !== 'ALL' || searchQuery) && (
                <Button variant="link" onClick={() => { setStatusFilter('ALL'); setSearchQuery(''); setPage(1); }}>
                  清除所有筛选
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>订单信息</TableHead>
                    <TableHead>商品</TableHead>
                    <TableHead>用户信息</TableHead>
                    <TableHead>金额</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id} className="hover:bg-gray-50 transition-colors">
                      <TableCell>
                        <div className="font-mono text-[10px] text-gray-400 mb-1">#{order.id.substring(0, 8)}</div>
                        <div className="text-xs font-medium">全款购买订单</div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[180px] truncate text-sm font-medium" title={order.lottery?.title_i18n?.zh || '-'}>
                          {order.lottery?.title_i18n?.zh || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{order.user?.display_name || '-'}</div>
                        <div className="text-xs text-gray-500">{order.user?.phone_number || '-'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-blue-700">{order.total_amount} {order.currency}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 text-[10px] font-bold rounded-full uppercase ${getStatusColor(order.status as OrderStatus)}`}>
                          {STATUS_OPTIONS.find(o => o.value === order.status)?.label || order.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {formatDateTime(order.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/orders/${order.id}`)} className="h-8 w-8 p-0">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* 分页 */}
              <div className="flex justify-between items-center mt-6">
                <p className="text-xs text-gray-500">共 {totalCount} 个订单</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    上一页
                  </Button>
                  <div className="flex items-center px-4 text-xs font-medium">
                    第 {page} 页
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>
                    下一页
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
