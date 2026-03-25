import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Package, 
  Truck, 
  Search,
  RefreshCw,
  ArrowLeft,
  CheckSquare,
  Square
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDateTime } from '@/lib/utils';

interface PendingOrder {
  id: string;
  order_type: 'FULL_PURCHASE' | 'LOTTERY_PRIZE' | 'GROUP_BUY';
  order_number?: string;
  product_name: string;
  product_name_i18n: Record<string, string>;
  product_image?: string;
  product_sku?: string;
  user_id: string;
  user_name?: string;
  user_phone_number?: string;
  created_at: string;
  amount?: number;
}

interface ShipmentBatch {
  id: string;
  batch_no: string;
  status: string;
  total_orders: number;
  shipped_at: string;
}

export default function OrderShipmentPage() {
  const { supabase } = useSupabase();
  const { admin: adminUser } = useAdminAuth();
  const navigate = useNavigate();

  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [activeBatches, setActiveBatches] = useState<ShipmentBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  
  // 加入批次弹窗
  const [showAddToBatchModal, setShowAddToBatchModal] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [sendNotification, setSendNotification] = useState(true);
  const [adding, setAdding] = useState(false);

  const fetchPendingOrders = useCallback(async () => {
    try {
      setLoading(true);
      
      // 获取待发货的全款购买订单
      const { data: fullPurchaseOrders, error: fpError } = await supabase
        .from('full_purchase_orders')
        .select(`
          id,
          order_number,
          user_id,
          total_amount,
          metadata,
          created_at,
          lottery_id,
          lotteries:lottery_id (
            title,
            title_i18n,
            image_url,
            inventory_product_id
          ),
          users:user_id (
            first_name,
            phone_number
          )
        `)
        .or('logistics_status.is.null,logistics_status.eq.PENDING_SHIPMENT')
        .is('batch_id', null)
        .eq('status', 'COMPLETED')
        .order('created_at', { ascending: false });

      if (fpError) {
        console.error('Error fetching full purchase orders:', fpError);
      }

      // 获取待发货的一元购物中奖订单
      const { data: prizeOrders, error: prizeError } = await supabase
        .from('prizes')
        .select(`
          id,
          user_id,
          lottery_id,
          prize_name,
          prize_value,
          winning_code,
          created_at,
          lotteries:lottery_id (
            title,
            title_i18n,
            image_url,
            inventory_product_id
          ),
          users:user_id (
            first_name,
            phone_number
          )
        `)
        .or('logistics_status.is.null,logistics_status.eq.PENDING_SHIPMENT')
        .is('batch_id', null)
        .eq('status', 'CLAIMED')
        .order('created_at', { ascending: false });

      if (prizeError) {
        console.error('Error fetching prize orders:', prizeError);
      }

      // 获取待发货的拼团中奖订单
      const { data: groupBuyOrders, error: gbError } = await supabase
        .from('group_buy_results')
        .select(`
          id,
          winner_id,
          product_id,
          session_id,
          created_at,
          logistics_status,
          batch_id,
          group_buy_products:group_buy_products!group_buy_results_product_id_fkey (
            name,
            name_i18n,
            description_i18n,
            image_urls,
            original_price
          )
        `)
        .or('logistics_status.is.null,logistics_status.eq.PENDING_SHIPMENT')
        .is('batch_id', null)
        .order('created_at', { ascending: false });

      if (gbError) {
        console.error('Error fetching group buy orders:', gbError);
      }

      // 合并订单
      const orders: PendingOrder[] = [];

      // 处理全款购买订单
      if (fullPurchaseOrders) {
        for (const order of fullPurchaseOrders) {
          const lottery = order.lotteries as any;
          const user = order.users as any;
          orders.push({
            id: order.id,
            order_type: 'FULL_PURCHASE',
            order_number: order.order_number,
            product_name: lottery?.title || order.metadata?.product_title || '未知商品',
            product_name_i18n: lottery?.title_i18n || {},
            product_image: lottery?.image_url || order.metadata?.product_image,
            product_sku: lottery?.inventory_product_id,
            user_id: order.user_id,
            user_name: user?.first_name || user?.phone_number || '未知用户',
            user_phone_number: user?.phone_number,
            created_at: order.created_at,
            amount: order.total_amount,
          });
        }
      }

      // 处理一元购物中奖订单
      if (prizeOrders) {
        for (const prize of prizeOrders) {
          const lottery = prize.lotteries as any;
          const user = prize.users as any;
          orders.push({
            id: prize.id,
            order_type: 'LOTTERY_PRIZE',
            order_number: prize.winning_code,
            product_name: lottery?.title || prize.prize_name || '未知商品',
            product_name_i18n: lottery?.title_i18n || {},
            product_image: lottery?.image_url,
            product_sku: lottery?.inventory_product_id,
            user_id: prize.user_id,
            user_name: user?.first_name || user?.phone_number || '未知用户',
            user_phone_number: user?.phone_number,
            created_at: prize.created_at,
            amount: prize.prize_value,
          });
        }
      }

      // 处理拼团中奖订单
      if (groupBuyOrders) {
        // 获取所有中奖用户的信息
        const winnerIds = groupBuyOrders.map(o => o.winner_id).filter(Boolean);
        const { data: winners } = await supabase
          .from('users')
          .select('id, first_name, phone_number')
          .in('id', winnerIds);
        
        const winnersMap = new Map((winners || []).map(u => [u.id, u]));
        
        for (const order of groupBuyOrders) {
          const product = order.group_buy_products as any;
          const user = winnersMap.get(order.winner_id);
          
          let productName = '未知商品';
          let productNameI18n: Record<string, string> = {};
          
          if (product?.name_i18n) {
            productNameI18n = product.name_i18n;
            productName = product.name_i18n.zh || product.name_i18n.ru || product.name || '未知商品';
          } else if (product?.name) {
            productName = product.name;
          }
          
          orders.push({
            id: order.id,
            order_type: 'GROUP_BUY',
            order_number: order.session_id,
            product_name: productName,
            product_name_i18n: productNameI18n,
            product_image: product?.image_urls?.[0],
            product_sku: order.product_id,
            user_id: order.winner_id,
            user_name: user?.first_name || user?.phone_number || '未知用户',
            user_phone_number: user?.phone_number,
            created_at: order.created_at,
            amount: product?.original_price,
          });
        }
      }

      // 按创建时间排序
      orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      setPendingOrders(orders);
    } catch (error) {
      console.error('Failed to fetch pending orders:', error);
      toast.error('获取待发货订单失败');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const fetchActiveBatches = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('shipment_batches')
        .select('id, batch_no, status, total_orders, shipped_at')
        .in('status', ['IN_TRANSIT_CHINA', 'ARRIVED'])
        .order('created_at', { ascending: false });

      if (error) {throw error;}
      setActiveBatches(data || []);
    } catch (error) {
      console.error('Failed to fetch active batches:', error);
    }
  }, [supabase]);

  useEffect(() => {
    fetchPendingOrders();
    fetchActiveBatches();
  }, [fetchPendingOrders, fetchActiveBatches]);

  const filteredOrders = pendingOrders.filter(order => {
    // 订单类型筛选
    if (orderTypeFilter !== 'all' && order.order_type !== orderTypeFilter) {
      return false;
    }
    // 搜索筛选
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        order.product_name.toLowerCase().includes(searchLower) ||
        order.user_name?.toLowerCase().includes(searchLower) ||
        order.order_number?.toLowerCase().includes(searchLower) ||
        order.product_sku?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const handleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filteredOrders.map(o => `${o.order_type}:${o.id}`)));
    }
  };

  const handleSelectOrder = (order: PendingOrder) => {
    const key = `${order.order_type}:${order.id}`;
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedOrders(newSelected);
  };

  const handleAddToBatch = async () => {
    if (!selectedBatchId || selectedOrders.size === 0 || !adminUser?.id) {
      toast.error('请选择批次和订单');
      return;
    }

    const MAX_RETRIES = 3;
    const isNetworkError = (err: any) =>
      err?.name === 'FunctionsFetchError' ||
      err?.message?.includes('ERR_NETWORK') ||
      err?.message?.includes('Failed to send a request') ||
      err?.message?.includes('NetworkError') ||
      err?.message?.includes('fetch');

    try {
      setAdding(true);

      const orders = Array.from(selectedOrders).map(key => {
        const [order_type, order_id] = key.split(':');
        return { order_type, order_id };
      });

      let lastError: any = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 1) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            toast.loading(`网络不稳定，正在重试 (${attempt}/${MAX_RETRIES})...`, { id: 'retry-toast' });
          }

          const { data, error } = await supabase.functions.invoke('add-orders-to-batch', {
            body: {
              batch_id: selectedBatchId,
              orders,
              admin_id: adminUser.id,
              send_notification: sendNotification,
            },
          });

          if (error) {
            if (isNetworkError(error) && attempt < MAX_RETRIES) {
              lastError = error;
              continue;
            }
            throw error;
          }
          if (!data.success) {throw new Error(data.error);}

          toast.dismiss('retry-toast');
          toast.success(data.message || '订单已加入批次');
          setShowAddToBatchModal(false);
          setSelectedOrders(new Set());
          setSelectedBatchId('');
          fetchPendingOrders();
          fetchActiveBatches();
          return;
        } catch (err: any) {
          if (isNetworkError(err) && attempt < MAX_RETRIES) {
            lastError = err;
            continue;
          }
          throw err;
        }
      }
      throw lastError || new Error('网络请求失败，请检查网络连接后重试');
    } catch (error: any) {
      toast.dismiss('retry-toast');
      console.error('Failed to add orders to batch:', error);
      const isNet = error?.name === 'FunctionsFetchError' ||
        error?.message?.includes('ERR_NETWORK') ||
        error?.message?.includes('Failed to send a request');
      toast.error(isNet ? '网络连接失败，请检查网络后重试' : (error.message || '加入批次失败'));
    } finally {
      setAdding(false);
    }
  };

  const getOrderTypeBadge = (type: string) => {
    switch (type) {
      case 'FULL_PURCHASE':
        return <Badge className="bg-purple-100 text-purple-800">全款购买</Badge>;
      case 'LOTTERY_PRIZE':
        return <Badge className="bg-yellow-100 text-yellow-800">一元购物</Badge>;
      case 'GROUP_BUY':
        return <Badge className="bg-blue-100 text-blue-800">拼团</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/shipment-batches')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回批次管理
          </Button>
          <div>
            <h1 className="text-2xl font-bold">订单发货</h1>
            <p className="text-gray-500 mt-1">选择订单加入发货批次</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={selectedOrders.size === 0}
            onClick={() => setShowAddToBatchModal(true)}
          >
            <Truck className="w-4 h-4 mr-2" />
            加入批次 ({selectedOrders.size})
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{pendingOrders.length}</div>
            <div className="text-gray-500 text-sm">待发货订单</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {pendingOrders.filter(o => o.order_type === 'FULL_PURCHASE').length}
            </div>
            <div className="text-gray-500 text-sm">全款购买</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {pendingOrders.filter(o => o.order_type === 'LOTTERY_PRIZE').length}
            </div>
            <div className="text-gray-500 text-sm">一元购物</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {pendingOrders.filter(o => o.order_type === 'GROUP_BUY').length}
            </div>
            <div className="text-gray-500 text-sm">拼团</div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选和搜索 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="搜索商品名称、用户、订单号..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="筛选订单类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="FULL_PURCHASE">全款购买</SelectItem>
                <SelectItem value="LOTTERY_PRIZE">一元购物</SelectItem>
                <SelectItem value="GROUP_BUY">拼团</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchPendingOrders}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 订单列表 */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-center py-10">加载中...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              暂无待发货订单
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAll}
                    >
                      {selectedOrders.size === filteredOrders.length ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </Button>
                  </TableHead>
                  <TableHead>商品</TableHead>
                  <TableHead>订单类型</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>创建时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => {
                  const key = `${order.order_type}:${order.id}`;
                  const isSelected = selectedOrders.has(key);
                  
                  return (
                    <TableRow 
                      key={key}
                      className={isSelected ? 'bg-blue-50' : ''}
                      onClick={() => handleSelectOrder(order)}
                      style={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleSelectOrder(order)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {order.product_image && (
                            <img
                              src={order.product_image}
                              alt=""
                              className="w-12 h-12 rounded object-cover"
                            />
                          )}
                          <div>
                            <div className="font-medium">{order.product_name}</div>
                            {order.product_sku && (
                              <div className="text-xs text-gray-500">SKU: {order.product_sku}</div>
                            )}
                            {order.order_number && (
                              <div className="text-xs text-gray-500">订单号: {order.order_number}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getOrderTypeBadge(order.order_type)}</TableCell>
                      <TableCell>{order.user_name || '-'}</TableCell>
                      <TableCell>
                        {order.amount ? `TJS ${order.amount.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell>{formatDateTime(order.created_at)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 加入批次弹窗 */}
      <Dialog open={showAddToBatchModal} onOpenChange={setShowAddToBatchModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>加入发货批次</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>已选择 {selectedOrders.size} 个订单</Label>
            </div>
            <div>
              <Label>选择批次</Label>
              <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择批次" />
                </SelectTrigger>
                <SelectContent>
                  {activeBatches.length === 0 ? (
                    <SelectItem value="__placeholder__" disabled>
                      暂无可用批次，请先创建批次
                    </SelectItem>
                  ) : (
                    activeBatches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.batch_no} ({batch.total_orders} 个订单) {batch.status === 'ARRIVED' ? '✅ 已到达' : '🚚 运输中'}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {activeBatches.length === 0 && (
                <Button
                  variant="link"
                  className="mt-2 p-0"
                  onClick={() => navigate('/shipment-batches')}
                >
                  去创建批次
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="sendNotification"
                checked={sendNotification}
                onCheckedChange={(checked) => setSendNotification(checked as boolean)}
              />
              <Label htmlFor="sendNotification" className="cursor-pointer">
                发送发货通知给用户
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddToBatchModal(false)}>
              取消
            </Button>
            <Button 
              onClick={handleAddToBatch} 
              disabled={!selectedBatchId || adding}
            >
              {adding ? '添加中...' : '确认添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
