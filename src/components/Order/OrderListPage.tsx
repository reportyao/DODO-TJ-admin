import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Tables, Enums } from '@/types/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';

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

const getStatusColor = (status: OrderStatus) => {
  switch (status) {
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800';
    case 'PAID':
      return 'bg-green-100 text-green-800';
    case 'SHIPPED':
      return 'bg-blue-100 text-blue-800';
    case 'DELIVERED':
      return 'bg-purple-100 text-purple-800';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const OrderListPage: React.FC = () => {
  const { supabase } = useSupabase();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      // 查询订单并关联用户和商品信息
      const { data, error } = await supabase
        .from('full_purchase_orders')
        .select(`
          *,
          user:users(id, display_name, phone_number),
          lottery:lotteries(title_i18n)
        `)
        .order('created_at', { ascending: false });

      if (error) {throw error;}

      setOrders(data || []);
    } catch (error: any) {
      toast.error(`加载订单列表失败: ${error.message}`);
      console.error('Error loading orders:', error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-2xl font-bold">订单管理</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-10">加载中...</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单 ID</TableHead>
                  <TableHead>商品标题</TableHead>
                  <TableHead>用户ID</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead>总金额</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium font-mono text-xs">
                      <div className="max-w-[200px] truncate" title={order.id}>
                        {order.id}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[150px] truncate" title={order.lottery?.title_i18n?.zh || '-'}>
                        {order.lottery?.title_i18n?.zh || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="max-w-[120px] truncate" title={order.user_id}>
                        {order.user_id}
                      </div>
                    </TableCell>
                    <TableCell>{order.user?.display_name || order.user?.phone_number || '-'}</TableCell>
                    <TableCell>{order.total_amount} {order.currency}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </TableCell>
                    <TableCell>{formatDateTime(order.created_at)}</TableCell>
                    <TableCell className="flex space-x-2">
                      <Button variant="outline" size="sm" onClick={() => navigate(`/orders/${order.id}`)}>
                        详情
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
