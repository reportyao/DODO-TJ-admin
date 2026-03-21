import React, { useEffect, useState, useCallback } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { toast } from 'react-hot-toast';
import { Gift, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { FirstDepositBonusConfig } from './FirstDepositBonusConfig';
import { createAuditTimer } from '../../lib/auditLogger';

interface DepositRequest {
  id: string;
  user_id: string;
  order_number: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_proof_images: string[];
  payment_reference: string;
  payer_name: string;
  payer_account: string;
  status: string;
  created_at: string;
  user?: { phone_number: string | null; display_name: string | null };
}

const LIMIT = 20;

export const DepositReviewPage: React.FC = () => {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDeposit, setSelectedDeposit] = useState<DepositRequest | null>(null);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  // A05-1: 状态筛选（默认只显示待审批）
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  // A05-3: 分页
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  // A05-2: 拒绝原因弹窗
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [pendingRejectDeposit, setPendingRejectDeposit] = useState<DepositRequest | null>(null);
  // A05-4: 批准确认弹窗
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [pendingApproveDeposit, setPendingApproveDeposit] = useState<DepositRequest | null>(null);
  // 防重复提交
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const fetchDeposits = useCallback(async () => {
    try {
      setIsLoading(true);
      const from = (page - 1) * LIMIT;
      const to = from + LIMIT - 1;

      let query = supabase
        .from('deposit_requests')
        .select('*, user:users(phone_number, display_name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }

      const { data, error, count } = await query;

      if (error) { throw error; }
      setDeposits(data || []);
      setHasMore((data || []).length === LIMIT);
      if (count !== null) setTotalCount(count);
    } catch (error: any) {
      toast.error(`加载充值记录失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, page, statusFilter]);

  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits]);

  // 重置页码当筛选条件变化
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'APPROVED': return 'bg-green-100 text-green-800';
      case 'REJECTED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleViewImages = (deposit: DepositRequest) => {
    setSelectedDeposit(deposit);
    setIsImageDialogOpen(true);
  };

  // A05-4: 批准前弹窗确认
  const handleApproveClick = (deposit: DepositRequest) => {
    setPendingApproveDeposit(deposit);
    setIsApproveDialogOpen(true);
  };

  // A05-2: 拒绝前弹窗填写原因
  const handleRejectClick = (deposit: DepositRequest) => {
    setPendingRejectDeposit(deposit);
    setRejectReason('');
    setIsRejectDialogOpen(true);
  };

  const handleReview = async (depositRequest: DepositRequest, action: 'APPROVED' | 'REJECTED', adminNote?: string) => {
    if (!admin) { toast.error('请先登录'); return; }
    if (submittingId) { toast.error('请等待当前操作完成'); return; }

    setSubmittingId(depositRequest.id);

    const audit = createAuditTimer(supabase, {
      adminId: admin.id,
      action: action === 'APPROVED' ? 'APPROVE_DEPOSIT' : 'REJECT_DEPOSIT',
      targetType: 'deposit_request',
      targetId: depositRequest.id,
      details: {
        order_number: depositRequest.order_number,
        user_id: depositRequest.user_id,
        amount: depositRequest.amount,
        currency: depositRequest.currency,
        payment_method: depositRequest.payment_method,
        admin_note: adminNote || null,
      },
    });

    try {
      const { data: result, error: rpcError } = await supabase.rpc('approve_deposit_atomic', {
        p_request_id: depositRequest.id,
        p_action: action,
        p_admin_id: admin!.id,
        p_admin_note: adminNote || null,  // A05-2: 传递拒绝原因
      });

      if (rpcError) throw new Error(rpcError.message || '审核失败');
      if (!result || !result.success) throw new Error(result?.error || '审核失败');

      await audit.success({
        oldData: { status: depositRequest.status },
        newData: { status: action, admin_note: adminNote || null },
      });

      if (action === 'APPROVED' && result.bonus_amount > 0) {
        toast.success(`充值已批准！赠送 ${result.bonus_amount} 积分到 LUCKY_COIN 钱包`);
      } else {
        toast.success(`充值已${action === 'APPROVED' ? '批准' : '拒绝'}!`);
      }
      fetchDeposits();
    } catch (error: any) {
      await audit.fail(error.message);
      toast.error(`审核失败: ${error.message}`);
    } finally {
      setSubmittingId(null);
    }
  };

  const confirmApprove = () => {
    if (pendingApproveDeposit) {
      handleReview(pendingApproveDeposit, 'APPROVED');
    }
    setIsApproveDialogOpen(false);
    setPendingApproveDeposit(null);
  };

  const confirmReject = () => {
    if (!rejectReason.trim()) {
      toast.error('请填写拒绝原因');
      return;
    }
    if (pendingRejectDeposit) {
      handleReview(pendingRejectDeposit, 'REJECTED', rejectReason.trim());
    }
    setIsRejectDialogOpen(false);
    setPendingRejectDeposit(null);
    setRejectReason('');
  };

  const isAnySubmitting = submittingId !== null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">
            充值审核
            {statusFilter === 'PENDING' && totalCount > 0 && (
              <span className="ml-2 bg-red-500 text-white text-sm px-2 py-0.5 rounded-full">{totalCount}</span>
            )}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setIsConfigDialogOpen(true)} className="flex items-center space-x-2">
            <Gift className="h-4 w-4" />
            <span>充值赠送配置</span>
          </Button>
        </CardHeader>
        <CardContent>
          {/* A05-1: 状态筛选 */}
          <div className="flex gap-2 mb-4">
            {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  statusFilter === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {s === 'ALL' ? '全部' : s === 'PENDING' ? '待审批' : s === 'APPROVED' ? '已批准' : '已拒绝'}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="text-center py-10">加载中...</div>
          ) : deposits.length === 0 ? (
            <div className="text-center py-10 text-gray-500">暂无{statusFilter === 'PENDING' ? '待审批的' : ''}充值记录</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>订单号</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>金额</TableHead>
                    <TableHead>支付方式</TableHead>
                    <TableHead>付款信息</TableHead>
                    <TableHead>凭证</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deposits.map((deposit) => (
                    <TableRow key={deposit.id}>
                      <TableCell className="font-medium text-xs">{deposit.order_number || deposit.id.substring(0, 8) + '...'}</TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <div className="font-medium">{deposit.user?.display_name || deposit.user?.phone_number || '-'}</div>
                          <div className="text-gray-400">{deposit.user_id.substring(0, 8)}...</div>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">{deposit.amount} {deposit.currency}</TableCell>
                      <TableCell>{deposit.payment_method}</TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <div>姓名: {deposit.payer_name || '-'}</div>
                          <div>账号: {deposit.payer_account || '-'}</div>
                          <div>参考: {deposit.payment_reference || '-'}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {deposit.payment_proof_images && deposit.payment_proof_images.length > 0 ? (
                          <Button variant="outline" size="sm" onClick={() => handleViewImages(deposit)}>
                            查看图片 ({deposit.payment_proof_images.length})
                          </Button>
                        ) : (
                          <span className="text-gray-400 text-sm">无</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(deposit.status)}`}>
                          {deposit.status === 'PENDING' ? '待审批' : deposit.status === 'APPROVED' ? '已批准' : '已拒绝'}
                        </span>
                      </TableCell>
                      <TableCell>{formatDateTime(deposit.created_at)}</TableCell>
                      <TableCell>
                        {deposit.status === 'PENDING' && (
                          <div className="flex space-x-2">
                            <Button size="sm" onClick={() => handleApproveClick(deposit)} disabled={isAnySubmitting}>
                              {submittingId === deposit.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '批准'}
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleRejectClick(deposit)} disabled={isAnySubmitting}>
                              {submittingId === deposit.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '拒绝'}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* A05-3: 分页 */}
              <div className="flex justify-between items-center mt-4">
                <span className="text-sm text-gray-500">共 {totalCount} 条记录</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>上一页</Button>
                  <span className="text-sm py-1 px-2">第 {page} 页</span>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>下一页</Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 图片查看对话框 */}
      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>充值凭证</DialogTitle>
            <DialogDescription>
              订单号: {selectedDeposit?.order_number} | 金额: {selectedDeposit?.amount} {selectedDeposit?.currency}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">付款信息</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-600">付款人姓名:</span><span className="ml-2 font-medium">{selectedDeposit?.payer_name || '-'}</span></div>
                <div><span className="text-gray-600">付款账号:</span><span className="ml-2 font-medium">{selectedDeposit?.payer_account || '-'}</span></div>
                <div><span className="text-gray-600">支付参考:</span><span className="ml-2 font-medium">{selectedDeposit?.payment_reference || '-'}</span></div>
                <div><span className="text-gray-600">支付方式:</span><span className="ml-2 font-medium">{selectedDeposit?.payment_method || '-'}</span></div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2">凭证图片</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedDeposit?.payment_proof_images?.map((imageUrl, index) => (
                  <div key={index} className="border rounded-lg overflow-hidden">
                    <img src={imageUrl} alt={`凭证 ${index + 1}`} className="w-full h-auto object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3E图片加载失败%3C/text%3E%3C/svg%3E'; }} />
                    <div className="p-2 bg-gray-50 text-xs text-gray-600">
                      <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">在新窗口打开</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {selectedDeposit?.status === 'PENDING' && (
              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsImageDialogOpen(false)} disabled={isAnySubmitting}>关闭</Button>
                <Button variant="destructive" disabled={isAnySubmitting} onClick={() => { if (selectedDeposit) { setIsImageDialogOpen(false); handleRejectClick(selectedDeposit); } }}>
                  拒绝
                </Button>
                <Button disabled={isAnySubmitting} onClick={() => { if (selectedDeposit) { setIsImageDialogOpen(false); handleApproveClick(selectedDeposit); } }}>
                  批准
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* A05-4: 批准确认弹窗 */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认批准充值</DialogTitle>
            <DialogDescription>
              您确定要批准以下充值请求吗？此操作将立即向用户钱包添加余额。
            </DialogDescription>
          </DialogHeader>
          {pendingApproveDeposit && (
            <div className="bg-green-50 p-4 rounded-lg text-sm space-y-1">
              <div><span className="text-gray-600">用户:</span> <span className="font-medium">{pendingApproveDeposit.user?.phone_number || pendingApproveDeposit.user_id.substring(0, 8)}</span></div>
              <div><span className="text-gray-600">金额:</span> <span className="font-bold text-green-700">{pendingApproveDeposit.amount} {pendingApproveDeposit.currency}</span></div>
              <div><span className="text-gray-600">支付方式:</span> <span className="font-medium">{pendingApproveDeposit.payment_method}</span></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>取消</Button>
            <Button onClick={confirmApprove} disabled={isAnySubmitting}>
              {isAnySubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              确认批准
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* A05-2: 拒绝原因弹窗 */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>填写拒绝原因</DialogTitle>
            <DialogDescription>
              请填写拒绝此充值请求的原因，该原因将通知给用户。
            </DialogDescription>
          </DialogHeader>
          {pendingRejectDeposit && (
            <div className="bg-red-50 p-3 rounded-lg text-sm space-y-1 mb-2">
              <div><span className="text-gray-600">用户:</span> <span className="font-medium">{pendingRejectDeposit.user?.phone_number || pendingRejectDeposit.user_id.substring(0, 8)}</span></div>
              <div><span className="text-gray-600">金额:</span> <span className="font-bold">{pendingRejectDeposit.amount} {pendingRejectDeposit.currency}</span></div>
            </div>
          )}
          <textarea
            className="w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
            rows={4}
            placeholder="请输入拒绝原因（必填），例如：凭证模糊、金额不符、付款账号不匹配等"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={isAnySubmitting || !rejectReason.trim()}>
              {isAnySubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              确认拒绝
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 充值赠送配置对话框 */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <FirstDepositBonusConfig />
        </DialogContent>
      </Dialog>
    </>
  );
};
