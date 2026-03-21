import React, { useEffect, useState, useCallback } from 'react';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Tables, Enums } from '@/types/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Loader2, AlertCircle } from 'lucide-react';
import { createAuditTimer } from '@/lib/auditLogger';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';

type Withdrawal = Tables<'withdrawal_requests'> & {
  users?: {
    id: string;
    display_name?: string;
    phone_number?: string;
  };
};
type WithdrawalStatus = Enums<'WithdrawalStatus'>;

const LIMIT = 20;

const getStatusColor = (status: WithdrawalStatus) => {
  switch (status) {
    case 'PENDING': return 'bg-yellow-100 text-yellow-800';
    case 'APPROVED': return 'bg-green-100 text-green-800';
    case 'REJECTED': return 'bg-red-100 text-red-800';
    case 'COMPLETED': return 'bg-blue-100 text-blue-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getActionLabel = (status: string) => {
  switch (status) {
    case 'APPROVED': return 'APPROVE_WITHDRAWAL';
    case 'REJECTED': return 'REJECT_WITHDRAWAL';
    case 'COMPLETED': return 'COMPLETE_WITHDRAWAL';
    default: return `UPDATE_WITHDRAWAL_${status}`;
  }
};

export const WithdrawalReviewPage: React.FC = () => {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  
  // 弹窗状态
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [pendingRejectWithdrawal, setPendingRejectWithdrawal] = useState<Withdrawal | null>(null);
  
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [pendingApproveWithdrawal, setPendingApproveWithdrawal] = useState<Withdrawal | null>(null);
  
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [pendingCompleteWithdrawal, setPendingCompleteWithdrawal] = useState<Withdrawal | null>(null);

  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const fetchWithdrawals = useCallback(async () => {
    setIsLoading(true);
    try {
      const from = (page - 1) * LIMIT;
      const to = from + LIMIT - 1;

      let query = supabase
        .from('withdrawal_requests')
        .select('*, users(id, display_name, phone_number)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }

      const { data, error, count } = await query;

      if (error) throw error;
      setWithdrawals(data || []);
      setHasMore((data || []).length === LIMIT);
      if (count !== null) setTotalCount(count);
    } catch (error: any) {
      toast.error(`加载提现列表失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, page, statusFilter]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const handleReview = async (id: string, status: 'APPROVED' | 'REJECTED' | 'COMPLETED', adminNote?: string) => {
    if (!admin) { toast.error('未登录'); return; }
    if (submittingId) { toast.error('请等待当前操作完成'); return; }

    setSubmittingId(id);
    const currentWithdrawal = withdrawals.find(w => w.id === id);

    const audit = createAuditTimer(supabase, {
      adminId: admin.id,
      action: getActionLabel(status),
      targetType: 'withdrawal_request',
      targetId: id,
      details: {
        user_id: currentWithdrawal?.user_id,
        amount: currentWithdrawal?.amount,
        currency: currentWithdrawal?.currency,
        admin_note: adminNote || null,
      },
    });

    try {
      // 安全修复 A06: 使用 supabase.functions.invoke 替代直接 fetch
      // 这会自动处理认证，且不需要在前端暴露 service_role key
      const { data: result, error: invokeError } = await supabase.functions.invoke('approve-withdrawal', {
        body: { requestId: id, action: status, adminNote: adminNote || null },
        headers: { 'x-admin-id': admin.id }
      });

      if (invokeError) throw invokeError;
      if (!result.success) throw new Error(result.error || '审核失败');

      await audit.success({
        oldData: { status: currentWithdrawal?.status },
        newData: { status, admin_note: adminNote || null },
      });

      toast.success(`提现状态已更新为 ${status}!`);
      fetchWithdrawals();
    } catch (error: any) {
      await audit.fail(error.message);
      toast.error(`审核失败: ${error.message}`);
    } finally {
      setSubmittingId(null);
    }
  };

  const confirmApprove = () => {
    if (pendingApproveWithdrawal) handleReview(pendingApproveWithdrawal.id, 'APPROVED');
    setIsApproveDialogOpen(false);
    setPendingApproveWithdrawal(null);
  };

  const confirmReject = () => {
    if (!rejectReason.trim()) { toast.error('请填写拒绝原因'); return; }
    if (pendingRejectWithdrawal) handleReview(pendingRejectWithdrawal.id, 'REJECTED', rejectReason.trim());
    setIsRejectDialogOpen(false);
    setPendingRejectWithdrawal(null);
    setRejectReason('');
  };

  const confirmComplete = () => {
    if (pendingCompleteWithdrawal) handleReview(pendingCompleteWithdrawal.id, 'COMPLETED');
    setIsCompleteDialogOpen(false);
    setPendingCompleteWithdrawal(null);
  };

  const isAnySubmitting = submittingId !== null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">
            提现审核
            {statusFilter === 'PENDING' && totalCount > 0 && (
              <span className="ml-2 bg-red-500 text-white text-sm px-2 py-0.5 rounded-full">{totalCount}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            {['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'ALL'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  statusFilter === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {s === 'ALL' ? '全部' : s === 'PENDING' ? '待审批' : s === 'APPROVED' ? '已批准' : s === 'COMPLETED' ? '已完成' : '已拒绝'}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="text-center py-10">加载中...</div>
          ) : withdrawals.length === 0 ? (
            <div className="text-center py-10 text-gray-500">暂无{statusFilter === 'PENDING' ? '待审批的' : ''}提现记录</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户信息</TableHead>
                    <TableHead>金额</TableHead>
                    <TableHead>收款信息</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withdrawals.map((withdrawal) => (
                    <TableRow key={withdrawal.id}>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">{withdrawal.users?.display_name || withdrawal.users?.phone_number || '未知用户'}</div>
                          <div className="text-gray-500 text-xs">ID: {withdrawal.user_id.substring(0, 8)}...</div>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">{withdrawal.amount} {withdrawal.currency}</TableCell>
                      <TableCell>
                        <div className="text-xs space-y-1">
                          <div className="font-medium text-blue-600">{withdrawal.withdrawal_method}</div>
                          {withdrawal.mobile_wallet_number && <div>账号: {withdrawal.mobile_wallet_number}</div>}
                          {withdrawal.bank_account_number && (
                            <>
                              <div>银行: {withdrawal.bank_name}</div>
                              <div>账号: {withdrawal.bank_account_number}</div>
                              <div>户名: {withdrawal.bank_account_name}</div>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(withdrawal.status as WithdrawalStatus)}`}>
                          {withdrawal.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{formatDateTime(withdrawal.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          {withdrawal.status === 'PENDING' && (
                            <>
                              <Button size="sm" onClick={() => { setPendingApproveWithdrawal(withdrawal); setIsApproveDialogOpen(true); }} disabled={isAnySubmitting}>
                                批准
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => { setPendingRejectWithdrawal(withdrawal); setIsRejectDialogOpen(true); }} disabled={isAnySubmitting}>
                                拒绝
                              </Button>
                            </>
                          )}
                          {withdrawal.status === 'APPROVED' && (
                            <Button size="sm" variant="outline" onClick={() => { setPendingCompleteWithdrawal(withdrawal); setIsCompleteDialogOpen(true); }} disabled={isAnySubmitting}>
                              标记完成
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

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

      {/* 批准确认 */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>确认批准提现</DialogTitle></DialogHeader>
          <DialogDescription>您确定要批准这笔提现吗？批准后将进入待打款状态。</DialogDescription>
          {pendingApproveWithdrawal && (
            <div className="bg-blue-50 p-3 rounded text-sm">
              金额: <span className="font-bold">{pendingApproveWithdrawal.amount} {pendingApproveWithdrawal.currency}</span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>取消</Button>
            <Button onClick={confirmApprove}>确认批准</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 拒绝原因 */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>填写拒绝原因</DialogTitle></DialogHeader>
          <textarea
            className="w-full border rounded p-2 text-sm"
            rows={3}
            placeholder="请输入拒绝原因..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={!rejectReason.trim()}>确认拒绝</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 完成确认 */}
      <Dialog open={isCompleteDialogOpen} onOpenChange={setIsCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>确认已完成打款</DialogTitle></DialogHeader>
          <DialogDescription>请确认您已通过线下渠道完成打款。此操作不可撤销。</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompleteDialogOpen(false)}>取消</Button>
            <Button onClick={confirmComplete}>确认完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
