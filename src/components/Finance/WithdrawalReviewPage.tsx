import React, { useState, useEffect, useCallback } from 'react';
// import { useNavigate } from 'react-router-dom';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Tables, Enums } from '@/types/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { createAuditTimer } from '@/lib/auditLogger';

type Withdrawal = Tables<'withdrawal_requests'> & {
  users?: {
    id: string;
    display_name?: string;
    telegram_username?: string;
  };
};
type WithdrawalStatus = Enums<'WithdrawalStatus'>;

const getStatusColor = (status: WithdrawalStatus) => {
  switch (status) {
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800';
    case 'APPROVED':
      return 'bg-green-100 text-green-800';
    case 'REJECTED':
      return 'bg-red-100 text-red-800';
    case 'COMPLETED':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
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
  // const navigate = useNavigate();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWithdrawals = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*, users(id, display_name, telegram_username)')
        .order('created_at', { ascending: false });

      if (error) {throw error;}

      setWithdrawals(data || []);
    } catch (error: any) {
      toast.error(`加载提现列表失败: ${error.message}`);
      console.error('Error loading withdrawals:', error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  const handleReview = async (id: string, status: 'APPROVED' | 'REJECTED' | 'COMPLETED') => {
    if (!window.confirm(`确定要将这笔提现标记为 ${status} 吗？`)) {return;}

    if (!admin) {
      toast.error('未登录');
      return;
    }

    // 获取当前提现记录用于审计日志
    const currentWithdrawal = withdrawals.find(w => w.id === id);

    // 创建审计日志计时器
    const audit = createAuditTimer(supabase, {
      adminId: admin.id,
      action: getActionLabel(status),
      targetType: 'withdrawal_request',
      targetId: id,
      details: {
        user_id: currentWithdrawal?.user_id,
        user_name: currentWithdrawal?.users?.display_name || currentWithdrawal?.users?.telegram_username,
        amount: currentWithdrawal?.amount,
        currency: currentWithdrawal?.currency,
        withdrawal_method: currentWithdrawal?.withdrawal_method,
      },
    });

    try {
      // 调用 Edge Function 处理提现审核
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/approve-withdrawal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
            'x-admin-id': admin.id,
          },
          body: JSON.stringify({
            requestId: id,
            action: status,
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '审核失败');
      }

      // 记录成功日志
      await audit.success({
        oldData: { status: currentWithdrawal?.status },
        newData: { status },
      });

      toast.success(`提现状态已更新为 ${status}!`);
      fetchWithdrawals(); // 刷新列表
    } catch (error: any) {
      // 记录失败日志
      await audit.fail(error.message);
      toast.error(`审核失败: ${error.message}`);
      console.error('Error reviewing withdrawal:', error);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-2xl font-bold">提现审核</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-10">加载中...</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
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
                    <TableCell className="font-medium">{withdrawal.id.substring(0, 8)}...</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{withdrawal.users?.display_name || withdrawal.users?.telegram_username || '未知用户'}</div>
                        <div className="text-gray-500 text-xs">ID: {withdrawal.user_id ? `${withdrawal.user_id.substring(0, 8)}...` : '-'}</div>
                      </div>
                    </TableCell>
                    <TableCell>{withdrawal.amount} {withdrawal.currency}</TableCell>
                    <TableCell>
                      {(withdrawal.withdrawal_method === 'ALIF_MOBI' || withdrawal.withdrawal_method === 'DC_BANK') && (
                        <div className="text-sm">
                          <div className="font-medium">{withdrawal.withdrawal_method === 'ALIF_MOBI' ? 'Alif Mobi' : 'DC Bank'}</div>
                          <div className="text-gray-600">账户: {withdrawal.mobile_wallet_number || 'N/A'}</div>
                          <div className="text-gray-600">手机号: {withdrawal.mobile_wallet_name || 'N/A'}</div>
                        </div>
                      )}
                      {withdrawal.withdrawal_method === 'BANK_TRANSFER' && (
                        <div className="text-sm">
                          <div className="font-medium">银行转账</div>
                          <div className="text-gray-600">银行: {withdrawal.bank_name || 'N/A'}</div>
                          <div className="text-gray-600">账号: {withdrawal.bank_account_number || 'N/A'}</div>
                          <div className="text-gray-600">户名: {withdrawal.bank_account_name || 'N/A'}</div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(withdrawal.status)}`}>
                        {withdrawal.status}
                      </span>
                    </TableCell>
                    <TableCell>{formatDateTime(withdrawal.created_at)}</TableCell>
                    <TableCell className="flex space-x-2">
                      {withdrawal.status === 'PENDING' && (
                        <>
                          <Button size="sm" onClick={() => handleReview(withdrawal.id, 'APPROVED')}>
                            批准
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleReview(withdrawal.id, 'REJECTED')}>
                            拒绝
                          </Button>
                        </>
                      )}
                      {withdrawal.status === 'APPROVED' && (
                        <Button size="sm" onClick={() => handleReview(withdrawal.id, 'COMPLETED')}>
                          标记为已完成
                        </Button>
                      )}
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
