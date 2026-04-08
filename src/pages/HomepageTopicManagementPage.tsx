/**
 * 专题管理页面
 *
 * 管理首页专题（homepage_topics）。
 * 支持：列表展示、状态筛选、创建/编辑专题、商品挂载管理。
 *
 * 与 BannerManagementPage 保持一致的 CRUD 模式。
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit, Trash2, Eye, EyeOff, RefreshCw,
  Search, Package, Link2, ChevronDown, ChevronUp, X, GripVertical,
} from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import { SingleImageUpload } from '@/components/SingleImageUpload';
import toast from 'react-hot-toast';
import type {
  DbHomepageTopicRow, DbTopicProductRow,
  TopicStatus, TopicSourceType, I18nText, StoryBlock,
} from '../types/homepage';

// ============================================================
// 常量
// ============================================================
const STATUS_OPTIONS: { value: TopicStatus; label: string; color: string }[] = [
  { value: 'draft', label: '草稿', color: 'bg-gray-100 text-gray-600' },
  { value: 'ready', label: '待发布', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'published', label: '已发布', color: 'bg-green-100 text-green-700' },
  { value: 'offline', label: '已下线', color: 'bg-red-100 text-red-600' },
];

const SOURCE_OPTIONS: { value: TopicSourceType; label: string }[] = [
  { value: 'manual', label: '人工创建' },
  { value: 'ai_draft', label: 'AI 草稿' },
  { value: 'hybrid', label: '混合' },
];

const TOPIC_TYPE_OPTIONS = [
  { value: 'story', label: '故事型' },
  { value: 'collection', label: '合集型' },
  { value: 'festival', label: '节日型' },
  { value: 'promotion', label: '促销型' },
];

const CARD_STYLE_OPTIONS = [
  { value: 'hero', label: 'Hero 大卡' },
  { value: 'standard', label: '标准卡片' },
  { value: 'mini', label: '迷你卡片' },
];

const getStatusBadge = (status: TopicStatus) => {
  const opt = STATUS_OPTIONS.find(o => o.value === status);
  return opt || { label: status, color: 'bg-gray-100 text-gray-600' };
};

// ============================================================
// 表单默认值
// ============================================================
const defaultFormData = {
  topic_type: 'story',
  status: 'draft' as TopicStatus,
  slug: '',
  title_zh: '', title_ru: '', title_tg: '',
  subtitle_zh: '', subtitle_ru: '', subtitle_tg: '',
  intro_zh: '', intro_ru: '', intro_tg: '',
  cover_image_default: '',
  cover_image_zh: '', cover_image_ru: '', cover_image_tg: '',
  theme_color: '#FF6B35',
  card_style: 'standard',
  local_context_notes: '',
  source_type: 'manual' as TopicSourceType,
  start_time: '',
  end_time: '',
  is_active: true,
};

// ============================================================
// 简化的商品搜索结果类型
// ============================================================
interface ProductSearchItem {
  id: string;
  name_i18n: I18nText;
  image_url: string;
  original_price: number;
  status: string;
}

export default function HomepageTopicManagementPage() {
  const { supabase } = useSupabase();
  const [topics, setTopics] = useState<DbHomepageTopicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DbHomepageTopicRow | null>(null);
  const [formData, setFormData] = useState(defaultFormData);
  const [filterStatus, setFilterStatus] = useState<TopicStatus | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'basic' | 'content' | 'products'>('basic');

  // 商品挂载状态
  const [topicProducts, setTopicProducts] = useState<DbTopicProductRow[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchItem[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetchTopics();
  }, []);

  // ============================================================
  // 数据获取
  // ============================================================
  const fetchTopics = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('homepage_topics')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setTopics(data || []);
    } catch (error: any) {
      console.error('Failed to fetch topics:', error);
      toast.error('获取专题列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchTopicProducts = async (topicId: string) => {
    try {
      const { data, error } = await supabase
        .from('topic_products')
        .select('*')
        .eq('topic_id', topicId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setTopicProducts(data || []);
    } catch (error: any) {
      console.error('Failed to fetch topic products:', error);
    }
  };

  const searchProducts = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('inventory_products')
        .select('id, name_i18n, image_url, original_price, status')
        .or(`name_i18n->>zh.ilike.%${keyword}%,name_i18n->>ru.ilike.%${keyword}%,sku.ilike.%${keyword}%`)
        .eq('status', 'active')
        .limit(20);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error: any) {
      console.error('Product search failed:', error);
    } finally {
      setSearching(false);
    }
  }, [supabase]);

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      if (productSearch.trim()) {
        searchProducts(productSearch);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearch, searchProducts]);

  // ============================================================
  // CRUD 操作
  // ============================================================
  const filteredTopics = filterStatus === 'all'
    ? topics
    : topics.filter(t => t.status === filterStatus);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.slug.trim()) {
      toast.error('Slug 不能为空');
      return;
    }
    if (!formData.title_zh.trim()) {
      toast.error('中文标题不能为空');
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

      const titleI18n = buildI18n(formData.title_zh, formData.title_ru, formData.title_tg) || { zh: formData.title_zh.trim() };

      const saveData = {
        topic_type: formData.topic_type,
        status: formData.status,
        slug: formData.slug.trim(),
        title_i18n: titleI18n,
        subtitle_i18n: buildI18n(formData.subtitle_zh, formData.subtitle_ru, formData.subtitle_tg),
        intro_i18n: buildI18n(formData.intro_zh, formData.intro_ru, formData.intro_tg),
        cover_image_default: formData.cover_image_default || null,
        cover_image_zh: formData.cover_image_zh || null,
        cover_image_ru: formData.cover_image_ru || null,
        cover_image_tg: formData.cover_image_tg || null,
        theme_color: formData.theme_color || null,
        card_style: formData.card_style,
        local_context_notes: formData.local_context_notes || null,
        source_type: formData.source_type,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        is_active: formData.is_active,
        updated_at: new Date().toISOString(),
      };

      if (editingItem) {
        const { error } = await supabase
          .from('homepage_topics')
          .update(saveData)
          .eq('id', editingItem.id);
        if (error) throw error;
        toast.success('专题更新成功');
      } else {
        const { error } = await supabase
          .from('homepage_topics')
          .insert([saveData]);
        if (error) throw error;
        toast.success('专题创建成功');
      }

      setShowModal(false);
      resetForm();
      fetchTopics();
    } catch (error: any) {
      console.error('Failed to save topic:', error);
      toast.error('保存失败: ' + error.message);
    }
  };

  const handleEdit = (item: DbHomepageTopicRow) => {
    setEditingItem(item);
    const title = item.title_i18n || {};
    const subtitle = item.subtitle_i18n || {};
    const intro = item.intro_i18n || {};
    setFormData({
      topic_type: item.topic_type || 'story',
      status: item.status,
      slug: item.slug,
      title_zh: title.zh || '', title_ru: title.ru || '', title_tg: title.tg || '',
      subtitle_zh: subtitle.zh || '', subtitle_ru: subtitle.ru || '', subtitle_tg: subtitle.tg || '',
      intro_zh: intro.zh || '', intro_ru: intro.ru || '', intro_tg: intro.tg || '',
      cover_image_default: item.cover_image_default || '',
      cover_image_zh: item.cover_image_zh || '',
      cover_image_ru: item.cover_image_ru || '',
      cover_image_tg: item.cover_image_tg || '',
      theme_color: item.theme_color || '#FF6B35',
      card_style: item.card_style || 'standard',
      local_context_notes: item.local_context_notes || '',
      source_type: item.source_type || 'manual',
      start_time: item.start_time || '',
      end_time: item.end_time || '',
      is_active: item.is_active,
    });
    setActiveTab('basic');
    fetchTopicProducts(item.id);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个专题吗？关联的商品和投放也会被删除。')) return;
    try {
      // 先删关联
      await supabase.from('topic_products').delete().eq('topic_id', id);
      await supabase.from('topic_placements').delete().eq('topic_id', id);
      const { error } = await supabase.from('homepage_topics').delete().eq('id', id);
      if (error) throw error;
      toast.success('专题删除成功');
      fetchTopics();
    } catch (error: any) {
      toast.error('删除失败: ' + error.message);
    }
  };

  const updateStatus = async (item: DbHomepageTopicRow, newStatus: TopicStatus) => {
    try {
      const { error } = await supabase
        .from('homepage_topics')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (error) throw error;
      toast.success(`专题状态已更新为: ${getStatusBadge(newStatus).label}`);
      fetchTopics();
    } catch (error: any) {
      toast.error('状态更新失败');
    }
  };

  // ============================================================
  // 商品挂载操作
  // ============================================================
  const addProductToTopic = async (product: ProductSearchItem) => {
    if (!editingItem) return;
    if (topicProducts.some(tp => tp.product_id === product.id)) {
      toast.error('该商品已挂载');
      return;
    }
    try {
      const { error } = await supabase
        .from('topic_products')
        .insert([{
          topic_id: editingItem.id,
          product_id: product.id,
          sort_order: topicProducts.length,
        }]);
      if (error) throw error;
      toast.success('商品已挂载');
      fetchTopicProducts(editingItem.id);
      setProductSearch('');
      setSearchResults([]);
    } catch (error: any) {
      toast.error('挂载失败: ' + error.message);
    }
  };

  const removeProductFromTopic = async (tpId: string) => {
    if (!editingItem) return;
    try {
      const { error } = await supabase
        .from('topic_products')
        .delete()
        .eq('id', tpId);
      if (error) throw error;
      toast.success('商品已移除');
      fetchTopicProducts(editingItem.id);
    } catch (error: any) {
      toast.error('移除失败');
    }
  };

  const resetForm = () => {
    setFormData(defaultFormData);
    setEditingItem(null);
    setTopicProducts([]);
    setProductSearch('');
    setSearchResults([]);
    setActiveTab('basic');
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">专题管理</h1>
        <div className="flex gap-2">
          <button
            onClick={fetchTopics}
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
            创建专题
          </button>
        </div>
      </div>

      {/* 状态筛选 */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFilterStatus('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filterStatus === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          全部 ({topics.length})
        </button>
        {STATUS_OPTIONS.map(s => (
          <button
            key={s.value}
            onClick={() => setFilterStatus(s.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterStatus === s.value ? 'bg-gray-800 text-white' : `${s.color} hover:opacity-80`
            }`}
          >
            {s.label} ({topics.filter(t => t.status === s.value).length})
          </button>
        ))}
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-12">加载中...</div>
      ) : filteredTopics.length === 0 ? (
        <div className="text-center py-12 text-gray-500">暂无专题</div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredTopics.map(item => {
            const title = item.title_i18n || {};
            const badge = getStatusBadge(item.status);
            return (
              <div key={item.id} className="bg-white rounded-lg shadow-sm p-4 flex items-start gap-4">
                {/* 封面缩略图 */}
                <div className="w-24 h-16 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                  {item.cover_image_default ? (
                    <img
                      src={item.cover_image_default}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">无封面</div>
                  )}
                </div>

                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${badge.color}`}>{badge.label}</span>
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded">{item.topic_type}</span>
                    {!item.is_active && (
                      <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded">已停用</span>
                    )}
                  </div>
                  <h3 className="font-bold text-gray-800 truncate">{title.zh || item.slug}</h3>
                  <div className="text-xs text-gray-500 mt-1">
                    Slug: {item.slug} | 更新: {new Date(item.updated_at).toLocaleDateString('zh-CN')}
                  </div>
                </div>

                {/* 操作 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.status === 'draft' && (
                    <button
                      onClick={() => updateStatus(item, 'ready')}
                      className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded hover:bg-yellow-200"
                    >
                      标记就绪
                    </button>
                  )}
                  {item.status === 'ready' && (
                    <button
                      onClick={() => updateStatus(item, 'published')}
                      className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                    >
                      发布
                    </button>
                  )}
                  {item.status === 'published' && (
                    <button
                      onClick={() => updateStatus(item, 'offline')}
                      className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200"
                    >
                      下线
                    </button>
                  )}
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
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* 创建/编辑模态框（带 Tab） */}
      {/* ============================================================ */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">
                  {editingItem ? '编辑专题' : '创建专题'}
                </h2>
                <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tab 切换 */}
              <div className="flex border-b mb-4">
                {(['basic', 'content', ...(editingItem ? ['products'] : [])] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab === 'basic' ? '基本信息' : tab === 'content' ? '内容与封面' : '商品挂载'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit}>
                {/* ==================== 基本信息 Tab ==================== */}
                {activeTab === 'basic' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Slug *</label>
                        <input
                          type="text"
                          value={formData.slug}
                          onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                          className="w-full border rounded px-3 py-2"
                          placeholder="如: spring-home-essentials"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">专题类型</label>
                        <select
                          value={formData.topic_type}
                          onChange={(e) => setFormData({ ...formData, topic_type: e.target.value })}
                          className="w-full border rounded px-3 py-2"
                        >
                          {TOPIC_TYPE_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* 三语标题 */}
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold mb-3">专题标题（三语）</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">🇨🇳 中文 *</label>
                          <input type="text" value={formData.title_zh}
                            onChange={(e) => setFormData({ ...formData, title_zh: e.target.value })}
                            className="w-full border rounded px-3 py-2" placeholder="春季家居好物" />
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

                    {/* 三语副标题 */}
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold mb-3">副标题（三语，可选）</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">🇨🇳 中文</label>
                          <input type="text" value={formData.subtitle_zh}
                            onChange={(e) => setFormData({ ...formData, subtitle_zh: e.target.value })}
                            className="w-full border rounded px-3 py-2" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">🇷🇺 俄语</label>
                          <input type="text" value={formData.subtitle_ru}
                            onChange={(e) => setFormData({ ...formData, subtitle_ru: e.target.value })}
                            className="w-full border rounded px-3 py-2" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">🇹🇯 塔吉克语</label>
                          <input type="text" value={formData.subtitle_tg}
                            onChange={(e) => setFormData({ ...formData, subtitle_tg: e.target.value })}
                            className="w-full border rounded px-3 py-2" />
                        </div>
                      </div>
                    </div>

                    {/* 状态和配置 */}
                    <div className="grid grid-cols-3 gap-4 border-t pt-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">状态</label>
                        <select value={formData.status}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value as TopicStatus })}
                          className="w-full border rounded px-3 py-2">
                          {STATUS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">来源</label>
                        <select value={formData.source_type}
                          onChange={(e) => setFormData({ ...formData, source_type: e.target.value as TopicSourceType })}
                          className="w-full border rounded px-3 py-2">
                          {SOURCE_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">卡片样式</label>
                        <select value={formData.card_style}
                          onChange={(e) => setFormData({ ...formData, card_style: e.target.value })}
                          className="w-full border rounded px-3 py-2">
                          {CARD_STYLE_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
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

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">主题色</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={formData.theme_color}
                            onChange={(e) => setFormData({ ...formData, theme_color: e.target.value })}
                            className="w-10 h-10 border rounded cursor-pointer" />
                          <input type="text" value={formData.theme_color}
                            onChange={(e) => setFormData({ ...formData, theme_color: e.target.value })}
                            className="flex-1 border rounded px-3 py-2" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">启用状态</label>
                        <select
                          value={formData.is_active ? 'active' : 'inactive'}
                          onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'active' })}
                          className="w-full border rounded px-3 py-2">
                          <option value="active">启用</option>
                          <option value="inactive">停用</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* ==================== 内容与封面 Tab ==================== */}
                {activeTab === 'content' && (
                  <div className="space-y-4">
                    {/* 三语简介 */}
                    <div>
                      <h3 className="text-sm font-semibold mb-3">简介（三语，可选）</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">🇨🇳 中文</label>
                          <textarea value={formData.intro_zh}
                            onChange={(e) => setFormData({ ...formData, intro_zh: e.target.value })}
                            className="w-full border rounded px-3 py-2" rows={3} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">🇷🇺 俄语</label>
                          <textarea value={formData.intro_ru}
                            onChange={(e) => setFormData({ ...formData, intro_ru: e.target.value })}
                            className="w-full border rounded px-3 py-2" rows={3} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">🇹🇯 塔吉克语</label>
                          <textarea value={formData.intro_tg}
                            onChange={(e) => setFormData({ ...formData, intro_tg: e.target.value })}
                            className="w-full border rounded px-3 py-2" rows={3} />
                        </div>
                      </div>
                    </div>

                    {/* 封面图 */}
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold mb-3">封面图片</h3>
                      <div className="space-y-4">
                        <div className="border rounded-lg p-4">
                          <label className="block text-xs text-gray-500 mb-2">默认封面</label>
                          <SingleImageUpload
                            bucket="topics"
                            folder="covers"
                            imageUrl={formData.cover_image_default}
                            onImageUrlChange={(url) => setFormData({ ...formData, cover_image_default: url })}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="border border-red-200 rounded-lg p-3 bg-red-50">
                            <label className="block text-xs text-red-600 mb-2">🇨🇳 中文版</label>
                            <SingleImageUpload
                              bucket="topics"
                              folder="covers/zh"
                              imageUrl={formData.cover_image_zh}
                              onImageUrlChange={(url) => setFormData({ ...formData, cover_image_zh: url })}
                            />
                          </div>
                          <div className="border border-blue-200 rounded-lg p-3 bg-blue-50">
                            <label className="block text-xs text-blue-600 mb-2">🇷🇺 俄语版</label>
                            <SingleImageUpload
                              bucket="topics"
                              folder="covers/ru"
                              imageUrl={formData.cover_image_ru}
                              onImageUrlChange={(url) => setFormData({ ...formData, cover_image_ru: url })}
                            />
                          </div>
                          <div className="border border-green-200 rounded-lg p-3 bg-green-50">
                            <label className="block text-xs text-green-600 mb-2">🇹🇯 塔吉克语版</label>
                            <SingleImageUpload
                              bucket="topics"
                              folder="covers/tg"
                              imageUrl={formData.cover_image_tg}
                              onImageUrlChange={(url) => setFormData({ ...formData, cover_image_tg: url })}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 本地化备注 */}
                    <div className="border-t pt-4">
                      <label className="block text-sm font-medium mb-1">本地化备注（内部使用）</label>
                      <textarea
                        value={formData.local_context_notes}
                        onChange={(e) => setFormData({ ...formData, local_context_notes: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                        rows={3}
                        placeholder="记录本地化注意事项，如文化禁忌、用语建议等"
                      />
                    </div>
                  </div>
                )}

                {/* ==================== 商品挂载 Tab ==================== */}
                {activeTab === 'products' && editingItem && (
                  <div className="space-y-4">
                    {/* 搜索商品 */}
                    <div>
                      <label className="block text-sm font-medium mb-1">搜索商品</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          className="w-full border rounded pl-9 pr-3 py-2"
                          placeholder="输入商品名称或 SKU 搜索..."
                        />
                      </div>
                      {/* 搜索结果 */}
                      {searching && <div className="text-sm text-gray-500 mt-2">搜索中...</div>}
                      {searchResults.length > 0 && (
                        <div className="border rounded mt-2 max-h-48 overflow-y-auto">
                          {searchResults.map(p => {
                            const pName = (p.name_i18n as I18nText)?.zh || p.id;
                            const alreadyAdded = topicProducts.some(tp => tp.product_id === p.id);
                            return (
                              <div key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 border-b last:border-b-0">
                                <img src={p.image_url} alt="" className="w-10 h-10 object-cover rounded" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{pName}</div>
                                  <div className="text-xs text-gray-500">{p.original_price} TJS</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => addProductToTopic(p)}
                                  disabled={alreadyAdded}
                                  className={`text-xs px-2 py-1 rounded ${
                                    alreadyAdded
                                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                      : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                  }`}
                                >
                                  {alreadyAdded ? '已挂载' : '+ 挂载'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 已挂载商品列表 */}
                    <div className="border-t pt-4">
                      <h3 className="text-sm font-semibold mb-3">
                        已挂载商品 ({topicProducts.length})
                      </h3>
                      {topicProducts.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          暂无挂载商品，请在上方搜索并添加
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {topicProducts.map((tp, idx) => (
                            <div key={tp.id} className="flex items-center gap-3 bg-gray-50 rounded px-3 py-2">
                              <span className="text-xs text-gray-400 w-6 text-center">{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">
                                  商品 ID: {tp.product_id.slice(0, 8)}...
                                </div>
                                <div className="text-xs text-gray-500">排序: {tp.sort_order}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeProductFromTopic(tp.id)}
                                className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 提交按钮 */}
                {activeTab !== 'products' && (
                  <div className="flex gap-2 justify-end pt-4 border-t mt-4">
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
                )}
              </form>

              {/* 商品挂载 Tab 的关闭按钮 */}
              {activeTab === 'products' && (
                <div className="flex gap-2 justify-end pt-4 border-t mt-4">
                  <button
                    onClick={() => { setShowModal(false); resetForm(); }}
                    className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
                  >
                    完成
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
