import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { Tables, Enums } from '@/types/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { OrderService } from '@/services/OrderService';
import { ArrowLeftIcon } from 'lucide-react';

// 假设 OrderService.getOrderDetails 返回的类型
type OrderDetails = Tables<'orders'> & {
  user: Tables<'profiles'> | null;
  lottery: Tables<'lotteries'> | null;
  shipping_address?: string;
};

const getStatusColor = (status: Enums<'OrderStatus'>) => {
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

export const OrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!id) {return;}
    setIsLoading(true);
    try {
      const data = await OrderService.getOrderDetails(id);
      setOrder(data as OrderDetails);
      if (data?.tracking_number) {
        setTrackingNumber(data.tracking_number);
      }
    } catch (error) {
      toast.error(`加载订单详情失败: ${(error as Error).message}`);
      console.error('Error loading order:', error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleUpdateTrackingNumber = async () => {
    if (!id || !order) {return;}
    setIsUpdating(true);
    try {
      await OrderService.updateOrderStatus(id, order.status, trackingNumber);
      toast.success('物流信息更新成功!');
      // 刷新订单数据
      await fetchOrder();
    } catch (error) {
      toast.error(`更新失败: ${(error as Error).message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-10">加载中...</div>;
  }

  if (!order) {
    return <div className="text-center py-10 text-red-500">订单未找到</div>;
  }

  // 假设收货地址字段为 shipping_address
  const shippingAddress = order.shipping_address || '未设置收货地址';

  return (
    <Card className="w-full max-w-5xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeftIcon className="w-4 h-4" />
          </Button>
          <CardTitle>订单详情: {order.id.substring(0, 8)}...</CardTitle>
        </div>
        <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(order.status)}`}>
          {order.status}
        </span>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 订单基本信息 */}
        <div className="grid grid-cols-2 gap-4 border-b pb-4">
          <div className="space-y-2">
            <Label>订单金额</Label>
            <Input value={`${order.total_amount} ${order.currency}`} readOnly />
          </div>
          <div className="space-y-2">
            <Label>创建时间</Label>
            <Input value={formatDateTime(order.created_at)} readOnly />
          </div>
          <div className="space-y-2">
            <Label>用户 ID</Label>
            <Input value={order.user_id} readOnly />
          </div>
          <div className="space-y-2">
            <Label>用户名</Label>
            <Input value={order.user?.phone_number || order.user?.username || order.user?.first_name || 'N/A'} readOnly />
          </div>
        </div>

        {/* 关联积分商城信息 */}
        <div className="border-b pb-4">
          <h3 className="text-xl font-semibold mb-4">关联积分商城/商品</h3>
          <div className="flex items-center space-x-4">
            {order.lottery?.image_url && (
              <img src={order.lottery.image_url} alt="Lottery Image" className="w-20 h-20 object-cover rounded-lg" />
            )}
            <div>
              <p className="font-medium">{order.lottery?.title || 'N/A'}</p>
              <p className="text-sm text-gray-500">期号: {order.lottery?.period || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* 收货地址信息 */}
        <div className="border-b pb-4">
          <h3 className="text-xl font-semibold mb-4">收货地址</h3>
          <Textarea value={shippingAddress} readOnly rows={4} />
        </div>

        {/* 物流信息设置 */}
        <div>
          <h3 className="text-xl font-semibold mb-4">物流信息设置</h3>
          <div className="flex space-x-4 items-end">
            <div className="space-y-2 flex-1">
              <Label htmlFor="tracking_number">物流单号/信息</Label>
              <Input
                id="tracking_number"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="请输入物流单号或信息"
              />
            </div>
            <Button onClick={handleUpdateTrackingNumber} disabled={isUpdating}>
              {isUpdating ? '保存中...' : '保存物流信息'}
            </Button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            当前状态: {order.status}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
