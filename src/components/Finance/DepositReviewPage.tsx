import React, { useEffect, useState } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { toast } from 'react-hot-toast';
import { Gift } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
}

export const DepositReviewPage: React.FC = () => {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDeposit, setSelectedDeposit] = useState<DepositRequest | null>(null);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);

  useEffect(() => {
    fetchDeposits();
  }, []);

  const fetchDeposits = async () => {
    try {
      const { data, error } = await supabase
        .from('deposit_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {throw error;}
      setDeposits(data || []);
    } catch (error: any) {
      toast.error(`加载充值记录失败: ${error.message}`);
      console.error('Error fetching deposits:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleViewImages = (deposit: DepositRequest) => {
    setSelectedDeposit(deposit);
    setIsImageDialogOpen(true);
  };

  const handleReview = async (depositRequest: DepositRequest, action: 'APPROVED' | 'REJECTED') => {
    console.log('handleReview called:', depositRequest.id, action);

    if (!admin) {
      toast.error('请先登录');
      return;
    }

    // 创建审计日志计时器
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
      },
    });

    try {
      // 调用 Edge Function 处理充值审核
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/approve-deposit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
            'x-admin-id': admin!.id,
          },
          body: JSON.stringify({
            requestId: depositRequest.id,
            action: action,
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '审核失败');
      }

      // 记录成功日志
      await audit.success({
        oldData: { status: depositRequest.status },
        newData: { status: action },
      });

      toast.success(`充值已${action === 'APPROVED' ? '批准' : '拒绝'}!`);
      fetchDeposits(); // 刷新列表
    } catch (error: any) {
      // 记录失败日志
      await audit.fail(error.message);
      toast.error(`审核失败: ${error.message}`);
      console.error('Error reviewing deposit:', error);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">充值审核</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsConfigDialogOpen(true)}
            className="flex items-center space-x-2"
          >
            <Gift className="h-4 w-4" />
            <span>首充奖励配置</span>
          </Button>
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
                    <TableHead>用户 ID</TableHead>
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
                      <TableCell className="font-medium">{deposit.id.substring(0, 8)}...</TableCell>
                      <TableCell>{deposit.user_id ? `${deposit.user_id.substring(0, 8)}...` : '-'}</TableCell>
                      <TableCell>{deposit.amount} {deposit.currency}</TableCell>
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewImages(deposit)}
                          >
                            查看图片 ({deposit.payment_proof_images.length})
                          </Button>
                        ) : (
                          <span className="text-gray-400 text-sm">无</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(deposit.status)}`}>
                          {deposit.status}
                        </span>
                      </TableCell>
                      <TableCell>{formatDateTime(deposit.created_at)}</TableCell>
                      <TableCell className="flex space-x-2">
                        {deposit.status === 'PENDING' && (
                          <>
                            <Button size="sm" onClick={() => handleReview(deposit, 'APPROVED')}>
                              批准
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleReview(deposit, 'REJECTED')}>
                              拒绝
                            </Button>
                          </>
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
            {/* 付款信息 */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">付款信息</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">付款人姓名:</span>
                  <span className="ml-2 font-medium">{selectedDeposit?.payer_name || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-600">付款账号:</span>
                  <span className="ml-2 font-medium">{selectedDeposit?.payer_account || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-600">支付参考:</span>
                  <span className="ml-2 font-medium">{selectedDeposit?.payment_reference || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-600">支付方式:</span>
                  <span className="ml-2 font-medium">{selectedDeposit?.payment_method || '-'}</span>
                </div>
              </div>
            </div>

            {/* 凭证图片 */}
            <div>
              <h3 className="font-semibold mb-2">凭证图片</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedDeposit?.payment_proof_images?.map((imageUrl, index) => (
                  <div key={index} className="border rounded-lg overflow-hidden">
                    <img
                      src={imageUrl}
                      alt={`凭证 ${index + 1}`}
                      className="w-full h-auto object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3E图片加载失败%3C/text%3E%3C/svg%3E';
                      }}
                    />
                    <div className="p-2 bg-gray-50 text-xs text-gray-600">
                      <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        在新窗口打开
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 操作按钮 */}
            {selectedDeposit?.status === 'PENDING' && (
              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setIsImageDialogOpen(false)}
                >
                  关闭
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (selectedDeposit) {
                      handleReview(selectedDeposit, 'REJECTED');
                      setIsImageDialogOpen(false);
                    }
                  }}
                >
                  拒绝
                </Button>
                <Button
                  onClick={() => {
                    if (selectedDeposit) {
                      handleReview(selectedDeposit, 'APPROVED');
                      setIsImageDialogOpen(false);
                    }
                  }}
                >
                  批准
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 首充奖励配置对话框 */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <FirstDepositBonusConfig />
        </DialogContent>
      </Dialog>
    </>
  );
};
