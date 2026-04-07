import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Tables, Enums } from '@/types/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { createAuditTimer } from '@/lib/auditLogger';

type Showoff = Tables<'showoffs'>;
type ShowoffStatus = Enums<'ShowoffStatus'>;

const getStatusColor = (status: ShowoffStatus) => {
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

export const ShowoffReviewPage: React.FC = () => {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();
  const [showoffs, setShowoffs] = useState<Showoff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedShowoff, setSelectedShowoff] = useState<Showoff | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [rewardCoins, setRewardCoins] = useState<number>(0);
  const [adminNote, setAdminNote] = useState<string>('');

  const fetchShowoffs = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('showoffs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {throw error;}
      setShowoffs(data || []);
    } catch (error: any) {
      toast.error(`加载晒单列表失败: ${error.message}`);
      console.error('Error loading showoffs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchShowoffs();
  }, [fetchShowoffs]);

  const handleViewDetail = (showoff: Showoff) => {
    setSelectedShowoff(showoff);
    setRewardCoins(showoff.reward_coins || 0);
    setAdminNote(showoff.admin_note || '');
    setIsDetailDialogOpen(true);
  };

  const MAX_REWARD_COINS = 500; // 单次审核最大奖励上限

  const handleReview = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selectedShowoff) {return;}
    if (!admin) {
      toast.error('未登录');
      return;
    }
    // 验证奖励金币数量
    if (status === 'APPROVED') {
      if (rewardCoins < 0) {
        toast.error('奖励 Lucky Coins 不能为负数');
        return;
      }
      if (rewardCoins > MAX_REWARD_COINS) {
        toast.error(`单次奖励上限为 ${MAX_REWARD_COINS} Lucky Coins`);
        return;
      }
    }

    const audit = createAuditTimer(supabase, {
      adminId: admin.id,
      action: status === 'APPROVED' ? 'APPROVE_SHOWOFF' : 'REJECT_SHOWOFF',
      targetType: 'showoff',
      targetId: selectedShowoff.id,
      details: {
        user_id: selectedShowoff.user_id,
        reward_coins: status === 'APPROVED' ? rewardCoins : 0,
        admin_note: adminNote || null,
      },
    });

    try {
        // 调用 Edge Function 处理晴单审核（使用 supabase.functions.invoke 避免暴露 service_role key）
      const { data: result, error: fnError } = await supabase.functions.invoke('approve-showoff', {
        body: {
          showoffId: selectedShowoff.id,
          action: status,
          rewardCoins: status === 'APPROVED' ? rewardCoins : 0,
          adminNote: adminNote || null,
          adminId: admin.id,
        },
      });
      if (fnError) {throw fnError;}
      if (!result?.success) {
        throw new Error(result?.error || '审核失败');
      }

      await audit.success({
        oldData: { status: selectedShowoff.status },
        newData: { status, reward_coins: status === 'APPROVED' ? rewardCoins : 0 },
      });
      toast.success(`晒单已${status === 'APPROVED' ? '批准' : '拒绝'}!`);
      setIsDetailDialogOpen(false);
      fetchShowoffs(); // 刷新列表
    } catch (error: any) {
      await audit.fail(error.message);
      toast.error(`审核失败: ${error.message}`);
      console.error('Error reviewing showoff:', error);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">晒单审核</CardTitle>
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
                    <TableHead>内容预览</TableHead>
                    <TableHead>图片</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>奖励</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {showoffs.map((showoff) => (
                    <TableRow key={showoff.id}>
                      <TableCell className="font-medium">{(showoff.id || '').substring(0, 8)}...</TableCell>
                      <TableCell>{showoff.user_id ? `${showoff.user_id.substring(0, 8)}...` : <span className="text-gray-400 italic">运营晒单</span>}</TableCell>
                      <TableCell className="max-w-xs truncate">{showoff.content}</TableCell>
                      <TableCell>
                        {showoff.image_urls && showoff.image_urls.length > 0 ? (
                          <span className="text-sm text-gray-600">{showoff.image_urls.length} 张</span>
                        ) : (
                          <span className="text-sm text-gray-400">无</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(showoff.status)}`}>
                          {showoff.status === 'PENDING' ? '待审核' : showoff.status === 'APPROVED' ? '已通过' : showoff.status === 'REJECTED' ? '已拒绝' : showoff.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {showoff.reward_coins ? (
                          <span className="text-sm font-medium text-amber-600">
                            {showoff.reward_coins} 币
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>{formatDateTime(showoff.created_at)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewDetail(showoff)}
                        >
                          查看详情
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

      {/* 详情查看对话框 */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>晒单详情</DialogTitle>
            <DialogDescription>
              ID: {selectedShowoff?.id} | 状态: {selectedShowoff?.status === 'PENDING' ? '待审核' : selectedShowoff?.status === 'APPROVED' ? '已通过' : selectedShowoff?.status === 'REJECTED' ? '已拒绝' : selectedShowoff?.status}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">基本信息</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">用户ID:</span>
                  <span className="ml-2 font-medium">{selectedShowoff?.user_id || <span className="text-gray-400 italic">运营晒单(无用户)</span>}</span>
                </div>
                <div>
                  <span className="text-gray-600">创建时间:</span>
                  <span className="ml-2 font-medium">
                    {selectedShowoff?.created_at ? formatDateTime(selectedShowoff.created_at) : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">点赞数:</span>
                  <span className="ml-2 font-medium">{selectedShowoff?.likes_count || 0}</span>
                </div>
                <div>
                  <span className="text-gray-600">评论数:</span>
                  <span className="ml-2 font-medium">{selectedShowoff?.comments_count || 0}</span>
                </div>
              </div>
            </div>

            {/* 晒单内容 */}
            <div>
              <h3 className="font-semibold mb-2">晒单内容</h3>
              <div className="bg-white border rounded-lg p-4">
                <p className="text-sm whitespace-pre-wrap">{selectedShowoff?.content}</p>
              </div>
            </div>

            {/* 晒单图片 */}
            {selectedShowoff?.image_urls && selectedShowoff.image_urls.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">晒单图片</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {selectedShowoff.image_urls.map((imageUrl, index) => (
                    <div key={index} className="border rounded-lg overflow-hidden">
                      <img
                        src={imageUrl}
                        alt={`晒单图片 ${index + 1}`}
                        className="w-full h-48 object-cover"
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
            )}

            {/* 审核设置（仅PENDING状态显示） */}
            {selectedShowoff?.status === 'PENDING' && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold">审核设置</h3>
                
                {/* 积分奖励 */}
                <div className="space-y-2">
                  <Label htmlFor="reward_coins">积分奖励（批准时发放）</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="reward_coins"
                      type="number"
                      min="0"
                      max="1000"
                      step="10"
                      value={rewardCoins}
                      onChange={(e) => setRewardCoins(parseInt(e.target.value) || 0)}
                      className="w-32"
                    />
                    <span className="text-sm text-gray-600">币（建议范围: 1-100）</span>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRewardCoins(2)}
                    >
                      2币
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRewardCoins(5)}
                    >
                      5币
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRewardCoins(10)}
                    >
                      10币
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRewardCoins(20)}
                    >
                      20币
                    </Button>
                  </div>
                </div>

                {/* 管理员备注 */}
                <div className="space-y-2">
                  <Label htmlFor="admin_note">管理员备注（可选）</Label>
                  <Textarea
                    id="admin_note"
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="输入审核备注..."
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* 已审核信息 */}
            {selectedShowoff?.status !== 'PENDING' && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">审核信息</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600">审核状态:</span>
                    <span className={`ml-2 px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedShowoff?.status)}`}>
                      {selectedShowoff?.status === 'PENDING' ? '待审核' : selectedShowoff?.status === 'APPROVED' ? '已通过' : selectedShowoff?.status === 'REJECTED' ? '已拒绝' : selectedShowoff?.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">审核时间:</span>
                    <span className="ml-2 font-medium">
                      {selectedShowoff?.reviewed_at ? formatDateTime(selectedShowoff.reviewed_at) : '-'}
                    </span>
                  </div>
                  {selectedShowoff?.reward_coins > 0 && (
                    <div>
                      <span className="text-gray-600">奖励积分:</span>
                      <span className="ml-2 font-medium text-amber-600">
                        {selectedShowoff.reward_coins} 币
                      </span>
                    </div>
                  )}
                  {selectedShowoff?.admin_note && (
                    <div>
                      <span className="text-gray-600">管理员备注:</span>
                      <p className="ml-2 mt-1 text-gray-700">{selectedShowoff.admin_note}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setIsDetailDialogOpen(false)}
            >
              关闭
            </Button>
            {selectedShowoff?.status === 'PENDING' && (
              <div className="flex space-x-2">
                <Button
                  variant="destructive"
                  onClick={() => handleReview('REJECTED')}
                >
                  拒绝
                </Button>
                <Button
                  onClick={() => handleReview('APPROVED')}
                >
                  批准
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
