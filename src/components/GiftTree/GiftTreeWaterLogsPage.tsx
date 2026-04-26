/**
 * 希望之树 - 浇水日志页面
 *
 * 管理员可以：
 * - 查看所有浇水记录（任务日志 + 好友助力日志）
 * - 按任务类型、日期筛选
 * - 查看用户行为数据
 *
 * 实际表：
 * gift_tree_task_logs: id, user_id, tree_id, task_code, water_earned, device_id, ip_address, reference_id, metadata, created_at
 * gift_tree_help_logs: id, tree_id, tree_owner_id, helper_id, helper_device_id, helper_ip_address, water_earned, created_at
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

interface TaskLog {
  id: string;
  user_id: string;
  tree_id: string;
  task_code: string;
  water_earned: number;
  device_id: string | null;
  ip_address: string | null;
  reference_id: string | null;
  created_at: string;
}

interface HelpLog {
  id: string;
  tree_id: string;
  tree_owner_id: string;
  helper_id: string;
  helper_device_id: string | null;
  helper_ip_address: string | null;
  water_earned: number;
  created_at: string;
}

const TASK_LABELS: Record<string, string> = {
  DAILY_CHECKIN: '每日签到',
  BROWSE_PRODUCTS: '浏览商品',
  PLAY_LOTTERY: '参与夺宝',
  WALLET_DEPOSIT: '首次充值',
  COMPLETE_ORDER: '完成订单',
  STORE_PICKUP: '门店自提',
  FRIEND_HELP: '好友助力',
  SHARE_APP: '分享应用',
  FIRST_WATER: '首次浇水',
  FIRST_LOTTERY: '首次夺宝',
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

type TabType = 'tasks' | 'helps';

export const GiftTreeWaterLogsPage: React.FC = () => {
  const { supabase } = useSupabase();
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [helpLogs, setHelpLogs] = useState<HelpLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [taskFilter, setTaskFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const LIMIT = 30;

  const fetchTaskLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      const filters: any[] = [];
      if (taskFilter !== 'ALL') {
        filters.push({ col: 'task_code', op: 'eq', val: taskFilter });
      }

      const orFilters = searchQuery
        ? `user_id.ilike.%${searchQuery}%,tree_id.ilike.%${searchQuery}%`
        : undefined;

      const count = await adminCount(supabase, 'gift_tree_task_logs', filters, orFilters);
      setTotalPages(Math.ceil(count / LIMIT) || 1);

      const data = await adminQuery<TaskLog>(supabase, 'gift_tree_task_logs', {
        select: '*',
        filters,
        orderBy: 'created_at',
        orderAsc: false,
        limit: LIMIT,
        offset: (page - 1) * LIMIT,
        orFilters,
      });
      setTaskLogs(data);
    } catch (error: any) {
      toast.error(`加载任务日志失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, taskFilter, searchQuery, page]);

  const fetchHelpLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      const filters: any[] = [];

      const orFilters = searchQuery
        ? `tree_owner_id.ilike.%${searchQuery}%,helper_id.ilike.%${searchQuery}%`
        : undefined;

      const count = await adminCount(supabase, 'gift_tree_help_logs', filters, orFilters);
      setTotalPages(Math.ceil(count / LIMIT) || 1);

      const data = await adminQuery<HelpLog>(supabase, 'gift_tree_help_logs', {
        select: '*',
        filters,
        orderBy: 'created_at',
        orderAsc: false,
        limit: LIMIT,
        offset: (page - 1) * LIMIT,
        orFilters,
      });
      setHelpLogs(data);
    } catch (error: any) {
      toast.error(`加载助力日志失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, searchQuery, page]);

  useEffect(() => {
    if (activeTab === 'tasks') {
      fetchTaskLogs();
    } else {
      fetchHelpLogs();
    }
  }, [activeTab, fetchTaskLogs, fetchHelpLogs]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
    setSearchQuery('');
    setTaskFilter('ALL');
  };

  return (
    <div className="space-y-6">
      {/* Tab 切换 */}
      <div className="flex gap-2">
        <Button
          variant={activeTab === 'tasks' ? 'default' : 'outline'}
          onClick={() => handleTabChange('tasks')}
        >
          💧 任务浇水日志
        </Button>
        <Button
          variant={activeTab === 'helps' ? 'default' : 'outline'}
          onClick={() => handleTabChange('helps')}
        >
          🤝 好友助力日志
        </Button>
      </div>

      {/* 快速统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-blue-50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground">当前页记录数</div>
            <div className="text-2xl font-bold">
              {activeTab === 'tasks' ? taskLogs.length : helpLogs.length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-cyan-50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground">当前页总水滴</div>
            <div className="text-2xl font-bold text-accent">
              {(activeTab === 'tasks' ? taskLogs : helpLogs).reduce((s, l) => s + l.water_earned, 0)} 💧
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 日志列表 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle>
            {activeTab === 'tasks' ? '💧 任务浇水日志' : '🤝 好友助力日志'}
          </CardTitle>
          <div className="flex items-center gap-3">
            <Input
              placeholder={activeTab === 'tasks' ? '搜索用户ID...' : '搜索树主/助力者ID...'}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-56"
            />
            {activeTab === 'tasks' && (
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
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : (activeTab === 'tasks' ? taskLogs.length : helpLogs.length) === 0 ? (
            <EmptyState title="暂无记录" message={activeTab === 'tasks' ? '暂无浇水记录' : '暂无助力记录'} />
          ) : activeTab === 'tasks' ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>用户ID</TableHead>
                    <TableHead>树ID</TableHead>
                    <TableHead>任务</TableHead>
                    <TableHead>水滴</TableHead>
                    <TableHead>设备ID</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taskLogs.map((log) => (
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
                        {log.device_id ? (
                          <code className="text-[10px] text-muted-foreground">
                            {log.device_id.substring(0, 8)}...
                          </code>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {log.ip_address || '-'}
                        </span>
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
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    上一页
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    下一页
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>树主ID</TableHead>
                    <TableHead>助力者ID</TableHead>
                    <TableHead>树ID</TableHead>
                    <TableHead>水滴</TableHead>
                    <TableHead>助力者IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {helpLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                          {log.tree_owner_id.substring(0, 8)}...
                        </code>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-green-50 text-green-700 px-1 py-0.5 rounded">
                          {log.helper_id.substring(0, 8)}...
                        </code>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                          {log.tree_id.substring(0, 8)}...
                        </code>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-accent">+{log.water_earned}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {log.helper_ip_address || '-'}
                        </span>
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
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    上一页
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
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
