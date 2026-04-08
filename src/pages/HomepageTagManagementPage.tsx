/**
 * 首页标签管理页面
 *
 * 管理首页场景化标签（homepage_tags）。
 * 支持：列表展示、按标签组筛选、创建、编辑、删除、启用/停用。
 *
 * 与 BannerManagementPage / HomepageCategoryManagementPage 保持一致的 CRUD 模式。
 */
import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Eye, EyeOff, RefreshCw, Filter } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import toast from 'react-hot-toast';
import type { DbHomepageTagRow, TagGroup, I18nText } from '../types/homepage';

// ============================================================
// 标签组配置
// ============================================================
const TAG_GROUP_OPTIONS: { value: TagGroup; label: string; color: string }[] = [
  { value: 'scene', label: '场景', color: 'bg-blue-100 text-blue-700' },
  { value: 'audience', label: '人群', color: 'bg-purple-100 text-purple-700' },
  { value: 'festival', label: '节日', color: 'bg-red-100 text-red-700' },
  { value: 'style', label: '风格', color: 'bg-pink-100 text-pink-700' },
  { value: 'function', label: '功能', color: 'bg-green-100 text-green-700' },
  { value: 'local', label: '本地化', color: 'bg-yellow-100 text-yellow-700' },
];

const getGroupBadge = (group: TagGroup) => {
  const opt = TAG_GROUP_OPTIONS.find(o => o.value === group);
  return opt || { label: group, color: 'bg-gray-100 text-gray-700' };
};

// ============================================================
// 表单默认值
// ============================================================
const defaultFormData = {
  tag_group: 'scene' as TagGroup,
  code: '',
  name_zh: '',
  name_ru: '',
  name_tg: '',
  desc_zh: '',
  desc_ru: '',
  desc_tg: '',
  is_active: true,
};

export default function HomepageTagManagementPage() {
  const { supabase } = useSupabase();
  const [tags, setTags] = useState<DbHomepageTagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DbHomepageTagRow | null>(null);
  const [formData, setFormData] = useState(defaultFormData);
  const [filterGroup, setFilterGroup] = useState<TagGroup | 'all'>('all');

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('homepage_tags')
        .select('*')
        .order('tag_group', { ascending: true })
        .order('code', { ascending: true });

      if (error) throw error;
      setTags(data || []);
    } catch (error: any) {
      console.error('Failed to fetch tags:', error);
      toast.error('获取标签列表失败');
    } finally {
      setLoading(false);
    }
  };

  const filteredTags = filterGroup === 'all'
    ? tags
    : tags.filter(t => t.tag_group === filterGroup);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code.trim()) {
      toast.error('标签编码不能为空');
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

      const descI18n: I18nText = {};
      if (formData.desc_zh.trim()) descI18n.zh = formData.desc_zh.trim();
      if (formData.desc_ru.trim()) descI18n.ru = formData.desc_ru.trim();
      if (formData.desc_tg.trim()) descI18n.tg = formData.desc_tg.trim();

      const saveData = {
        tag_group: formData.tag_group,
        code: formData.code.trim(),
        name_i18n: nameI18n,
        description_i18n: Object.keys(descI18n).length > 0 ? descI18n : null,
        is_active: formData.is_active,
        updated_at: new Date().toISOString(),
      };

      if (editingItem) {
        const { error } = await supabase
          .from('homepage_tags')
          .update(saveData)
          .eq('id', editingItem.id);
        if (error) throw error;
        toast.success('标签更新成功');
      } else {
        const { error } = await supabase
          .from('homepage_tags')
          .insert([saveData]);
        if (error) throw error;
        toast.success('标签创建成功');
      }

      setShowModal(false);
      resetForm();
      fetchTags();
    } catch (error: any) {
      console.error('Failed to save tag:', error);
      toast.error('保存失败: ' + error.message);
    }
  };

  const handleEdit = (item: DbHomepageTagRow) => {
    setEditingItem(item);
    const name = item.name_i18n || {};
    const desc = item.description_i18n || {};
    setFormData({
      tag_group: item.tag_group,
      code: item.code,
      name_zh: name.zh || '',
      name_ru: name.ru || '',
      name_tg: name.tg || '',
      desc_zh: desc.zh || '',
      desc_ru: desc.ru || '',
      desc_tg: desc.tg || '',
      is_active: item.is_active,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个标签吗？关联的商品标签关系也会被删除。')) return;
    try {
      const { error } = await supabase
        .from('homepage_tags')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('标签删除成功');
      fetchTags();
    } catch (error: any) {
      toast.error('删除失败: ' + error.message);
    }
  };

  const toggleActive = async (item: DbHomepageTagRow) => {
    try {
      const { error } = await supabase
        .from('homepage_tags')
        .update({ is_active: !item.is_active })
        .eq('id', item.id);
      if (error) throw error;
      toast.success(item.is_active ? '标签已停用' : '标签已启用');
      fetchTags();
    } catch (error: any) {
      toast.error('状态切换失败');
    }
  };

  const resetForm = () => {
    setFormData(defaultFormData);
    setEditingItem(null);
  };

  // 按组统计
  const groupCounts = TAG_GROUP_OPTIONS.map(g => ({
    ...g,
    count: tags.filter(t => t.tag_group === g.value).length,
  }));

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">标签管理</h1>
        <div className="flex gap-2">
          <button
            onClick={fetchTags}
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
            创建标签
          </button>
        </div>
      </div>

      {/* 标签组统计 + 筛选 */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilterGroup('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filterGroup === 'all'
              ? 'bg-gray-800 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          全部 ({tags.length})
        </button>
        {groupCounts.map(g => (
          <button
            key={g.value}
            onClick={() => setFilterGroup(g.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterGroup === g.value
                ? 'bg-gray-800 text-white'
                : `${g.color} hover:opacity-80`
            }`}
          >
            {g.label} ({g.count})
          </button>
        ))}
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-12">加载中...</div>
      ) : filteredTags.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {filterGroup === 'all' ? '暂无标签' : '该分组暂无标签'}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">标签组</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">编码</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">名称 (中/俄/塔)</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">描述</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">状态</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredTags.map(item => {
                const name = item.name_i18n || {};
                const desc = item.description_i18n || {};
                const badge = getGroupBadge(item.tag_group);
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">{item.code}</code>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-800">{name.zh || '-'}</div>
                      <div className="text-xs text-gray-500">{name.ru || '-'} / {name.tg || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-500 max-w-[200px] truncate">
                        {desc.zh || '-'}
                      </div>
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
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs hover:bg-blue-200"
                        >
                          <Edit className="w-3 h-3" />
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-200"
                        >
                          <Trash2 className="w-3 h-3" />
                          删除
                        </button>
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
                {editingItem ? '编辑标签' : '创建标签'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">标签组 *</label>
                    <select
                      value={formData.tag_group}
                      onChange={(e) => setFormData({ ...formData, tag_group: e.target.value as TagGroup })}
                      className="w-full border rounded px-3 py-2"
                    >
                      {TAG_GROUP_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">编码 *</label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                      placeholder="如: family_gathering"
                    />
                  </div>
                </div>

                {/* 三语名称 */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">标签名称（三语）</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇨🇳 中文 *</label>
                      <input
                        type="text"
                        value={formData.name_zh}
                        onChange={(e) => setFormData({ ...formData, name_zh: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                        placeholder="家庭聚会"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇷🇺 俄语</label>
                      <input
                        type="text"
                        value={formData.name_ru}
                        onChange={(e) => setFormData({ ...formData, name_ru: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                        placeholder="Семейная встреча"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇹🇯 塔吉克语</label>
                      <input
                        type="text"
                        value={formData.name_tg}
                        onChange={(e) => setFormData({ ...formData, name_tg: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                        placeholder="Ҷамъомади оилавӣ"
                      />
                    </div>
                  </div>
                </div>

                {/* 三语描述 */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">描述（三语，可选）</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇨🇳 中文</label>
                      <textarea
                        value={formData.desc_zh}
                        onChange={(e) => setFormData({ ...formData, desc_zh: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                        rows={2}
                        placeholder="适用于家庭聚会场景的商品"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇷🇺 俄语</label>
                      <textarea
                        value={formData.desc_ru}
                        onChange={(e) => setFormData({ ...formData, desc_ru: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇹🇯 塔吉克语</label>
                      <textarea
                        value={formData.desc_tg}
                        onChange={(e) => setFormData({ ...formData, desc_tg: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                        rows={2}
                      />
                    </div>
                  </div>
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
