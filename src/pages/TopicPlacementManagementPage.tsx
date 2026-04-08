/**
 * 专题投放管理页面
 *
 * 管理专题在首页 Feed 流中的投放位置（topic_placements）。
 * 支持：列表展示、创建、编辑、删除、启用/停用、排序。
 *
 * 与 BannerManagementPage 保持一致的 CRUD 模式。
 */
import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Eye, EyeOff, RefreshCw, ArrowUp, ArrowDown, X } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import { SingleImageUpload } from '@/components/SingleImageUpload';
import toast from 'react-hot-toast';
import type { DbTopicPlacementRow, DbHomepageTopicRow, I18nText } from '../types/homepage';

// ============================================================
// 常量
// ============================================================
const PLACEMENT_OPTIONS = [
  { value: 'home_feed', label: '首页 Feed 流' },
  { value: 'category_feed', label: '分类 Feed 流' },
  { value: 'search_result', label: '搜索结果' },
];

const CARD_VARIANT_OPTIONS = [
  { value: 'hero', label: 'Hero 大卡' },
  { value: 'standard', label: '标准卡片' },
  { value: 'mini', label: '迷你卡片' },
  { value: 'banner', label: 'Banner 横幅' },
];

// ============================================================
// 表单默认值
// ============================================================
const defaultFormData = {
  topic_id: '',
  placement_name: 'home_feed',
  card_variant_name: 'standard',
  title_zh: '', title_ru: '', title_tg: '',
  subtitle_zh: '', subtitle_ru: '', subtitle_tg: '',
  cover_image_default: '',
  cover_image_zh: '', cover_image_ru: '', cover_image_tg: '',
  feed_position: 3,
  sort_order: 0,
  is_active: true,
  start_time: '',
  end_time: '',
};

export default function TopicPlacementManagementPage() {
  const { supabase } = useSupabase();
  const [placements, setPlacements] = useState<DbTopicPlacementRow[]>([]);
  const [topics, setTopics] = useState<DbHomepageTopicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DbTopicPlacementRow | null>(null);
  const [formData, setFormData] = useState(defaultFormData);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [placementsRes, topicsRes] = await Promise.all([
        supabase.from('topic_placements').select('*').order('sort_order', { ascending: true }),
        supabase.from('homepage_topics').select('id, slug, title_i18n, status').order('updated_at', { ascending: false }),
      ]);

      if (placementsRes.error) throw placementsRes.error;
      if (topicsRes.error) throw topicsRes.error;

      setPlacements(placementsRes.data || []);
      setTopics(topicsRes.data || []);
    } catch (error: any) {
      console.error('Failed to fetch data:', error);
      toast.error('获取投放列表失败');
    } finally {
      setLoading(false);
    }
  };

  const getTopicTitle = (topicId: string): string => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return topicId.slice(0, 8) + '...';
    const i18n = topic.title_i18n as I18nText;
    return i18n?.zh || topic.slug || topicId.slice(0, 8);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.topic_id) {
      toast.error('请选择关联专题');
      return;
    }

    try {
      const buildI18n = (zh: string, ru: string, tg: string): I18nText | null => {
        const obj: I18nText = {};
        if (zh.trim()) obj.zh = zh.trim();
        if (ru.trim()) obj.ru = ru.trim();
        if (tg.trim()) obj.tg = tg.trim();
        return Object.keys(obj).length > 0 ? obj : null;
      };

      const saveData = {
        topic_id: formData.topic_id,
        placement_name: formData.placement_name,
        card_variant_name: formData.card_variant_name || null,
        title_i18n: buildI18n(formData.title_zh, formData.title_ru, formData.title_tg),
        subtitle_i18n: buildI18n(formData.subtitle_zh, formData.subtitle_ru, formData.subtitle_tg),
        cover_image_default: formData.cover_image_default || null,
        cover_image_zh: formData.cover_image_zh || null,
        cover_image_ru: formData.cover_image_ru || null,
        cover_image_tg: formData.cover_image_tg || null,
        feed_position: formData.feed_position,
        sort_order: formData.sort_order,
        is_active: formData.is_active,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        updated_at: new Date().toISOString(),
      };

      if (editingItem) {
        const { error } = await supabase
          .from('topic_placements')
          .update(saveData)
          .eq('id', editingItem.id);
        if (error) throw error;
        toast.success('投放更新成功');
      } else {
        const { error } = await supabase
          .from('topic_placements')
          .insert([saveData]);
        if (error) throw error;
        toast.success('投放创建成功');
      }

      setShowModal(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Failed to save placement:', error);
      toast.error('保存失败: ' + error.message);
    }
  };

  const handleEdit = (item: DbTopicPlacementRow) => {
    setEditingItem(item);
    const title = (item.title_i18n as I18nText) || {};
    const subtitle = (item.subtitle_i18n as I18nText) || {};
    setFormData({
      topic_id: item.topic_id,
      placement_name: item.placement_name,
      card_variant_name: item.card_variant_name || 'standard',
      title_zh: title.zh || '', title_ru: title.ru || '', title_tg: title.tg || '',
      subtitle_zh: subtitle.zh || '', subtitle_ru: subtitle.ru || '', subtitle_tg: subtitle.tg || '',
      cover_image_default: item.cover_image_default || '',
      cover_image_zh: item.cover_image_zh || '',
      cover_image_ru: item.cover_image_ru || '',
      cover_image_tg: item.cover_image_tg || '',
      feed_position: item.feed_position,
      sort_order: item.sort_order,
      is_active: item.is_active,
      start_time: item.start_time || '',
      end_time: item.end_time || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个投放吗？')) return;
    try {
      const { error } = await supabase.from('topic_placements').delete().eq('id', id);
      if (error) throw error;
      toast.success('投放删除成功');
      fetchData();
    } catch (error: any) {
      toast.error('删除失败: ' + error.message);
    }
  };

  const toggleActive = async (item: DbTopicPlacementRow) => {
    try {
      const { error } = await supabase
        .from('topic_placements')
        .update({ is_active: !item.is_active })
        .eq('id', item.id);
      if (error) throw error;
      toast.success(item.is_active ? '投放已停用' : '投放已启用');
      fetchData();
    } catch (error: any) {
      toast.error('状态切换失败');
    }
  };

  const resetForm = () => {
    setFormData({ ...defaultFormData, sort_order: placements.length });
    setEditingItem(null);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">投放管理</h1>
        <div className="flex gap-2">
          <button onClick={fetchData}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200">
            <RefreshCw className="w-4 h-4" /> 刷新
          </button>
          <button onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600">
            <Plus className="w-5 h-5" /> 创建投放
          </button>
        </div>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-sm text-gray-500">总投放数</div>
          <div className="text-2xl font-bold text-gray-800">{placements.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-sm text-gray-500">已启用</div>
          <div className="text-2xl font-bold text-green-600">
            {placements.filter(p => p.is_active).length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-sm text-gray-500">关联专题数</div>
          <div className="text-2xl font-bold text-blue-600">
            {new Set(placements.map(p => p.topic_id)).size}
          </div>
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-12">加载中...</div>
      ) : placements.length === 0 ? (
        <div className="text-center py-12 text-gray-500">暂无投放</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">排序</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">关联专题</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">投放位置</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">卡片样式</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Feed 位</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">时间范围</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">状态</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {placements.map(item => {
                const title = (item.title_i18n as I18nText) || {};
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{item.sort_order}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-800">{getTopicTitle(item.topic_id)}</div>
                      {title.zh && <div className="text-xs text-gray-500">覆盖标题: {title.zh}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {PLACEMENT_OPTIONS.find(o => o.value === item.placement_name)?.label || item.placement_name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                        {CARD_VARIANT_OPTIONS.find(o => o.value === item.card_variant_name)?.label || item.card_variant_name || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">第 {item.feed_position} 位</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-500">
                        {item.start_time ? new Date(item.start_time).toLocaleDateString('zh-CN') : '不限'} ~{' '}
                        {item.end_time ? new Date(item.end_time).toLocaleDateString('zh-CN') : '不限'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(item)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                          item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                        {item.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {item.is_active ? '启用' : '停用'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleEdit(item)}
                          className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs hover:bg-blue-200">
                          <Edit className="w-3 h-3" /> 编辑
                        </button>
                        <button onClick={() => handleDelete(item.id)}
                          className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-200">
                          <Trash2 className="w-3 h-3" /> 删除
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
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{editingItem ? '编辑投放' : '创建投放'}</h2>
                <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* 关联专题 */}
                <div>
                  <label className="block text-sm font-medium mb-1">关联专题 *</label>
                  <select value={formData.topic_id}
                    onChange={(e) => setFormData({ ...formData, topic_id: e.target.value })}
                    className="w-full border rounded px-3 py-2">
                    <option value="">请选择专题</option>
                    {/**
                     * [审查修复] 优先显示已发布/待发布的专题，并对草稿/已下线专题添加警告标记。
                     * 原代码允许将任意状态的专题关联到投放，但前端 RPC 只会查询
                     * status='published' 且 is_active=true 的专题，导致管理员创建的投放实际不会展示。
                     */}
                    {[...topics]
                      .sort((a, b) => {
                        const order: Record<string, number> = { published: 0, ready: 1, draft: 2, offline: 3 };
                        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
                      })
                      .map(t => {
                        const i18n = t.title_i18n as I18nText;
                        const isUsable = t.status === 'published' || t.status === 'ready';
                        return (
                          <option key={t.id} value={t.id} className={isUsable ? '' : 'text-gray-400'}>
                            [{t.status}] {i18n?.zh || t.slug}{!isUsable ? ' ⚠️前端不可见' : ''}
                          </option>
                        );
                      })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">投放位置</label>
                    <select value={formData.placement_name}
                      onChange={(e) => setFormData({ ...formData, placement_name: e.target.value })}
                      className="w-full border rounded px-3 py-2">
                      {PLACEMENT_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">卡片样式</label>
                    <select value={formData.card_variant_name}
                      onChange={(e) => setFormData({ ...formData, card_variant_name: e.target.value })}
                      className="w-full border rounded px-3 py-2">
                      {CARD_VARIANT_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Feed 位置</label>
                    <input type="number" value={formData.feed_position}
                      onChange={(e) => setFormData({ ...formData, feed_position: Number(e.target.value) })}
                      className="w-full border rounded px-3 py-2" min={1} />
                    <p className="text-xs text-gray-400 mt-1">在第几个商品后插入</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">排序</label>
                    <input type="number" value={formData.sort_order}
                      onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                      className="w-full border rounded px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">状态</label>
                    <select value={formData.is_active ? 'active' : 'inactive'}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'active' })}
                      className="w-full border rounded px-3 py-2">
                      <option value="active">启用</option>
                      <option value="inactive">停用</option>
                    </select>
                  </div>
                </div>

                {/* 覆盖标题（可选） */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">覆盖标题（可选，留空则使用专题标题）</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇨🇳 中文</label>
                      <input type="text" value={formData.title_zh}
                        onChange={(e) => setFormData({ ...formData, title_zh: e.target.value })}
                        className="w-full border rounded px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇷🇺 俄语</label>
                      <input type="text" value={formData.title_ru}
                        onChange={(e) => setFormData({ ...formData, title_ru: e.target.value })}
                        className="w-full border rounded px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇹🇯 塔吉克语</label>
                      <input type="text" value={formData.title_tg}
                        onChange={(e) => setFormData({ ...formData, title_tg: e.target.value })}
                        className="w-full border rounded px-3 py-2" />
                    </div>
                  </div>
                </div>

                {/* 覆盖封面 */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">覆盖封面（可选）</h3>
                  <div className="border rounded-lg p-4">
                    <label className="block text-xs text-gray-500 mb-2">默认封面</label>
                    <SingleImageUpload
                      bucket="topics"
                      folder="placements"
                      imageUrl={formData.cover_image_default}
                      onImageUrlChange={(url) => setFormData({ ...formData, cover_image_default: url })}
                    />
                  </div>
                </div>

                {/* 时间范围 */}
                <div className="grid grid-cols-2 gap-4 border-t pt-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">开始时间</label>
                    <input type="datetime-local" value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full border rounded px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">结束时间</label>
                    <input type="datetime-local" value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full border rounded px-3 py-2" />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-4">
                  <button type="button" onClick={() => { setShowModal(false); resetForm(); }}
                    className="px-4 py-2 border rounded hover:bg-gray-50">取消</button>
                  <button type="submit"
                    className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600">
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
