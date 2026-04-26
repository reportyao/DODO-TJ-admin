/**
 * 希望之树 - 浇水日志页面
 *
 * 管理员可以：
 * - 查看所有浇水记录
 * - 按任务类型、日期筛选
 * - 查看用户行为数据
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { EmptyState } from '../EmptyState';
import { adminQuery, adminCount } from '@/lib/adminApi';
import toast from 'react-hot-toast';

interface WaterLog {
  id: string;
  tree_id: string;
  user_id: string;
  task_code: string;
  water_earned: number;
  helper_id: string | null;
  created_at: string;
}

const TASK_LABELS: Record<string, string> = {
  DAILY_CHECKIN: '每日签到',
  BROWSE_PRODUCTS: '浏览商品',
  PLAY_LOTTERY: '参与夺宝',
  WALLET_DEPOSIT: '首次充值',
  COMPLETE_ORDER: '完成订单',
  FRIEND_HELP: '好友助力',
  SHARE_APP: '分享应用',
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const GiftTreeWaterLogsPage: React.FC = () => {
  const { supabase } = useSupabase();
  const [logs, setLogs] = useState<WaterLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const LIMIT = 30;

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      const filters: any[] = [];
      if (taskFilter !== 'ALL') {
        filters.push({ col: 'task_code', op: 'eq', val: taskFilter });
      }

      const orFilters = searchQuery
        ? `user_id.ilike.%${searchQuery}%,tree_id.ilike.%${searchQuery}%`
        : undefined;

      const count = await adminCount(supabase, 'gift_tree_water_logs', filters, orFilters);
      setTotalPages(Math.ceil(count / LIMIT) || 1);

      const data = await adminQuery<WaterLog>(supabase, 'gift_tree_water_logs', {
        select: '*',
        filters,
        orderBy: 'created_at',
        orderAsc: false,
        limit: LIMIT,
        offset: (page - 1) * LIMIT,
        orFilters,
      });
      setLogs(data);
    } catch (error: any) {
      toast.error(`加载浇水日志失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, taskFilter, searchQuery, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // 统计今日浇水量
  const todayWater = logs
    .filter((l) => {
      const today = new Date().toISOString().split('T')[0];
      return l.created_at.startsWith(today);
    })
    .reduce((sum, l) => sum + l.water_earned, 0);

  return (
    <div className="space-y-6">
      {/* 快速统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-blue-50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground">当前页记录数</div>
            <div className="text-2xl font-bold">{logs.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-cyan-50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground">当前页总水滴</div>
            <div className="text-2xl font-bold text-accent">
              {logs.reduce((s, l) => s + l.water_earned, 0)} 💧
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 日志列表 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle>💧 浇水日志</CardTitle>
          <div className="flex items-center gap-3">
            <Input
              placeholder="搜索用户ID..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-56"
            />
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={taskFilter}
              onChange={(e) => {
                setTaskFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">全部任务</option>
              {Object.entries(TASK_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : logs.length === 0 ? (
            <EmptyState message="暂无浇水记录" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>用户ID</TableHead>
                    <TableHead>树ID</TableHead>
                    <TableHead>任务</TableHead>
                    <TableHead>水滴</TableHead>
                    <TableHead>助力者</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                          {log.user_id.substring(0, 8)}...
                        </code>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                          {log.tree_id.substring(0, 8)}...
                        </code>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                          {TASK_LABELS[log.task_code] || log.task_code}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-accent">+{log.water_earned}</span>
                      </TableCell>
                      <TableCell>
                        {log.helper_id ? (
                          <code className="text-xs bg-green-50 text-green-700 px-1 py-0.5 rounded">
                            {log.helper_id.substring(0, 8)}...
                          </code>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
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

export default GiftTreeWaterLogsPage;
