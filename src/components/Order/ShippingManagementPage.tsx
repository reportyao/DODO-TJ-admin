import React, { useEffect, useState, useCallback } from 'react';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Loader2, Truck, CheckCircle, Package, Search } from 'lucide-react';

interface Shipping {
  id: string;
  prize_id: string;
  user_id: string;
  status: string;
  tracking_number: string | null;
  shipping_company: string | null;
  shipping_method: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_address: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: '全部', color: '' },
  { value: 'PENDING', label: '待发货', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'PROCESSING', label: '处理中', color: 'bg-orange-100 text-orange-800' },
  { value: 'SHIPPED', label: '已发货', color: 'bg-blue-100 text-blue-800' },
  { value: 'IN_TRANSIT', label: '运输中', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'IN_TRANSIT_CHINA', label: '运输中（中国段）', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'IN_TRANSIT_TAJIKISTAN', label: '运输中（塔国段）', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'READY_FOR_PICKUP', label: '待提货', color: 'bg-teal-100 text-teal-800' },
  { value: 'DELIVERED', label: '已送达', color: 'bg-green-100 text-green-800' },
  { value: 'FAILED', label: '发货失败', color: 'bg-red-100 text-red-800' },
];

const getStatusBadge = (status: string) => {
  const opt = STATUS_OPTIONS.find(o => o.value === status);
  return opt ? (
    <span className={`px-2 py-1 text-[10px] font-bold rounded-full uppercase ${opt.color}`}>{opt.label}</span>
  ) : (
    <span className="px-2 py-1 text-[10px] font-bold rounded-full bg-gray-100 text-gray-800">{status}</span>
  );
};

const LIMIT = 20;

export const ShippingManagementPage: React.FC = () => {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();
  const [shippings, setShippings] = useState<Shipping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // 发货模态框状态
  const [shipModal, setShipModal] = useState<{ open: boolean; shippingId: string | null }>({ open: false, shippingId: null });
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shippingCompany, setShippingCompany] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchShippings = useCallback(async () => {
    setIsLoading(true);
    try {
      const from = (page - 1) * LIMIT;
      const to = from + LIMIT - 1;

      let query = supabase
        .from('shipping')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      setShippings(data || []);
      setTotalCount(count || 0);
      setHasMore((data || []).length === LIMIT);
    } catch (error: any) {
      toast.error(`加载发货列表失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, statusFilter, page]);

  useEffect(() => { fetchShippings(); }, [fetchShippings]);

  const openShipModal = (shippingId: string) => {
    setShipModal({ open: true, shippingId });
    setTrackingNumber('');
    setShippingCompany('');
    setAdminNotes('');
  };

  const handleShip = async () => {
    if (!shipModal.shippingId || !admin) return;
    if (!trackingNumber.trim()) {
      toast.error('请输入快递单号');
      return;
    }
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-shipping', {
        body: {
          shippingId: shipModal.shippingId,
          status: 'SHIPPED',
          trackingNumber: trackingNumber.trim(),
          shippingCompany: shippingCompany.trim(),
          adminNotes: adminNotes.trim(),
        },
        headers: { 'x-admin-id': admin.id }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || '发货失败');

      toast.success('发货成功！');
      setShipModal({ open: false, shippingId: null });
      fetchShippings();
    } catch (error: any) {
      toast.error(`发货失败: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeliver = async (shippingId: string) => {
    if (!admin) return;
    if (!window.confirm('确定要将此订单标记为已送达吗？')) return;

    try {
      const { data, error } = await supabase.functions.invoke('admin-update-shipping', {
        body: { shippingId, status: 'DELIVERED' },
        headers: { 'x-admin-id': admin.id }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || '标记失败');

      toast.success('已标记为已送达！');
      fetchShippings();
    } catch (error: any) {
      toast.error(`标记失败: ${error.message}`);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">发货管理</CardTitle>
          <span className="text-sm text-gray-500">共 {totalCount} 条记录</span>
        </CardHeader>
        <CardContent>
          {/* 状态筛选 */}
          <div className="flex flex-wrap gap-2 mb-6">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setStatusFilter(opt.value); setPage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  statusFilter === opt.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
              <p className="text-gray-500">加载中...</p>
            </div>
          ) : shippings.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed rounded-xl">
              <Package className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">暂无{statusFilter !== 'ALL' ? `"${STATUS_OPTIONS.find(o => o.value === statusFilter)?.label}"` : ''}发货记录</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>发货 ID</TableHead>
                    <TableHead>收件人</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>快递信息</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shippings.map((shipping) => (
                    <TableRow key={shipping.id} className="hover:bg-gray-50">
                      <TableCell>
                        <div className="font-mono text-[10px] text-gray-400">#{shipping.id.substring(0, 8)}</div>
                        <div className="font-mono text-[10px] text-gray-300">奖品: {shipping.prize_id?.substring(0, 8)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{shipping.recipient_name || '-'}</div>
                        <div className="text-xs text-gray-500">{shipping.recipient_phone || '-'}</div>
                        <div className="text-xs text-gray-400 max-w-[160px] truncate" title={shipping.recipient_address || ''}>
                          {shipping.recipient_address || '-'}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(shipping.status)}</TableCell>
                      <TableCell>
                        {shipping.tracking_number ? (
                          <div>
                            <div className="text-sm font-mono font-medium">{shipping.tracking_number}</div>
                            <div className="text-xs text-gray-500">{shipping.shipping_company || '-'}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">未填写</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">{formatDateTime(shipping.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {(shipping.status === 'PENDING' || shipping.status === 'PROCESSING') && (
                            <Button size="sm" onClick={() => openShipModal(shipping.id)} className="bg-blue-600 hover:bg-blue-700">
                              <Truck className="h-3 w-3 mr-1" />
                              发货
                            </Button>
                          )}
                          {shipping.status === 'SHIPPED' || shipping.status === 'IN_TRANSIT' ? (
                            <Button size="sm" variant="outline" onClick={() => handleDeliver(shipping.id)} className="border-green-300 text-green-700 hover:bg-green-50">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              已送达
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* 分页 */}
              <div className="flex justify-between items-center mt-4">
                <span className="text-xs text-gray-500">第 {page} 页</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>上一页</Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>下一页</Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 发货模态框 */}
      {shipModal.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-600" />
              填写发货信息
            </h2>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">快递单号 <span className="text-red-500">*</span></Label>
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="请输入快递单号"
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-sm font-medium">快递公司</Label>
                <Input
                  value={shippingCompany}
                  onChange={(e) => setShippingCompany(e.target.value)}
                  placeholder="如：顺丰、圆通、EMS..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">备注</Label>
                <Input
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="可选备注信息"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShipModal({ open: false, shippingId: null })}
                disabled={isSubmitting}
              >
                取消
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={handleShip}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Truck className="h-4 w-4 mr-2" />}
                确认发货
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
