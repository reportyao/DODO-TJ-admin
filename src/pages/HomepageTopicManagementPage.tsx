/**
 * 专题管理页面
 *
 * 管理首页专题（homepage_topics）。
 * 支持：列表展示、状态筛选、创建/编辑专题、商品挂载管理。
 *
 * 与 BannerManagementPage 保持一致的 CRUD 模式。
 *
 * [审查修复] 修复清单：
 *   BUG-01/02: 删除前检查关联投放和商品数量，给出明确提示
 *   BUG-03: slug 唯一性前端校验
 *   BUG-04: 已发布专题编辑 slug 时显示警告
 *   BUG-06: 正文块支持 block_type 选择（heading/paragraph/callout）
 *   BUG-07: block_key 使用 crypto.randomUUID 避免重复
 *   BUG-08: 时间范围校验（end_time > start_time）
 *   BUG-16: 发布状态变更前校验必要字段
 *   BUG-24: TopicResultPreview 浅拷贝问题（在 AITopicGenerationPage 中修复）
 *   BUG-25: 专题列表分页
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit, Trash2, Eye, EyeOff, RefreshCw,
  Search, Package, Link2, ChevronDown, ChevronUp, X, GripVertical,
  AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import { adminQuery, adminInsert, adminUpdate, adminDelete } from '../lib/adminApi';
import { SingleImageUpload } from '@/components/SingleImageUpload';
import ProductPickerPanel from '@/components/ProductPickerPanel';
import type { ProductPickerItem } from '@/components/ProductPickerPanel';
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

// [修复] 增加 banner 选项，与前端 TopicCard 支持的样式保持一致
const CARD_STYLE_OPTIONS = [
  { value: 'hero', label: 'Hero 大卡' },
  { value: 'standard', label: '标准卡片' },
  { value: 'banner', label: 'Banner 横幅' },
  { value: 'mini', label: '迷你卡片' },
];

// [BUG-06 修复] 正文块类型选项
const BLOCK_TYPE_OPTIONS = [
  { value: 'paragraph', label: '段落' },
  { value: 'heading', label: '标题' },
  { value: 'callout', label: '高亮提示' },
];

// [BUG-25 修复] 分页常量
const PAGE_SIZE = 20;

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
  cover_image_url: '',
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

// [BUG-07 修复] 安全的唯一ID生成
function generateBlockKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `block_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function HomepageTopicManagementPage() {
  const { supabase } = useSupabase();
  const [topics, setTopics] = useState<DbHomepageTopicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DbHomepageTopicRow | null>(null);
  const [formData, setFormData] = useState(defaultFormData);
  const [filterStatus, setFilterStatus] = useState<TopicStatus | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'basic' | 'content' | 'sections'>('basic');

  // v2: Section 分组编辑状态
  const [sectionGroups, setSectionGroups] = useState<{
    story_text_i18n: I18nText;
    products: { product_id: string; note_i18n?: I18nText; badge_text_i18n?: I18nText }[];
  }[]>([]);
  const [activeSectionIdx, setActiveSectionIdx] = useState<number | null>(null);

  // 商品挂载状态
  const [topicProducts, setTopicProducts] = useState<DbTopicProductRow[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  // 存储已挂载商品的详细信息（用于显示名称和图片）
  const [topicProductDetails, setTopicProductDetails] = useState<Map<string, ProductSearchItem>>(new Map());

  // [BUG-06 修复] 正文块编辑状态
  const [storyBlocks, setStoryBlocks] = useState<StoryBlock[]>([]);

  // [BUG-25 修复] 分页状态
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchTopics();
  }, []);

  // ============================================================
  // 数据获取
  // ============================================================
  const fetchTopics = async () => {
    setLoading(true);
    try {
      // [RLS 修复] 使用 adminQuery
      const data = await adminQuery<DbHomepageTopicRow>(supabase, 'homepage_topics', {
        select: '*',
        orderBy: 'updated_at',
        orderAsc: false,
      });
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
      // [RLS 修复] 使用 adminQuery
      const data = await adminQuery<DbTopicProductRow>(supabase, 'topic_products', {
        select: '*',
        filters: [{ col: 'topic_id', op: 'eq', val: topicId }],
        orderBy: 'sort_order',
        orderAsc: true,
      });
      setTopicProducts(data || []);

      // 获取已挂载商品的详细信息
      if (data && data.length > 0) {
        const productIds = data.map(tp => tp.product_id);
        const products = await adminQuery<ProductSearchItem>(supabase, 'inventory_products', {
          select: 'id, name_i18n, image_url, original_price, status',
          orFilters: productIds.map(id => `id.eq.${id}`).join(','),
          limit: productIds.length,
        });
        const detailMap = new Map<string, ProductSearchItem>();
        (products || []).forEach(p => detailMap.set(p.id, p));
        setTopicProductDetails(detailMap);

        // v2: 按 story_group 分组构建 sectionGroups
        const groupMap = new Map<number, { story_text_i18n: I18nText; products: { product_id: string; note_i18n?: I18nText; badge_text_i18n?: I18nText }[] }>();
        for (const tp of (data || [])) {
          const groupIdx = (tp as any).story_group ?? 0;
          if (!groupMap.has(groupIdx)) {
            groupMap.set(groupIdx, {
              story_text_i18n: (tp as any).story_text_i18n || {},
              products: [],
            });
          }
          groupMap.get(groupIdx)!.products.push({
            product_id: tp.product_id,
            note_i18n: tp.note_i18n || undefined,
            badge_text_i18n: tp.badge_text_i18n || undefined,
          });
        }
        const sortedGroups = [...groupMap.entries()].sort((a, b) => a[0] - b[0]).map(([_, g]) => g);
        setSectionGroups(sortedGroups.length > 0 ? sortedGroups : [{ story_text_i18n: {}, products: [] }]);
      } else {
        setTopicProductDetails(new Map());
        setSectionGroups([{ story_text_i18n: {}, products: [] }]);
      }
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
      // [BUG-14 修复] 对搜索关键词进行转义，避免 PostgREST 特殊字符导致查询错误
      const kw = keyword.trim().replace(/[.,()]/g, '');
      // [RLS 修复] 使用 adminQuery
      const data = await adminQuery<ProductSearchItem>(supabase, 'inventory_products', {
        select: 'id, name_i18n, image_url, original_price, status',
        filters: [{ col: 'status', op: 'eq', val: 'ACTIVE' }],
        orFilters: `name_i18n->>zh.ilike.%${kw}%,name_i18n->>ru.ilike.%${kw}%,name_i18n->>tg.ilike.%${kw}%,sku.ilike.%${kw}%`,
        limit: 20,
      });
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

  // [BUG-25 修复] 分页计算
  const totalPages = Math.max(1, Math.ceil(filteredTopics.length / PAGE_SIZE));
  const paginatedTopics = filteredTopics.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  // 筛选变更时重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus]);

  // [BUG-03 修复] slug 唯一性前端校验
  const checkSlugUnique = async (slug: string, excludeId?: string): Promise<boolean> => {
    try {
      const existing = await adminQuery<{ id: string }>(supabase, 'homepage_topics', {
        select: 'id',
        filters: [{ col: 'slug', op: 'eq', val: slug }],
        limit: 1,
      });
      if (!existing || existing.length === 0) return true;
      if (excludeId && existing[0].id === excludeId) return true;
      return false;
    } catch {
      // 查询失败时不阻止保存，让数据库约束兜底
      return true;
    }
  };

  // [BUG-08 修复] 时间范围校验
  const validateTimeRange = (startTime: string, endTime: string): boolean => {
    if (startTime && endTime) {
      const start = new Date(startTime).getTime();
      const end = new Date(endTime).getTime();
      if (end <= start) {
        toast.error('结束时间必须晚于开始时间');
        return false;
      }
    }
    return true;
  };

  // [BUG-16 修复] 发布前必要字段校验
  const validateForPublish = (status: TopicStatus): string | null => {
    if (status !== 'published' && status !== 'ready') return null;

    if (!formData.title_zh.trim() && !formData.title_ru.trim() && !formData.title_tg.trim()) {
      return '发布/就绪状态要求至少填写一种语言的标题';
    }
    if (!formData.slug.trim()) {
      return '发布/就绪状态要求填写 Slug';
    }
    // 编辑模式下检查是否有挂载商品
    if (editingItem && topicProducts.length === 0) {
      return '发布/就绪状态建议至少挂载一个商品（当前无商品挂载）';
    }
    return null;
  };

  // [修复] 抽取保存逻辑为独立函数，供表单提交和"完成"按钮共用
  const saveFormData = async (closeAfterSave: boolean = true): Promise<boolean> => {
    if (!formData.slug.trim()) {
      toast.error('Slug 不能为空');
      return false;
    }
    if (!formData.title_zh.trim()) {
      toast.error('中文标题不能为空');
      return false;
    }

    // [BUG-08 修复] 时间范围校验
    if (!validateTimeRange(formData.start_time, formData.end_time)) {
      return false;
    }

    // [BUG-16 修复] 发布前字段校验（仅警告，不阻止保存）
    const publishWarning = validateForPublish(formData.status);
    if (publishWarning) {
      // 对于"建议"类警告，使用 confirm 让用户选择
      if (publishWarning.includes('建议')) {
        if (!confirm(`${publishWarning}\n\n是否仍然继续保存？`)) {
          return false;
        }
      } else {
        toast.error(publishWarning);
        return false;
      }
    }

    // [BUG-03 修复] slug 唯一性校验
    const slugUnique = await checkSlugUnique(formData.slug.trim(), editingItem?.id);
    if (!slugUnique) {
      toast.error('该 Slug 已被其他专题使用，请更换');
      return false;
    }

    setFormSaving(true);
    try {
      const buildI18n = (zh: string, ru: string, tg: string): I18nText | null => {
        const obj: I18nText = {};
        if (zh.trim()) obj.zh = zh.trim();
        if (ru.trim()) obj.ru = ru.trim();
        if (tg.trim()) obj.tg = tg.trim();
        return Object.keys(obj).length > 0 ? obj : null;
      };

      const titleI18n = buildI18n(formData.title_zh, formData.title_ru, formData.title_tg) || { zh: formData.title_zh.trim() };

      // [BUG-06 修复] 保存正文块时包含 block_type
      const storyBlocksI18n = storyBlocks.map(block => ({
        block_key: block.block_key,
        block_type: block.block_type || 'paragraph',
        zh: block.zh || '',
        ru: block.ru || '',
        tg: block.tg || '',
      }));

      const saveData = {
        topic_type: formData.topic_type,
        status: formData.status,
        slug: formData.slug.trim(),
        title_i18n: titleI18n,
        subtitle_i18n: buildI18n(formData.subtitle_zh, formData.subtitle_ru, formData.subtitle_tg),
        intro_i18n: buildI18n(formData.intro_zh, formData.intro_ru, formData.intro_tg),
        story_blocks_i18n: storyBlocksI18n,
        cover_image_default: formData.cover_image_default || null,
        cover_image_zh: formData.cover_image_zh || null,
        cover_image_ru: formData.cover_image_ru || null,
        cover_image_tg: formData.cover_image_tg || null,
        cover_image_url: formData.cover_image_url || null,
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
        await adminUpdate(supabase, 'homepage_topics', saveData, [
          { col: 'id', op: 'eq', val: editingItem.id },
        ]);

        // v2: 保存 sectionGroups 到 topic_products
        // [BUG-M1 修复] 先构建全部插入数据，再删除旧数据并批量插入，减少中间状态
        // [BUG-M2 修复] 空对象 {} 转为 null
        const isEmptyI18n = (obj: any) => !obj || (typeof obj === 'object' && Object.keys(obj).length === 0);
        const productInserts: any[] = [];
        let globalSort = 0;
        for (let sIdx = 0; sIdx < sectionGroups.length; sIdx++) {
          const section = sectionGroups[sIdx];
          const storyText = isEmptyI18n(section.story_text_i18n) ? null : section.story_text_i18n;
          for (const sp of section.products) {
            productInserts.push({
              topic_id: editingItem.id,
              product_id: sp.product_id,
              sort_order: globalSort++,
              story_group: sIdx,
              story_text_i18n: storyText,
              note_i18n: isEmptyI18n(sp.note_i18n) ? null : sp.note_i18n,
              badge_text_i18n: isEmptyI18n(sp.badge_text_i18n) ? null : sp.badge_text_i18n,
            });
          }
        }
        // 先删除旧数据
        await adminDelete(supabase, 'topic_products', [{ col: 'topic_id', op: 'eq', val: editingItem.id }]);
        // 批量插入新数据
        let insertFailed = 0;
        for (const pi of productInserts) {
          try {
            await adminInsert(supabase, 'topic_products', pi);
          } catch (e) {
            console.error('[sections save] insert failed:', e);
            insertFailed++;
          }
        }
        if (insertFailed > 0) {
          toast.error(`${insertFailed} 个商品挂载失败，请检查段落与商品`);
        }

        toast.success('专题更新成功');
      } else {
        const result = await adminInsert<{ id: string }>(supabase, 'homepage_topics', saveData);

        // v2: 新建时也保存 sectionGroups
        // [BUG-M2 修复] 空对象 {} 转为 null
        const isEmptyI18n = (obj: any) => !obj || (typeof obj === 'object' && Object.keys(obj).length === 0);
        if (result?.id && sectionGroups.some(s => s.products.length > 0)) {
          let globalSort = 0;
          let insertFailed = 0;
          for (let sIdx = 0; sIdx < sectionGroups.length; sIdx++) {
            const section = sectionGroups[sIdx];
            const storyText = isEmptyI18n(section.story_text_i18n) ? null : section.story_text_i18n;
            for (const sp of section.products) {
              try {
                await adminInsert(supabase, 'topic_products', {
                  topic_id: result.id,
                  product_id: sp.product_id,
                  sort_order: globalSort++,
                  story_group: sIdx,
                  story_text_i18n: storyText,
                  note_i18n: isEmptyI18n(sp.note_i18n) ? null : sp.note_i18n,
                  badge_text_i18n: isEmptyI18n(sp.badge_text_i18n) ? null : sp.badge_text_i18n,
                });
              } catch (e) {
                console.error('[sections save] insert failed:', e);
                insertFailed++;
              }
            }
          }
          if (insertFailed > 0) {
            toast.error(`${insertFailed} 个商品挂载失败，请检查段落与商品`);
          }
        }

        toast.success('专题创建成功');
      }

      if (closeAfterSave) {
        setShowModal(false);
        resetForm();
      }
      fetchTopics();
      return true;
    } catch (error: any) {
      console.error('Failed to save topic:', error);
      toast.error('保存失败: ' + error.message);
      return false;
    } finally {
      setFormSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveFormData(true);
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
      cover_image_url: item.cover_image_url || '',
      theme_color: item.theme_color || '#FF6B35',
      card_style: item.card_style || 'standard',
      local_context_notes: item.local_context_notes || '',
      source_type: item.source_type || 'manual',
      start_time: item.start_time || '',
      end_time: item.end_time || '',
      is_active: item.is_active,
    });
    // [BUG-06 修复] 加载正文块
    const blocks = Array.isArray(item.story_blocks_i18n) ? item.story_blocks_i18n : [];
    setStoryBlocks(blocks.map((b: any) => ({
      block_key: b.block_key || generateBlockKey(),
      block_type: b.block_type || 'paragraph',
      zh: b.zh || b.content_i18n?.zh || '',
      ru: b.ru || b.content_i18n?.ru || '',
      tg: b.tg || b.content_i18n?.tg || '',
    })));
    setActiveTab('basic');
    setActiveSectionIdx(null);
    fetchTopicProducts(item.id);
    setShowModal(true);
  };

  // [BUG-01/02 修复] 删除前检查关联投放和商品数量
  const handleDelete = async (id: string) => {
    try {
      // 查询关联数据数量
      const [placements, products] = await Promise.all([
        adminQuery<{ id: string }>(supabase, 'topic_placements', {
          select: 'id',
          filters: [{ col: 'topic_id', op: 'eq', val: id }],
        }),
        adminQuery<{ id: string }>(supabase, 'topic_products', {
          select: 'id',
          filters: [{ col: 'topic_id', op: 'eq', val: id }],
        }),
      ]);

      const placementCount = placements?.length || 0;
      const productCount = products?.length || 0;

      let confirmMsg = '确定要删除这个专题吗？';
      if (placementCount > 0 || productCount > 0) {
        confirmMsg += `\n\n该专题关联了：`;
        if (placementCount > 0) confirmMsg += `\n• ${placementCount} 个投放记录（将同时删除，前台专题卡片将消失）`;
        if (productCount > 0) confirmMsg += `\n• ${productCount} 个挂载商品（将同时解除关联）`;
        confirmMsg += '\n\n此操作不可撤销！';
      }

      if (!confirm(confirmMsg)) return;

      // [RLS 修复] 先删关联
      await adminDelete(supabase, 'topic_products', [{ col: 'topic_id', op: 'eq', val: id }]);
      await adminDelete(supabase, 'topic_placements', [{ col: 'topic_id', op: 'eq', val: id }]);
      await adminDelete(supabase, 'homepage_topics', [{ col: 'id', op: 'eq', val: id }]);
      toast.success('专题删除成功');
      fetchTopics();
    } catch (error: any) {
      toast.error('删除失败: ' + error.message);
    }
  };

  // [BUG-16 修复] 状态变更前校验
  const updateStatus = async (item: DbHomepageTopicRow, newStatus: TopicStatus) => {
    // 发布前校验
    if (newStatus === 'published' || newStatus === 'ready') {
      const title = item.title_i18n || {};
      if (!title.zh && !title.ru && !title.tg) {
        toast.error(`无法设为${newStatus === 'published' ? '已发布' : '待发布'}：专题标题为空`);
        return;
      }
      if (!item.slug) {
        toast.error(`无法设为${newStatus === 'published' ? '已发布' : '待发布'}：Slug 为空`);
        return;
      }
    }

    try {
      // [RLS 修复] 使用 adminUpdate
      await adminUpdate(supabase, 'homepage_topics', { status: newStatus, updated_at: new Date().toISOString() }, [
        { col: 'id', op: 'eq', val: item.id },
      ]);
      toast.success(`专题状态已更新为: ${getStatusBadge(newStatus).label}`);
      fetchTopics();
    } catch (error: any) {
      toast.error('状态更新失败');
    }
  };

  // ============================================================
  // 商品挂载操作 (v2: 仅保留为向后兼容，新流程请使用 sections 编辑器)
  // ============================================================
  /** @deprecated v2 请使用 sections 编辑器。保留仅为向后兼容。 */
  const addProductToTopic = async (product: ProductSearchItem) => {
    if (!editingItem) return;
    if (topicProducts.some(tp => tp.product_id === product.id)) {
      toast.error('该商品已挂载');
      return;
    }
    try {
      await adminInsert(supabase, 'topic_products', {
        topic_id: editingItem.id,
        product_id: product.id,
        sort_order: topicProducts.length,
        story_group: 0,
      });
      toast.success('商品已挂载');
      fetchTopicProducts(editingItem.id);
      setProductSearch('');
      setSearchResults([]);
    } catch (error: any) {
      toast.error('挂载失败: ' + error.message);
    }
  };

  /** @deprecated v2 请使用 sections 编辑器。保留仅为向后兼容。 */
  const addProductsToTopic = async (products: ProductPickerItem[]) => {
    if (!editingItem) return;
    let added = 0;
    for (const product of products) {
      if (topicProducts.some(tp => tp.product_id === product.id)) continue;
      try {
        await adminInsert(supabase, 'topic_products', {
          topic_id: editingItem.id,
          product_id: product.id,
          sort_order: topicProducts.length + added,
          story_group: 0,
        });
        added++;
      } catch (error: any) {
        console.error(`Failed to add product ${product.id}:`, error);
      }
    }
    if (added > 0) {
      toast.success(`成功挂载 ${added} 个商品`);
      fetchTopicProducts(editingItem.id);
    } else {
      toast.error('没有新商品被挂载（可能已全部挂载）');
    }
  };

  const removeProductFromTopic = async (tpId: string) => {
    if (!editingItem) return;
    try {
      await adminDelete(supabase, 'topic_products', [{ col: 'id', op: 'eq', val: tpId }]);
      toast.success('商品已移除');
      fetchTopicProducts(editingItem.id);
    } catch (error: any) {
      toast.error('移除失败');
    }
  };

  // [BUG-06 修复] 正文块操作
  const addStoryBlock = () => {
    setStoryBlocks(prev => [...prev, {
      block_key: generateBlockKey(),
      block_type: 'paragraph',
      zh: '',
      ru: '',
      tg: '',
    }]);
  };

  const removeStoryBlock = (index: number) => {
    setStoryBlocks(prev => prev.filter((_, i) => i !== index));
  };

  const updateStoryBlock = (index: number, field: string, value: string) => {
    setStoryBlocks(prev => {
      const blocks = [...prev];
      blocks[index] = { ...blocks[index], [field]: value };
      return blocks;
    });
  };

  const moveStoryBlock = (index: number, direction: 'up' | 'down') => {
    setStoryBlocks(prev => {
      const blocks = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= blocks.length) return blocks;
      [blocks[index], blocks[targetIndex]] = [blocks[targetIndex], blocks[index]];
      return blocks;
    });
  };

  const resetForm = () => {
    setFormData(defaultFormData);
    setEditingItem(null);
    setTopicProducts([]);
    setProductSearch('');
    setSearchResults([]);
    setStoryBlocks([]);
    setActiveTab('basic');
    setSectionGroups([{ story_text_i18n: {}, products: [] }]);
    setActiveSectionIdx(null);
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
        <>
          <div className="grid grid-cols-1 gap-4">
            {paginatedTopics.map(item => {
              const title = item.title_i18n || {};
              const badge = getStatusBadge(item.status);
              return (
                <div key={item.id} className="bg-white rounded-lg shadow-sm p-4 flex items-start gap-4">
                  {/* 封面缩略图 [BUG-M5 修复] 优先使用 cover_image_url，回退到 cover_image_default */}
                  <div className="w-24 h-16 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                    {(item.cover_image_url || item.cover_image_default) ? (
                      <img
                        src={item.cover_image_url || item.cover_image_default || ''}
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

          {/* [BUG-25 修复] 分页控件 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4" />
                上一页
              </button>
              <span className="text-sm text-gray-500">
                第 {currentPage} / {totalPages} 页（共 {filteredTopics.length} 条）
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                下一页
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
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
                {(['basic', 'content', 'sections'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab === 'basic' ? '基本信息' : tab === 'content' ? '内容与封面' : '段落与商品'}
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
                          onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') })}
                          className="w-full border rounded px-3 py-2"
                          placeholder="如: spring-home-essentials"
                        />
                        <p className="text-xs text-gray-400 mt-1">URL 友好标识符，用于生成专题页面链接。仅支持小写字母、数字和连字符。</p>
                        {/* [BUG-04 修复] 已发布专题修改 slug 警告 */}
                        {editingItem && editingItem.status === 'published' && formData.slug !== editingItem.slug && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                            <span>修改已发布专题的 Slug 会导致已有链接失效（如用户收藏、分享链接）</span>
                          </div>
                        )}
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
                        {/* [BUG-08 修复] 时间范围提示 */}
                        {formData.start_time && formData.end_time && new Date(formData.end_time) <= new Date(formData.start_time) && (
                          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            结束时间必须晚于开始时间
                          </p>
                        )}
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

                    {/* [BUG-06 修复] 正文块编辑器（支持 block_type） */}
                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold">正文块（三语）</h3>
                        <button
                          type="button"
                          onClick={addStoryBlock}
                          className="flex items-center gap-1 text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded hover:bg-orange-200"
                        >
                          <Plus className="w-3 h-3" />
                          添加段落
                        </button>
                      </div>
                      {storyBlocks.length === 0 ? (
                        <div className="text-center py-6 text-gray-400 text-sm border-2 border-dashed rounded-lg">
                          暂无正文块，点击"添加段落"开始编写
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {storyBlocks.map((block, idx) => (
                            <div key={block.block_key} className="border rounded-lg p-4 bg-gray-50">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400 font-mono">{idx + 1}</span>
                                  {/* [BUG-06 修复] block_type 选择器 */}
                                  <select
                                    value={block.block_type || 'paragraph'}
                                    onChange={(e) => updateStoryBlock(idx, 'block_type', e.target.value)}
                                    className="text-xs border rounded px-2 py-1 bg-white"
                                  >
                                    {BLOCK_TYPE_OPTIONS.map(o => (
                                      <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                  </select>
                                  <span className="text-xs text-gray-300">{block.block_key}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => moveStoryBlock(idx, 'up')}
                                    disabled={idx === 0}
                                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                    title="上移"
                                  >
                                    <ChevronUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveStoryBlock(idx, 'down')}
                                    disabled={idx === storyBlocks.length - 1}
                                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                    title="下移"
                                  >
                                    <ChevronDown className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeStoryBlock(idx)}
                                    className="p-1 text-red-400 hover:text-red-600"
                                    title="删除"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">🇨🇳 中文</label>
                                  <textarea
                                    value={block.zh || ''}
                                    onChange={(e) => updateStoryBlock(idx, 'zh', e.target.value)}
                                    className="w-full border rounded px-3 py-2 text-sm"
                                    rows={block.block_type === 'heading' ? 1 : 3}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">🇷🇺 俄语</label>
                                  <textarea
                                    value={block.ru || ''}
                                    onChange={(e) => updateStoryBlock(idx, 'ru', e.target.value)}
                                    className="w-full border rounded px-3 py-2 text-sm"
                                    rows={block.block_type === 'heading' ? 1 : 3}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">🇹🇯 塔吉克语</label>
                                  <textarea
                                    value={block.tg || ''}
                                    onChange={(e) => updateStoryBlock(idx, 'tg', e.target.value)}
                                    className="w-full border rounded px-3 py-2 text-sm"
                                    rows={block.block_type === 'heading' ? 1 : 3}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
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

                    {/* AI 生成封面图 */}
                    {formData.cover_image_url && (
                      <div className="border-t pt-4">
                        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                          AI 生成封面图
                          <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded">自动生成</span>
                        </h3>
                        <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
                          <img
                            src={formData.cover_image_url}
                            alt="AI 封面图"
                            className="w-full max-w-md rounded-lg shadow-sm mb-2"
                          />
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              type="text"
                              className="flex-1 border rounded px-2 py-1 text-xs"
                              value={formData.cover_image_url}
                              onChange={(e) => setFormData({ ...formData, cover_image_url: e.target.value })}
                              placeholder="AI 封面图 URL"
                            />
                            <button
                              type="button"
                              className="text-xs text-red-500 hover:text-red-700"
                              onClick={() => setFormData({ ...formData, cover_image_url: '' })}
                            >
                              清除
                            </button>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">此封面图由 AI 专题助手自动生成，前端会优先使用此图片</p>
                        </div>
                      </div>
                    )}

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

                {/* ==================== v2: 段落与商品 Tab ==================== */}
                {activeTab === 'sections' && (
                  <div className="space-y-4">
                    {/* 段落列表 */}
                    {sectionGroups.map((section, sIdx) => (
                      <div key={sIdx} className="border rounded-lg overflow-hidden">
                        {/* Section 头部 */}
                        <div
                          className="flex items-center justify-between bg-orange-50 px-4 py-2 cursor-pointer hover:bg-orange-100 transition-colors"
                          onClick={() => setActiveSectionIdx(activeSectionIdx === sIdx ? null : sIdx)}
                        >
                          <div className="flex items-center gap-2">
                            {activeSectionIdx === sIdx ? <ChevronUp className="w-4 h-4 text-orange-600" /> : <ChevronDown className="w-4 h-4 text-orange-600" />}
                            <span className="text-sm font-medium text-orange-700">
                              段落 {sIdx + 1}
                            </span>
                            <span className="text-xs text-orange-500">
                              {section.products.length} 个商品
                              {section.story_text_i18n?.zh ? ` · ${section.story_text_i18n.zh.slice(0, 20)}...` : ''}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (sectionGroups.length <= 1) { toast.error('至少保留一个段落'); return; }
                              setSectionGroups(prev => prev.filter((_, i) => i !== sIdx));
                              // [BUG-M7 修复] 删除段落后正确调整 activeSectionIdx
                              if (activeSectionIdx === sIdx) {
                                setActiveSectionIdx(null);
                              } else if (activeSectionIdx !== null && activeSectionIdx > sIdx) {
                                setActiveSectionIdx(activeSectionIdx - 1);
                              }
                            }}
                            className="text-xs text-red-400 hover:text-red-600 px-2 py-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Section 展开内容 */}
                        {activeSectionIdx === sIdx && (
                          <div className="p-4 space-y-4">
                            {/* 场景化文案 */}
                            <div>
                              <label className="block text-xs text-gray-500 font-medium mb-1">场景化文案（三语）</label>
                              {['zh', 'ru', 'tg'].map(lang => (
                                <div key={lang} className="flex items-start gap-2 mt-1">
                                  <span className="text-xs text-gray-400 w-8 mt-2 flex-shrink-0">{lang.toUpperCase()}</span>
                                  <textarea
                                    value={section.story_text_i18n?.[lang] || ''}
                                    onChange={(e) => {
                                      setSectionGroups(prev => {
                                        const next = [...prev];
                                        next[sIdx] = {
                                          ...next[sIdx],
                                          story_text_i18n: { ...next[sIdx].story_text_i18n, [lang]: e.target.value },
                                        };
                                        return next;
                                      });
                                    }}
                                    className="w-full border rounded px-3 py-2 text-sm"
                                    rows={2}
                                    placeholder={lang === 'zh' ? '描述一个生活场景，引导用户理解这组商品的价值...' : ''}
                                  />
                                </div>
                              ))}
                            </div>

                            {/* 关联商品 */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs text-gray-500 font-medium">关联商品 ({section.products.length})</label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveSectionIdx(sIdx);
                                    setShowProductPicker(true);
                                  }}
                                  className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  添加商品
                                </button>
                              </div>

                              {section.products.length === 0 ? (
                                <div className="text-center py-4 text-gray-400 text-xs border border-dashed rounded">
                                  点击“添加商品”按钮添加商品到这个段落
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {section.products.map((sp, pIdx) => {
                                    const detail = topicProductDetails.get(sp.product_id);
                                    const pName = detail ? ((detail.name_i18n as I18nText)?.zh || (detail.name_i18n as I18nText)?.ru || sp.product_id.slice(0, 8)) : sp.product_id.slice(0, 8) + '...';
                                    return (
                                      <div key={pIdx} className="flex items-center gap-3 bg-gray-50 rounded px-3 py-2">
                                        <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                                        {detail?.image_url && (
                                          <img src={detail.image_url} alt="" className="w-8 h-8 object-cover rounded flex-shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm font-medium truncate">{pName}</div>
                                          <div className="text-xs text-gray-400">
                                            {detail ? `${detail.original_price} TJS` : sp.product_id.slice(0, 12)}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSectionGroups(prev => {
                                              const next = [...prev];
                                              next[sIdx] = {
                                                ...next[sIdx],
                                                products: next[sIdx].products.filter((_, i) => i !== pIdx),
                                              };
                                              return next;
                                            });
                                          }}
                                          className="text-red-400 hover:text-red-600"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* 添加新段落按钮 */}
                    <button
                      type="button"
                      onClick={() => {
                        setSectionGroups(prev => [...prev, { story_text_i18n: {}, products: [] }]);
                        setActiveSectionIdx(sectionGroups.length);
                      }}
                      className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg py-3 text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      添加新段落
                    </button>

                    {/* 商品选择器面板 */}
                    <ProductPickerPanel
                      open={showProductPicker}
                      onClose={() => setShowProductPicker(false)}
                      onConfirm={(products: ProductPickerItem[]) => {
                        // [BUG-M3 修复] 确保 targetIdx 在有效范围内
                        const rawIdx = activeSectionIdx ?? 0;
                        const targetIdx = Math.min(rawIdx, sectionGroups.length - 1);
                        const existingIds = new Set(
                          sectionGroups.flatMap(s => s.products.map(p => p.product_id))
                        );
                        const newProducts = products
                          .filter(p => !existingIds.has(p.id))
                          .map(p => ({ product_id: p.id }));
                        if (newProducts.length === 0) {
                          toast.error('所选商品已全部挂载');
                          return;
                        }
                        setSectionGroups(prev => {
                          const next = [...prev];
                          next[targetIdx] = {
                            ...next[targetIdx],
                            products: [...next[targetIdx].products, ...newProducts],
                          };
                          return next;
                        });
                        // 同时更新 topicProductDetails
                        const newMap = new Map(topicProductDetails);
                        products.forEach(p => {
                          if (!newMap.has(p.id)) {
                            newMap.set(p.id, {
                              id: p.id,
                              name_i18n: p.name_i18n || {},
                              image_url: p.image_url || '',
                              original_price: p.original_price || 0,
                              status: 'ACTIVE',
                            });
                          }
                        });
                        setTopicProductDetails(newMap);
                        toast.success(`已添加 ${newProducts.length} 个商品到段落 ${targetIdx + 1}`);
                      }}
                      existingProductIds={sectionGroups.flatMap(s => s.products.map(p => p.product_id))}
                      title="选择商品添加到段落"
                    />
                  </div>
                )}

                {/* [修复] 统一底部按钮区域 - 所有tab都显示保存和关闭按钮 */}
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
                    disabled={formSaving}
                    className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                  >
                    {formSaving ? '保存中...' : (editingItem ? '保存全部修改' : '创建')}
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
