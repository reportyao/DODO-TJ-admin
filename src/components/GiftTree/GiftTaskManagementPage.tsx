/**
 * 希望之树 - 任务配置管理页面
 *
 * 管理员可以：
 * - 查看/编辑所有任务配置
 * - 调整任务奖励水滴数、每日上限
 * - 启用/禁用任务
 * - 管理任务分类和排序
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { MultiLanguageInput } from '../MultiLanguageInput';
import { EmptyState } from '../EmptyState';
import { adminQuery, adminUpdate, adminInsert } from '@/lib/adminApi';
import toast from 'react-hot-toast';

interface GiftTreeTask {
  id: string;
  task_code: string;
  title_i18n: Record<string, string> | null;
  description_i18n: Record<string, string> | null;
  category: string;
  reward_water: number;
  daily_limit: number;
  action_route: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

const TASK_ICONS: Record<string, string> = {
  DAILY_CHECKIN: '📅',
  BROWSE_PRODUCTS: '👁️',
  PLAY_LOTTERY: '🎲',
  WALLET_DEPOSIT: '💰',
  COMPLETE_ORDER: '🛍️',
  FRIEND_HELP: '🤝',
  SHARE_APP: '📤',
};

const CATEGORY_LABELS: Record<string, string> = {
  DAILY: '每日任务',
  ONETIME: '一次性任务',
  SOCIAL: '社交任务',
};

const getLocalizedText = (jsonb: any, lang: string = 'zh'): string => {
  if (!jsonb || typeof jsonb !== 'object') return '';
  return jsonb[lang] || jsonb['zh'] || jsonb['en'] || Object.values(jsonb).find(v => typeof v === 'string' && v) as string || '';
};

export const GiftTaskManagementPage: React.FC = () => {
  const { supabase } = useSupabase();
  const [tasks, setTasks] = useState<GiftTreeTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<GiftTreeTask | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    task_code: '',
    title_i18n: { zh: '', ru: '', tg: '' } as Record<string, string>,
    description_i18n: { zh: '', ru: '', tg: '' } as Record<string, string>,
    category: 'DAILY',
    reward_water: 5,
    daily_limit: 1,
    action_route: '',
    is_active: true,
    sort_order: 0,
  });

  const fetchTasks = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await adminQuery<GiftTreeTask>(supabase, 'gift_tree_tasks', {
        select: '*',
        orderBy: 'sort_order',
        orderAsc: true,
      });
      setTasks(data);
    } catch (error: any) {
      toast.error(`加载任务列表失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleEdit = (task: GiftTreeTask) => {
    setEditingTask(task);
    setFormData({
      task_code: task.task_code,
      title_i18n: task.title_i18n || { zh: '', ru: '', tg: '' },
      description_i18n: task.description_i18n || { zh: '', ru: '', tg: '' },
      category: task.category,
      reward_water: task.reward_water,
      daily_limit: task.daily_limit,
      action_route: task.action_route || '',
      is_active: task.is_active,
      sort_order: task.sort_order,
    });
    setShowDialog(true);
  };

  const handleAdd = () => {
    setEditingTask(null);
    setFormData({
      task_code: '',
      title_i18n: { zh: '', ru: '', tg: '' },
      description_i18n: { zh: '', ru: '', tg: '' },
      category: 'DAILY',
      reward_water: 5,
      daily_limit: 1,
      action_route: '',
      is_active: true,
      sort_order: tasks.length,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.task_code.trim()) {
      toast.error('请填写任务代码');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        task_code: formData.task_code.trim().toUpperCase(),
        title_i18n: formData.title_i18n,
        description_i18n: formData.description_i18n,
        category: formData.category,
        reward_water: formData.reward_water,
        daily_limit: formData.daily_limit,
        action_route: formData.action_route || null,
        is_active: formData.is_active,
        sort_order: formData.sort_order,
      };

      if (editingTask) {
        await adminUpdate(supabase, 'gift_tree_tasks', payload, [
          { col: 'id', op: 'eq', val: editingTask.id },
        ]);
        toast.success('任务更新成功');
      } else {
        await adminInsert(supabase, 'gift_tree_tasks', payload);
        toast.success('任务创建成功');
      }

      setShowDialog(false);
      fetchTasks();
    } catch (error: any) {
      toast.error(`保存失败: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (task: GiftTreeTask) => {
    try {
      await adminUpdate(supabase, 'gift_tree_tasks', { is_active: !task.is_active }, [
        { col: 'id', op: 'eq', val: task.id },
      ]);
      toast.success(task.is_active ? '已禁用' : '已启用');
      fetchTasks();
    } catch (error: any) {
      toast.error(`操作失败: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>📋 任务配置</CardTitle>
          <Button onClick={handleAdd}>+ 新增任务</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : tasks.length === 0 ? (
            <EmptyState message="暂无任务配置" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>任务代码</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>奖励水滴</TableHead>
                  <TableHead>每日上限</TableHead>
                  <TableHead>跳转路由</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="text-xl">
                      {TASK_ICONS[task.task_code] || '📋'}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        {task.task_code}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{getLocalizedText(task.title_i18n)}</div>
                      <div className="text-xs text-muted-foreground">
                        {getLocalizedText(task.title_i18n, 'ru')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        {CATEGORY_LABELS[task.category] || task.category}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-accent">+{task.reward_water}</span>
                    </TableCell>
                    <TableCell>{task.daily_limit}次/天</TableCell>
                    <TableCell>
                      {task.action_route ? (
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                          {task.action_route}
                        </code>
                      ) : (
                        <span className="text-muted-foreground text-xs">无</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          task.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {task.is_active ? '启用' : '禁用'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(task)}>
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(task)}
                      >
                        {task.is_active ? '禁用' : '启用'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 编辑对话框 */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? '编辑任务' : '新增任务'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>任务代码（英文大写，如 DAILY_CHECKIN）</Label>
              <Input
                value={formData.task_code}
                onChange={(e) =>
                  setFormData({ ...formData, task_code: e.target.value.toUpperCase() })
                }
                placeholder="DAILY_CHECKIN"
                disabled={!!editingTask}
              />
            </div>

            <MultiLanguageInput
              label="任务名称"
              value={formData.title_i18n}
              onChange={(v) => setFormData({ ...formData, title_i18n: v })}
              placeholder="如：每日签到"
            />

            <MultiLanguageInput
              label="任务描述"
              value={formData.description_i18n}
              onChange={(v) => setFormData({ ...formData, description_i18n: v })}
              type="textarea"
              placeholder="任务描述"
            />

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>分类</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="DAILY">每日任务</option>
                  <option value="ONETIME">一次性任务</option>
                  <option value="SOCIAL">社交任务</option>
                </select>
              </div>
              <div>
                <Label>奖励水滴</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.reward_water}
                  onChange={(e) =>
                    setFormData({ ...formData, reward_water: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
              <div>
                <Label>每日上限（次）</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.daily_limit}
                  onChange={(e) =>
                    setFormData({ ...formData, daily_limit: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
            </div>

            <div>
              <Label>跳转路由（可选，如 /lottery）</Label>
              <Input
                value={formData.action_route}
                onChange={(e) => setFormData({ ...formData, action_route: e.target.value })}
                placeholder="/lottery"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>排序权重</Label>
                <Input
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) =>
                    setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                  />
                  <Label>启用</Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GiftTaskManagementPage;
