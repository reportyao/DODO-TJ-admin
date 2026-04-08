/**
 * 首页分类管理页面
 *
 * 管理首页金刚区的一级分类（homepage_categories）。
 * 支持：列表展示、创建、编辑、删除、排序、启用/停用。
 *
 * 与 BannerManagementPage 保持一致的 CRUD 模式。
 */
import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Eye, EyeOff, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import toast from 'react-hot-toast';
import type { DbHomepageCategoryRow, I18nText } from '../types/homepage';

// ============================================================
// 图标选项
// ============================================================
const ICON_OPTIONS = [
  { value: 'electronics', label: '📱 电子数码' },
  { value: 'home_living', label: '🏠 家居生活' },
  { value: 'beauty_care', label: '💄 美妆护理' },
  { value: 'food_drink', label: '🍽️ 食品饮料' },
  { value: 'fashion', label: '👗 服饰鞋包' },
  { value: 'mother_baby', label: '👶 母婴亲子' },
  { value: 'sports_outdoor', label: '⚽ 运动户外' },
  { value: 'gifts_festival', label: '🎁 礼品节庆' },
  { value: 'other', label: '📦 其他' },
];

const COLOR_OPTIONS = [
  { value: 'orange', label: '🟠 橙色' },
  { value: 'blue', label: '🔵 蓝色' },
  { value: 'green', label: '🟢 绿色' },
  { value: 'red', label: '🔴 红色' },
  { value: 'purple', label: '🟣 紫色' },
  { value: 'pink', label: '🩷 粉色' },
  { value: 'yellow', label: '🟡 黄色' },
  { value: 'gray', label: '⚪ 灰色' },
];

// ============================================================
// 表单默认值
// ============================================================
const defaultFormData = {
  code: '',
  name_zh: '',
  name_ru: '',
  name_tg: '',
  icon_key: 'other',
  color_token: 'orange',
  sort_order: 0,
  is_active: true,
  is_fixed: false,
};

export default function HomepageCategoryManagementPage() {
  const { supabase } = useSupabase();
  const [categories, setCategories] = useState<DbHomepageCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DbHomepageCategoryRow | null>(null);
  const [formData, setFormData] = useState(defaultFormData);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('homepage_categories')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setCategories(data || []);
    } catch (error: any) {
      console.error('Failed to fetch categories:', error);
      toast.error('获取分类列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code.trim()) {
      toast.error('分类编码不能为空');
      return;
    }
    if (!formData.name_zh.trim()) {
      toast.error('中文名称不能为空');
      return;
    }

    try {
      const nameI18n: I18nText = {};
      if (formData.name_zh.trim()) nameI18n.zh = formData.name_zh.trim();
      if (formData.name_ru.trim()) nameI18n.ru = formData.name_ru.trim();
      if (formData.name_tg.trim()) nameI18n.tg = formData.name_tg.trim();

      const saveData = {
        code: formData.code.trim(),
        name_i18n: nameI18n,
        icon_key: formData.icon_key,
        color_token: formData.color_token,
        sort_order: formData.sort_order,
        is_active: formData.is_active,
        is_fixed: formData.is_fixed,
        updated_at: new Date().toISOString(),
      };

      if (editingItem) {
        const { error } = await supabase
          .from('homepage_categories')
          .update(saveData)
          .eq('id', editingItem.id);
        if (error) throw error;
        toast.success('分类更新成功');
      } else {
        const { error } = await supabase
          .from('homepage_categories')
          .insert([saveData]);
        if (error) throw error;
        toast.success('分类创建成功');
      }

      setShowModal(false);
      resetForm();
      fetchCategories();
    } catch (error: any) {
      console.error('Failed to save category:', error);
      toast.error('保存失败: ' + error.message);
    }
  };

  const handleEdit = (item: DbHomepageCategoryRow) => {
    setEditingItem(item);
    const i18n = item.name_i18n || {};
    setFormData({
      code: item.code,
      name_zh: i18n.zh || '',
      name_ru: i18n.ru || '',
      name_tg: i18n.tg || '',
      icon_key: item.icon_key || 'other',
      color_token: item.color_token || 'orange',
      sort_order: item.sort_order,
      is_active: item.is_active,
      is_fixed: item.is_fixed,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个分类吗？关联的商品分类关系也会被删除。')) return;
    try {
      const { error } = await supabase
        .from('homepage_categories')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('分类删除成功');
      fetchCategories();
    } catch (error: any) {
      console.error('Failed to delete category:', error);
      toast.error('删除失败: ' + error.message);
    }
  };

  const toggleActive = async (item: DbHomepageCategoryRow) => {
    try {
      const { error } = await supabase
        .from('homepage_categories')
        .update({ is_active: !item.is_active })
        .eq('id', item.id);
      if (error) throw error;
      toast.success(item.is_active ? '分类已停用' : '分类已启用');
      fetchCategories();
    } catch (error: any) {
      toast.error('状态切换失败');
    }
  };

  const moveOrder = async (item: DbHomepageCategoryRow, direction: 'up' | 'down') => {
    const currentIndex = categories.findIndex(c => c.id === item.id);
    if (
      (direction === 'up' && currentIndex === 0) ||
      (direction === 'down' && currentIndex === categories.length - 1)
    ) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const target = categories[targetIndex];

    try {
      const { error: err1 } = await supabase
        .from('homepage_categories')
        .update({ sort_order: target.sort_order })
        .eq('id', item.id);
      if (err1) throw err1;

      const { error: err2 } = await supabase
        .from('homepage_categories')
        .update({ sort_order: item.sort_order })
        .eq('id', target.id);
      if (err2) throw err2;

      toast.success('排序已更新');
      fetchCategories();
    } catch (error: any) {
      toast.error('排序更新失败');
      fetchCategories();
    }
  };

  const resetForm = () => {
    setFormData({ ...defaultFormData, sort_order: categories.length });
    setEditingItem(null);
  };

  const getIconEmoji = (key: string) => {
    const found = ICON_OPTIONS.find(o => o.value === key);
    return found ? found.label.split(' ')[0] : '📦';
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">首页分类管理</h1>
        <div className="flex gap-2">
          <button
            onClick={fetchCategories}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600"
          >
            <Plus className="w-5 h-5" />
            创建分类
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-sm text-gray-500">总分类数</div>
          <div className="text-2xl font-bold text-gray-800">{categories.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-sm text-gray-500">已启用</div>
          <div className="text-2xl font-bold text-green-600">
            {categories.filter(c => c.is_active).length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-sm text-gray-500">固定分类</div>
          <div className="text-2xl font-bold text-blue-600">
            {categories.filter(c => c.is_fixed).length}
          </div>
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-12">加载中...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 text-gray-500">暂无分类</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">排序</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">图标</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">编码</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">名称 (中/俄/塔)</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">状态</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">固定</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {categories.map((item, index) => {
                const i18n = item.name_i18n || {};
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveOrder(item, 'up')}
                          disabled={index === 0}
                          className="p-1 bg-gray-100 rounded disabled:opacity-30 hover:bg-gray-200"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <span className="text-sm text-gray-600 w-6 text-center">{item.sort_order}</span>
                        <button
                          onClick={() => moveOrder(item, 'down')}
                          disabled={index === categories.length - 1}
                          className="p-1 bg-gray-100 rounded disabled:opacity-30 hover:bg-gray-200"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xl">{getIconEmoji(item.icon_key)}</td>
                    <td className="px-4 py-3">
                      <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">{item.code}</code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-800">{i18n.zh || '-'}</div>
                      <div className="text-xs text-gray-500">{i18n.ru || '-'} / {i18n.tg || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(item)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                          item.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {item.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {item.is_active ? '启用' : '停用'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {item.is_fixed && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">固定</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs hover:bg-blue-200"
                        >
                          <Edit className="w-3 h-3" />
                          编辑
                        </button>
                        {!item.is_fixed && (
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-200"
                          >
                            <Trash2 className="w-3 h-3" />
                            删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 创建/编辑模态框 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingItem ? '编辑分类' : '创建分类'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">分类编码 *</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="如: electronics"
                    disabled={!!editingItem?.is_fixed}
                  />
                </div>

                {/* 三语名称 */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">分类名称（三语）</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇨🇳 中文 *</label>
                      <input
                        type="text"
                        value={formData.name_zh}
                        onChange={(e) => setFormData({ ...formData, name_zh: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                        placeholder="电子数码"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇷🇺 俄语</label>
                      <input
                        type="text"
                        value={formData.name_ru}
                        onChange={(e) => setFormData({ ...formData, name_ru: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                        placeholder="Электроника"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇹🇯 塔吉克语</label>
                      <input
                        type="text"
                        value={formData.name_tg}
                        onChange={(e) => setFormData({ ...formData, name_tg: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                        placeholder="Электроника"
                      />
                    </div>
                  </div>
                </div>

                {/* 图标和颜色 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">图标</label>
                    <select
                      value={formData.icon_key}
                      onChange={(e) => setFormData({ ...formData, icon_key: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    >
                      {ICON_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">颜色</label>
                    <select
                      value={formData.color_token}
                      onChange={(e) => setFormData({ ...formData, color_token: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    >
                      {COLOR_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 排序和状态 */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">排序</label>
                    <input
                      type="number"
                      value={formData.sort_order}
                      onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">状态</label>
                    <select
                      value={formData.is_active ? 'active' : 'inactive'}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'active' })}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="active">启用</option>
                      <option value="inactive">停用</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">固定</label>
                    <select
                      value={formData.is_fixed ? 'yes' : 'no'}
                      onChange={(e) => setFormData({ ...formData, is_fixed: e.target.value === 'yes' })}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="no">否</option>
                      <option value="yes">是</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-4">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); resetForm(); }}
                    className="px-4 py-2 border rounded hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
                  >
                    {editingItem ? '更新' : '创建'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
