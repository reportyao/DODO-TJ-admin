import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
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
import { Eye, EyeOff, Edit, Loader2, Search } from 'lucide-react';

interface Showoff {
  id: string;
  user_id: string | null;
  content: string;
  image_urls: string[] | null;
  images: string[] | null;
  status: string;
  reward_coins: number | null;
  likes_count: number;
  comments_count: number;
  source: string;
  is_hidden: boolean;
  display_username: string | null;
  display_avatar_url: string | null;
  lottery_id: string | null;
  title: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export const OperationalShowoffManagementPage: React.FC = () => {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();
  const [showoffs, setShowoffs] = useState<Showoff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedShowoff, setSelectedShowoff] = useState<Showoff | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // 编辑表单状态
  const [editFormData, setEditFormData] = useState({
    display_username: '',
    content: '',
    likes_count: 0,
    reward_coins: 0,
  });

  const fetchShowoffs = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('showoffs')
        .select('*')
        .eq('source', 'ADMIN')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setShowoffs(data || []);
    } catch (error: any) {
      toast.error(`加载运营晒单列表失败: ${error.message}`);
      console.error('Error loading operational showoffs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchShowoffs();
  }, [fetchShowoffs]);

  // 搜索过滤
  const filteredShowoffs = showoffs.filter(showoff => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      (showoff.display_username || '').toLowerCase().includes(searchLower) ||
      (showoff.content || '').toLowerCase().includes(searchLower)
    );
  });

  const handleToggleHidden = async (showoff: Showoff) => {
    try {
      const newHiddenStatus = !showoff.is_hidden;
      
      const { error } = await supabase
        .from('showoffs')
        .update({ 
          is_hidden: newHiddenStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', showoff.id);

      if (error) throw error;

      toast.success(`已${newHiddenStatus ? '隐藏' : '显示'}晒单`);
      fetchShowoffs();
    } catch (error: any) {
      toast.error(`操作失败: ${error.message}`);
      console.error('Error toggling hidden status:', error);
    }
  };

  const handleViewDetail = (showoff: Showoff) => {
    setSelectedShowoff(showoff);
    setIsDetailDialogOpen(true);
  };

  const handleEditClick = (showoff: Showoff) => {
    setSelectedShowoff(showoff);
    setEditFormData({
      display_username: showoff.display_username || '',
      content: showoff.content || '',
      likes_count: showoff.likes_count || 0,
      reward_coins: showoff.reward_coins || 0,
    });
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedShowoff) return;

    if (!editFormData.display_username.trim()) {
      toast.error('请输入用户昵称');
      return;
    }
    if (!editFormData.content.trim()) {
      toast.error('请输入晒单内容');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('showoffs')
        .update({
          display_username: editFormData.display_username.trim(),
          content: editFormData.content.trim(),
          likes_count: editFormData.likes_count,
          reward_coins: editFormData.reward_coins,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedShowoff.id);

      if (error) throw error;

      toast.success('晒单更新成功');
      setIsEditDialogOpen(false);
      fetchShowoffs();
    } catch (error: any) {
      toast.error(`更新失败: ${error.message}`);
      console.error('Error updating showoff:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 获取晒单图片数组（兼容 image_urls 和 images 两个字段）
  const getShowoffImages = (showoff: Showoff): string[] => {
    return showoff.image_urls || showoff.images || [];
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">运营晒单管理</CardTitle>
          <div className="text-sm text-gray-500">
            共 {showoffs.length} 条运营晒单
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 搜索栏 */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="搜索用户昵称或内容..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : filteredShowoffs.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              {searchTerm ? '没有找到匹配的运营晒单' : '暂无运营晒单'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">ID</TableHead>
                    <TableHead>虚拟用户</TableHead>
                    <TableHead className="max-w-xs">内容预览</TableHead>
                    <TableHead>图片</TableHead>
                    <TableHead>点赞数</TableHead>
                    <TableHead>奖励</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="w-32">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShowoffs.map((showoff) => {
                    const imgs = getShowoffImages(showoff);
                    return (
                      <TableRow key={showoff.id} className={showoff.is_hidden ? 'opacity-50' : ''}>
                        <TableCell className="font-mono text-xs">{(showoff.id || '').substring(0, 8)}...</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {showoff.display_avatar_url && (
                              <img
                                src={showoff.display_avatar_url}
                                alt={showoff.display_username || ''}
                                className="w-8 h-8 rounded-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            )}
                            <span className="text-sm font-medium">{showoff.display_username || '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="truncate text-sm">{showoff.content}</p>
                        </TableCell>
                        <TableCell>
                          {imgs.length > 0 ? (
                            <span className="text-sm text-gray-600">{imgs.length} 张</span>
                          ) : (
                            <span className="text-sm text-gray-400">无</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{showoff.likes_count || 0}</span>
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
                        <TableCell>
                          {showoff.is_hidden ? (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                              已隐藏
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                              显示中
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{formatDateTime(showoff.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex space-x-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewDetail(showoff)}
                              title="查看详情"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleToggleHidden(showoff)}
                              title={showoff.is_hidden ? '取消隐藏' : '隐藏'}
                            >
                              {showoff.is_hidden ? (
                                <Eye className="w-4 h-4 text-green-600" />
                              ) : (
                                <EyeOff className="w-4 h-4 text-gray-600" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditClick(showoff)}
                              title="编辑"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 详情查看对话框 */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>晒单详情</DialogTitle>
            <DialogDescription>
              ID: {selectedShowoff?.id}
            </DialogDescription>
          </DialogHeader>

          {selectedShowoff && (
            <div className="space-y-4">
              {/* 虚拟用户信息 */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">虚拟用户信息</h3>
                <div className="flex items-center space-x-3">
                  {selectedShowoff.display_avatar_url && (
                    <img
                      src={selectedShowoff.display_avatar_url}
                      alt={selectedShowoff.display_username || ''}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  )}
                  <div>
                    <p className="font-medium">{selectedShowoff.display_username || '-'}</p>
                    <p className="text-xs text-gray-500">来源: {selectedShowoff.source}</p>
                  </div>
                </div>
              </div>

              {/* 基本信息 */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">基本信息</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600">状态:</span>
                    <span className="ml-2 font-medium">{selectedShowoff.status === 'PENDING' ? '待审核' : selectedShowoff.status === 'APPROVED' ? '已通过' : selectedShowoff.status === 'REJECTED' ? '已拒绝' : selectedShowoff.status}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">显示状态:</span>
                    <span className={`ml-2 font-medium ${selectedShowoff.is_hidden ? 'text-red-600' : 'text-green-600'}`}>
                      {selectedShowoff.is_hidden ? '已隐藏' : '显示中'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">点赞数:</span>
                    <span className="ml-2 font-medium">{selectedShowoff.likes_count || 0}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">奖励积分:</span>
                    <span className="ml-2 font-medium text-amber-600">{selectedShowoff.reward_coins || 0} 币</span>
                  </div>
                  <div>
                    <span className="text-gray-600">创建时间:</span>
                    <span className="ml-2 font-medium">{formatDateTime(selectedShowoff.created_at)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">更新时间:</span>
                    <span className="ml-2 font-medium">{formatDateTime(selectedShowoff.updated_at)}</span>
                  </div>
                </div>
              </div>

              {/* 晒单内容 */}
              <div>
                <h3 className="font-semibold mb-2">晒单内容</h3>
                <div className="bg-white border rounded-lg p-4">
                  <p className="text-sm whitespace-pre-wrap">{selectedShowoff.content}</p>
                </div>
              </div>

              {/* 晒单图片 */}
              {(() => {
                const imgs = getShowoffImages(selectedShowoff);
                if (imgs.length === 0) return null;
                return (
                  <div>
                    <h3 className="font-semibold mb-2">晒单图片 ({imgs.length} 张)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {imgs.map((imageUrl, index) => (
                        <div key={index} className="border rounded-lg overflow-hidden">
                          <img
                            src={imageUrl}
                            alt={`晒单图片 ${index + 1}`}
                            className="w-full h-40 object-cover"
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
                );
              })()}

              {/* 管理员备注 */}
              {selectedShowoff.admin_note && (
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">管理员备注</h3>
                  <p className="text-sm text-gray-700">{selectedShowoff.admin_note}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              关闭
            </Button>
            <Button onClick={() => {
              setIsDetailDialogOpen(false);
              if (selectedShowoff) handleEditClick(selectedShowoff);
            }}>
              编辑
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑运营晒单</DialogTitle>
            <DialogDescription>
              ID: {selectedShowoff?.id}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 虚拟用户昵称 */}
            <div className="space-y-2">
              <Label htmlFor="edit_display_username">
                虚拟用户昵称 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="edit_display_username"
                value={editFormData.display_username}
                onChange={(e) => setEditFormData({ ...editFormData, display_username: e.target.value })}
                placeholder="例如: 幸运的Манус"
                maxLength={50}
              />
            </div>

            {/* 晒单内容 */}
            <div className="space-y-2">
              <Label htmlFor="edit_content">
                晒单内容 <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="edit_content"
                value={editFormData.content}
                onChange={(e) => setEditFormData({ ...editFormData, content: e.target.value })}
                placeholder="输入晒单文案..."
                rows={4}
                maxLength={500}
              />
              <p className="text-xs text-gray-500 text-right">
                {editFormData.content.length}/500
              </p>
            </div>

            {/* 晒单图片预览 */}
            {selectedShowoff && (() => {
              const imgs = getShowoffImages(selectedShowoff);
              if (imgs.length === 0) return null;
              return (
                <div className="space-y-2">
                  <Label>晒单图片</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {imgs.map((imageUrl, index) => (
                      <div key={index} className="border rounded-lg overflow-hidden">
                        <img
                          src={imageUrl}
                          alt={`晒单图片 ${index + 1}`}
                          className="w-full h-24 object-cover"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    图片暂不支持修改，如需修改请重新创建晒单
                  </p>
                </div>
              );
            })()}

            {/* 点赞数 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_likes_count">点赞数</Label>
                <Input
                  id="edit_likes_count"
                  type="number"
                  min="0"
                  max="9999"
                  value={editFormData.likes_count}
                  onChange={(e) => setEditFormData({ ...editFormData, likes_count: parseInt(e.target.value) || 0 })}
                />
              </div>

              {/* 积分奖励 */}
              <div className="space-y-2">
                <Label htmlFor="edit_reward_coins">积分奖励</Label>
                <Input
                  id="edit_reward_coins"
                  type="number"
                  min="0"
                  max="1000"
                  value={editFormData.reward_coins}
                  onChange={(e) => setEditFormData({ ...editFormData, reward_coins: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
