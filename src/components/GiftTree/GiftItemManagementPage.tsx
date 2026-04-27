/**
 * 希望之树 - 礼物管理页面
 *
 * 管理员可以：
 * - 查看所有礼物列表
 * - 新增/编辑/上下架礼物
 * - 管理库存、图片、多语言名称/描述
 * - 设置目标水滴数和价值
 *
 * 实际 gift_items 表字段：
 * id, name, name_i18n, description, description_i18n, image_url, image_urls,
 * target_water, stock, reserved_stock, value_tjs, is_active, sort_order, created_at, updated_at
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
import { SingleImageUpload } from '../SingleImageUpload';
import { EmptyState } from '../EmptyState';
import { adminQuery, adminCount, adminInsert, adminUpdate, adminDelete } from '@/lib/adminApi';
import toast from 'react-hot-toast';

interface GiftItem {
  id: string;
  name: string;
  name_i18n: Record<string, string> | null;
  description: string | null;
  description_i18n: Record<string, string> | null;
  image_url: string;
  image_urls: string[] | null;
  target_water: number;
  stock: number;
  reserved_stock: number;
  value_tjs: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const defaultFormData = {
  name: '',
  name_i18n: { zh: '', ru: '', tg: '' } as Record<string, string>,
  description: '',
  description_i18n: { zh: '', ru: '', tg: '' } as Record<string, string>,
  image_url: '',
  target_water: 1000,
  stock: 100,
  reserved_stock: 0,
  value_tjs: 0,
  is_active: true,
  sort_order: 0,
};

const getLocalizedText = (jsonb: any, lang: string = 'zh'): string => {
  if (!jsonb || typeof jsonb !== 'object') return '';
  return jsonb[lang] || jsonb['zh'] || jsonb['en'] || Object.values(jsonb).find(v => typeof v === 'string' && v) as string || '';
};

export const GiftItemManagementPage: React.FC = () => {
  const { supabase } = useSupabase();
  const [items, setItems] = useState<GiftItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<GiftItem | null>(null);
  const [formData, setFormData] = useState(defaultFormData);
  const [isSaving, setIsSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await adminQuery<GiftItem>(supabase, 'gift_items', {
        select: '*',
        orderBy: 'sort_order',
        orderAsc: true,
      });
      setItems(data);
    } catch (error: any) {
      toast.error(`加载礼物列表失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAdd = () => {
    setEditingItem(null);
    setFormData(defaultFormData);
    setShowDialog(true);
  };

  const handleEdit = (item: GiftItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      name_i18n: item.name_i18n || { zh: '', ru: '', tg: '' },
      description: item.description || '',
      description_i18n: item.description_i18n || { zh: '', ru: '', tg: '' },
      image_url: item.image_url || '',
      target_water: item.target_water,
      stock: item.stock,
      reserved_stock: item.reserved_stock,
      value_tjs: item.value_tjs,
      is_active: item.is_active,
      sort_order: item.sort_order,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('请填写礼物名称');
      return;
    }
    if (formData.stock <= 0) {
      toast.error('库存必须大于0');
      return;
    }
    if (formData.target_water <= 0) {
      toast.error('目标水滴数必须大于0');
      return;
    }
    if (formData.reserved_stock < 0) {
      toast.error('预留库存不能为负数');
      return;
    }
    if (formData.reserved_stock > formData.stock) {
      toast.error('预留库存不能超过总库存');
      return;
    }
    // 编辑时：不能将 stock 调低到低于当前 reserved_stock
    if (editingItem && formData.stock < editingItem.reserved_stock) {
      toast.error(`不能将总库存调低到小于当前预留量 (${editingItem.reserved_stock})`);
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        name_i18n: formData.name_i18n,
        description: formData.description.trim() || null,
        description_i18n: formData.description_i18n,
        image_url: formData.image_url,
        target_water: formData.target_water,
        stock: formData.stock,
        reserved_stock: formData.reserved_stock,
        value_tjs: formData.value_tjs,
        is_active: formData.is_active,
        sort_order: formData.sort_order,
      };

      if (editingItem) {
        await adminUpdate(supabase, 'gift_items', payload, [
          { col: 'id', op: 'eq', val: editingItem.id },
        ]);
        toast.success('礼物更新成功');
      } else {
        await adminInsert(supabase, 'gift_items', payload);
        toast.success('礼物创建成功');
      }

      setShowDialog(false);
      fetchItems();
    } catch (error: any) {
      toast.error(`保存失败: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (item: GiftItem) => {
    try {
      await adminUpdate(supabase, 'gift_items', { is_active: !item.is_active }, [
        { col: 'id', op: 'eq', val: item.id },
      ]);
      toast.success(item.is_active ? '已下架' : '已上架');
      fetchItems();
    } catch (error: any) {
      toast.error(`操作失败: ${error.message}`);
    }
  };

  const handleDelete = async (item: GiftItem) => {
    // 检查是否存在占用该礼物的活跃树，防止脱线占用 / FK 外键异常
    let occupied = 0;
    try {
      occupied = await adminCount(supabase, 'gift_trees', [
        { col: 'gift_item_id', op: 'eq', val: item.id },
        { col: 'status', op: 'in', val: 'GROWING,COMPLETED' },
      ]);
    } catch (e) {
      // 查询失败不阻断侍下流程，后续 adminDelete 本身会被 FK 拦住
    }
    if (occupied > 0) {
      toast.error(`存在 ${occupied} 棵正在生长或待领取的树绑定该礼物，请先下架代替，等待领取或过期后再删除。`);
      return;
    }
    if (!window.confirm(`确定要删除礼物「${item.name}」吗？此操作不可恢复。`)) return;
    try {
      await adminDelete(supabase, 'gift_items', [
        { col: 'id', op: 'eq', val: item.id },
      ]);
      toast.success('已删除');
      fetchItems();
    } catch (error: any) {
      toast.error(`删除失败: ${error.message}`);
    }
  };

  // Calculate available stock
  const availableStock = (item: GiftItem) => item.stock - item.reserved_stock;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>🎁 礼物管理</CardTitle>
          <Button onClick={handleAdd}>+ 新增礼物</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="暂无礼物" message="暂无礼物数据，点击上方按钮新增" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">图片</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>目标水滴</TableHead>
                  <TableHead>库存</TableHead>
                  <TableHead>价值(TJS)</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>排序</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-xl">
                          🎁
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {getLocalizedText(item.name_i18n, 'ru')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{item.target_water}</span>
                      <span className="text-muted-foreground text-xs ml-1">💧</span>
                    </TableCell>
                    <TableCell>
                      <span className={availableStock(item) <= 5 ? 'text-red-600 font-bold' : ''}>
                        {availableStock(item)}
                      </span>
                      <span className="text-muted-foreground">/{item.stock}</span>
                      {item.reserved_stock > 0 && (
                        <span className="text-xs text-amber-600 ml-1">
                          ({item.reserved_stock} 预留)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">{item.value_tjs}</span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          item.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {item.is_active ? '上架中' : '已下架'}
                      </span>
                    </TableCell>
                    <TableCell>{item.sort_order}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(item)}>
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(item)}
                      >
                        {item.is_active ? '下架' : '上架'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(item)}
                      >
                        删除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 新增/编辑对话框 */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? '编辑礼物' : '新增礼物'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 基础名称 */}
            <div>
              <Label>礼物名称（内部标识）</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="如：Premium Tea Set"
              />
            </div>

            {/* 多语言名称 */}
            <MultiLanguageInput
              label="多语言名称"
              value={formData.name_i18n}
              onChange={(v) => setFormData({ ...formData, name_i18n: v })}
              placeholder="礼物名称"
            />

            {/* 多语言描述 */}
            <MultiLanguageInput
              label="多语言描述"
              value={formData.description_i18n}
              onChange={(v) => setFormData({ ...formData, description_i18n: v })}
              type="textarea"
              placeholder="礼物描述"
            />

            {/* 图片上传 */}
            <SingleImageUpload
              label="礼物图片"
              bucket="gift-items"
              folder="images"
              imageUrl={formData.image_url}
              onImageUrlChange={(url) => setFormData({ ...formData, image_url: url })}
            />

            {/* 目标水滴数 */}
            <div>
              <Label>目标水滴数（用户需浇灌的总水滴）</Label>
              <Input
                type="number"
                min={100}
                value={formData.target_water}
                onChange={(e) =>
                  setFormData({ ...formData, target_water: parseInt(e.target.value) || 0 })
                }
                placeholder="1000"
              />
              <p className="text-xs text-muted-foreground mt-1">建议设置为 1000</p>
            </div>

            {/* 库存 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>总库存</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.stock}
                  onChange={(e) =>
                    setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label>已预留库存</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.reserved_stock}
                  onChange={(e) =>
                    setFormData({ ...formData, reserved_stock: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  可用: {formData.stock - formData.reserved_stock}
                </p>
              </div>
            </div>

            {/* 价值 */}
            <div>
              <Label>价值 (TJS)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={formData.value_tjs}
                onChange={(e) =>
                  setFormData({ ...formData, value_tjs: parseFloat(e.target.value) || 0 })
                }
              />
            </div>

            {/* 排序 */}
            <div>
              <Label>排序权重（越小越靠前）</Label>
              <Input
                type="number"
                value={formData.sort_order}
                onChange={(e) =>
                  setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })
                }
              />
            </div>

            {/* 上架开关 */}
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
              />
              <Label>上架</Label>
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

export default GiftItemManagementPage;
