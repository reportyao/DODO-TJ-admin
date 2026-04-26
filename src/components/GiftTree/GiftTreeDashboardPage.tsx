/**
 * 希望之树 - 数据看板 & 种树记录管理
 *
 * 管理员可以：
 * - 查看整体统计数据（活跃树数、完成数、领取数等）
 * - 查看所有用户的种树记录
 * - 按状态筛选、搜索
 * - 查看核销码、手动标记领取
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { EmptyState } from '../EmptyState';
import { adminQuery, adminCount, adminUpdate, adminRpc } from '@/lib/adminApi';
import toast from 'react-hot-toast';

interface GiftTree {
  id: string;
  user_id: string;
  gift_item_id: string;
  current_water: number;
  target_water: number;
  status: string;
  pickup_code: string | null;
  pickup_expires_at: string | null;
  milestone_200_claimed: boolean;
  milestone_500_claimed: boolean;
  milestone_800_claimed: boolean;
  created_at: string;
  completed_at: string | null;
  claimed_at: string | null;
}

interface Stats {
  total: number;
  growing: number;
  completed: number;
  claimed: number;
  expired: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  GROWING: { label: '生长中', color: 'bg-green-100 text-green-700' },
  COMPLETED: { label: '已完成', color: 'bg-blue-100 text-blue-700' },
  CLAIMED: { label: '已领取', color: 'bg-purple-100 text-purple-700' },
  EXPIRED: { label: '已过期', color: 'bg-gray-100 text-gray-500' },
  CANCELLED: { label: '已取消', color: 'bg-red-100 text-red-700' },
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const GiftTreeDashboardPage: React.FC = () => {
  const { supabase } = useSupabase();
  const [trees, setTrees] = useState<GiftTree[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, growing: 0, completed: 0, claimed: 0, expired: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const LIMIT = 20;

  const fetchStats = useCallback(async () => {
    try {
      const [total, growing, completed, claimed, expired] = await Promise.all([
        adminCount(supabase, 'gift_trees'),
        adminCount(supabase, 'gift_trees', [{ col: 'status', op: 'eq', val: 'GROWING' }]),
        adminCount(supabase, 'gift_trees', [{ col: 'status', op: 'eq', val: 'COMPLETED' }]),
        adminCount(supabase, 'gift_trees', [{ col: 'status', op: 'eq', val: 'CLAIMED' }]),
        adminCount(supabase, 'gift_trees', [{ col: 'status', op: 'eq', val: 'EXPIRED' }]),
      ]);
      setStats({ total, growing, completed, claimed, expired });
    } catch (error: any) {
      console.error('Failed to fetch stats:', error);
    }
  }, [supabase]);

  const fetchTrees = useCallback(async () => {
    try {
      setIsLoading(true);
      const filters: any[] = [];
      if (statusFilter !== 'ALL') {
        filters.push({ col: 'status', op: 'eq', val: statusFilter });
      }

      // Get count for pagination
      const count = await adminCount(supabase, 'gift_trees', filters,
        searchQuery ? `user_id.ilike.%${searchQuery}%,pickup_code.ilike.%${searchQuery}%` : undefined
      );
      setTotalPages(Math.ceil(count / LIMIT) || 1);

      const data = await adminQuery<GiftTree>(supabase, 'gift_trees', {
        select: '*',
        filters,
        orderBy: 'created_at',
        orderAsc: false,
        limit: LIMIT,
        offset: (page - 1) * LIMIT,
        orFilters: searchQuery ? `user_id.ilike.%${searchQuery}%,pickup_code.ilike.%${searchQuery}%` : undefined,
      });
      setTrees(data);
    } catch (error: any) {
      toast.error(`加载种树记录失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, statusFilter, searchQuery, page]);

  useEffect(() => {
    fetchStats();
    fetchTrees();
  }, [fetchStats, fetchTrees]);

  const handleMarkClaimed = async (tree: GiftTree) => {
    if (!window.confirm('确定要标记此树为已领取吗？')) return;
    try {
      await adminUpdate(supabase, 'gift_trees', {
        status: 'CLAIMED',
        claimed_at: new Date().toISOString(),
      }, [{ col: 'id', op: 'eq', val: tree.id }]);
      toast.success('已标记为已领取');
      fetchTrees();
      fetchStats();
    } catch (error: any) {
      toast.error(`操作失败: ${error.message}`);
    }
  };

  const handleMarkExpired = async (tree: GiftTree) => {
    if (!window.confirm('确定要标记此树为已过期吗？')) return;
    try {
      await adminUpdate(supabase, 'gift_trees', {
        status: 'EXPIRED',
      }, [{ col: 'id', op: 'eq', val: tree.id }]);
      toast.success('已标记为已过期');
      fetchTrees();
      fetchStats();
    } catch (error: any) {
      toast.error(`操作失败: ${error.message}`);
    }
  };

  const statCards = [
    { label: '总种树数', value: stats.total, icon: '🌳', color: 'bg-green-50' },
    { label: '生长中', value: stats.growing, icon: '🌱', color: 'bg-emerald-50' },
    { label: '已完成', value: stats.completed, icon: '🎉', color: 'bg-blue-50' },
    { label: '已领取', value: stats.claimed, icon: '🎁', color: 'bg-purple-50' },
    { label: '已过期', value: stats.expired, icon: '⏰', color: 'bg-gray-50' },
  ];

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className={stat.color}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{stat.icon}</span>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 种树记录 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle>🌳 种树记录</CardTitle>
          <div className="flex items-center gap-3">
            <Input
              placeholder="搜索用户ID或核销码..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-64"
            />
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">全部状态</option>
              <option value="GROWING">生长中</option>
              <option value="COMPLETED">已完成</option>
              <option value="CLAIMED">已领取</option>
              <option value="EXPIRED">已过期</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : trees.length === 0 ? (
            <EmptyState message="暂无种树记录" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户ID</TableHead>
                    <TableHead>进度</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>里程碑</TableHead>
                    <TableHead>核销码</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>完成时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trees.map((tree) => {
                    const progress = Math.round((tree.current_water / tree.target_water) * 100);
                    const statusInfo = STATUS_LABELS[tree.status] || { label: tree.status, color: 'bg-gray-100 text-gray-500' };
                    return (
                      <TableRow key={tree.id}>
                        <TableCell>
                          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                            {tree.user_id.substring(0, 8)}...
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-accent rounded-full transition-all"
                                style={{ width: `${Math.min(progress, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium">
                              {tree.current_water}/{tree.target_water}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <span title="200滴" className={tree.milestone_200_claimed ? 'opacity-100' : 'opacity-30'}>🪙</span>
                            <span title="500滴" className={tree.milestone_500_claimed ? 'opacity-100' : 'opacity-30'}>🎁</span>
                            <span title="800滴" className={tree.milestone_800_claimed ? 'opacity-100' : 'opacity-30'}>🎟️</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {tree.pickup_code ? (
                            <div>
                              <code className="text-sm font-bold bg-yellow-50 px-2 py-0.5 rounded">
                                {tree.pickup_code}
                              </code>
                              {tree.pickup_expires_at && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  截止: {formatDate(tree.pickup_expires_at)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(tree.created_at)}</TableCell>
                        <TableCell className="text-xs">{formatDate(tree.completed_at)}</TableCell>
                        <TableCell className="text-right space-x-1">
                          {tree.status === 'COMPLETED' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleMarkClaimed(tree)}
                              >
                                标记领取
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleMarkExpired(tree)}
                              >
                                标记过期
                              </Button>
                            </>
                          )}
                          {tree.status === 'GROWING' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleMarkExpired(tree)}
                            >
                              取消
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* 分页 */}
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  第 {page} / {totalPages} 页
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GiftTreeDashboardPage;
