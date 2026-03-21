import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { OrderService, FullPurchaseOrderDetails } from '@/services/OrderService';
import { ArrowLeftIcon, Loader2, RefreshCw, Truck, Package, CheckCircle, XCircle } from 'lucide-react';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING:   { label: '待支付',   color: 'bg-yellow-100 text-yellow-800' },
  PAID:      { label: '已支付',   color: 'bg-green-100 text-green-800' },
  SHIPPED:   { label: '已发货',   color: 'bg-blue-100 text-blue-800' },
  DELIVERED: { label: '已送达',   color: 'bg-purple-100 text-purple-800' },
  CANCELLED: { label: '已取消',   color: 'bg-red-100 text-red-800' },
};

const LOGISTICS_LABELS: Record<string, string> = {
  PENDING_SHIPMENT: '待发货',
  IN_TRANSIT:       '运输中',
  ARRIVED:          '已到达',
  PICKED_UP:        '已取货',
};

const PICKUP_STATUS_LABELS: Record<string, string> = {
  PENDING_CLAIM: '待核销',
  PICKED_UP:     '已核销',
  EXPIRED:       '已过期',
};

export const OrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<FullPurchaseOrderDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [trackingInfo, setTrackingInfo] = useState('');
  const [isSavingTracking, setIsSavingTracking] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await OrderService.getOrderDetails(id);
      setOrder(data);
      if (data?.metadata?.tracking_info) {
        setTrackingInfo(data.metadata.tracking_info);
      }
    } catch (error: any) {
      toast.error(`加载订单详情失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const handleSaveTracking = async () => {
    if (!id || !order) return;
    if (!trackingInfo.trim()) {
      toast.error('请输入物流信息');
      return;
    }
    setIsSavingTracking(true);
    try {
      await OrderService.updateTrackingInfo(id, trackingInfo.trim());
      toast.success('物流信息已保存');
      await fetchOrder();
    } catch (error: any) {
      toast.error(`保存失败: ${error.message}`);
    } finally {
      setIsSavingTracking(false);
    }
  };

  const handleStatusChange = async (newStatus: string, newLogisticsStatus?: string) => {
    if (!id || !order) return;
    setIsUpdatingStatus(true);
    try {
      await OrderService.updateOrderStatus(id, newStatus, {
        logistics_status: newLogisticsStatus
      });
      toast.success(`订单状态已更新为：${STATUS_LABELS[newStatus]?.label || newStatus}`);
      setShowCancelConfirm(false);
      await fetchOrder();
    } catch (error: any) {
      toast.error(`状态更新失败: ${error.message}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
        <p className="text-gray-500">加载订单详情...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <XCircle className="h-12 w-12 text-red-400 mb-2" />
        <p className="text-red-500 font-medium">订单未找到</p>
        <Button variant="link" onClick={() => navigate('/orders')}>返回订单列表</Button>
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-800' };
  const lotteryTitle = order.lottery?.title_i18n?.zh || order.lottery?.title_i18n?.en || '未知商品';
  const lotteryImage = order.lottery?.image_urls?.[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Button variant="outline" size="icon" onClick={() => navigate('/orders')}>
            <ArrowLeftIcon className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">订单详情</h1>
            <p className="text-xs text-gray-500 font-mono">#{order.order_number}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 text-sm font-semibold rounded-full ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          <Button variant="ghost" size="icon" onClick={fetchOrder} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* 商品信息 */}
      <Card>
        <CardHeader><CardTitle className="text-base">商品信息</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {lotteryImage ? (
              <img src={lotteryImage} alt={lotteryTitle} className="w-20 h-20 object-cover rounded-lg border" />
            ) : (
              <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center">
                <Package className="h-8 w-8 text-gray-400" />
              </div>
            )}
            <div className="flex-1">
              <p className="font-semibold text-lg">{lotteryTitle}</p>
              <p className="text-sm text-gray-500">期号：{order.lottery?.period || '-'}</p>
              <p className="text-sm text-gray-500">商品 ID：<span className="font-mono text-xs">{order.lottery_id?.substring(0, 12)}...</span></p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-blue-700">{order.total_amount}</p>
              <p className="text-sm text-gray-500">{order.currency}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 用户信息 */}
      <Card>
        <CardHeader><CardTitle className="text-base">用户信息</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-500">用户名</Label>
              <p className="font-medium">{order.user?.display_name || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">手机号</Label>
              <p className="font-medium">{order.user?.phone_number || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">用户 ID</Label>
              <p className="font-mono text-xs text-gray-500">{order.user_id}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">下单时间</Label>
              <p className="font-medium">{formatDateTime(order.created_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 物流与提货信息 */}
      <Card>
        <CardHeader><CardTitle className="text-base">物流与提货信息</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-gray-500">物流状态</Label>
              <p className="font-medium">{LOGISTICS_LABELS[order.logistics_status] || order.logistics_status}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">提货码</Label>
              <p className="font-mono font-bold text-blue-700">{order.pickup_code || '未生成'}</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">核销状态</Label>
              <p className="font-medium">{PICKUP_STATUS_LABELS[order.pickup_status || ''] || order.pickup_status || '-'}</p>
            </div>
            {order.pickup_point && (
              <div className="col-span-2">
                <Label className="text-xs text-gray-500">自提点</Label>
                <p className="font-medium">{order.pickup_point.name}</p>
                <p className="text-xs text-gray-500">{order.pickup_point.address}</p>
              </div>
            )}
            {order.expires_at && (
              <div>
                <Label className="text-xs text-gray-500">提货截止</Label>
                <p className={`font-medium ${new Date(order.expires_at) < new Date() ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatDateTime(order.expires_at)}
                </p>
              </div>
            )}
          </div>

          {/* 物流单号/信息 */}
          <div className="border-t pt-4">
            <Label className="text-sm font-medium mb-2 block">物流单号/备注</Label>
            <div className="flex gap-2">
              <Input
                value={trackingInfo}
                onChange={(e) => setTrackingInfo(e.target.value)}
                placeholder="输入物流单号或备注信息..."
                className="flex-1"
              />
              <Button onClick={handleSaveTracking} disabled={isSavingTracking}>
                {isSavingTracking ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存'}
              </Button>
            </div>
            {order.metadata?.tracking_info && (
              <p className="text-xs text-gray-500 mt-1">当前：{order.metadata.tracking_info}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 状态操作 */}
      {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && (
        <Card>
          <CardHeader><CardTitle className="text-base">状态操作</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {order.status === 'PENDING' && (
                <Button
                  variant="default"
                  onClick={() => handleStatusChange('PAID')}
                  disabled={isUpdatingStatus}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  标记为已支付
                </Button>
              )}
              {order.status === 'PAID' && (
                <Button
                  variant="default"
                  onClick={() => handleStatusChange('SHIPPED', 'IN_TRANSIT')}
                  disabled={isUpdatingStatus}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Truck className="h-4 w-4 mr-2" />
                  标记为已发货
                </Button>
              )}
              {order.status === 'SHIPPED' && (
                <Button
                  variant="default"
                  onClick={() => handleStatusChange('DELIVERED', 'ARRIVED')}
                  disabled={isUpdatingStatus}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  标记为已送达
                </Button>
              )}
              {(order.status === 'PENDING' || order.status === 'PAID') && !showCancelConfirm && (
                <Button
                  variant="outline"
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={isUpdatingStatus}
                  className="border-red-300 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  取消订单
                </Button>
              )}
              {showCancelConfirm && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                  <span className="text-sm text-red-700 font-medium">确认取消此订单？</span>
                  <Button size="sm" variant="destructive" onClick={() => handleStatusChange('CANCELLED')} disabled={isUpdatingStatus}>
                    {isUpdatingStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : '确认取消'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCancelConfirm(false)}>不取消</Button>
                </div>
              )}
            </div>
            {isUpdatingStatus && (
              <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> 正在更新状态...
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 元数据 */}
      {order.metadata && Object.keys(order.metadata).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base text-gray-500">附加信息</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs text-gray-600 bg-gray-50 rounded p-3 overflow-auto max-h-40">
              {JSON.stringify(order.metadata, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
