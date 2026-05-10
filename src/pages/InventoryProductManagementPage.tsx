import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Eye, EyeOff, Package, History, ArrowUpDown, Sparkles, Brain, RefreshCw, Zap, Loader2, Truck, CheckSquare, Square, ShoppingBag, Check, X, Pencil } from 'lucide-react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { getSessionToken, adminQuery, adminInsert } from '@/lib/adminApi';
import { batchCreateLotteriesFromInventory } from '@/lib/lotteryHelpers';
import type { I18nText } from '@/types/homepage';
import { MultiImageUpload } from '@/components/MultiImageUpload';
import toast from 'react-hot-toast';
import { useSupabase } from '@/contexts/SupabaseContext';

type LocalizedAIText = {
  zh: string;
  ru: string;
  tg: string;
};

type InventoryAIText = string | Partial<LocalizedAIText>;

type InventorySemanticFacts = {
  parameter_highlights?: string[];
  usage_steps?: string[];
  usage_scenarios?: string[];
};

type InventoryAIUnderstanding = {
  target_people?: InventoryAIText;
  selling_angle?: InventoryAIText;
  how_to_use?: InventoryAIText;
  best_scene?: InventoryAIText;
  local_life_connection?: InventoryAIText;
  recommended_badge?: InventoryAIText;
  semantic_facts?: InventorySemanticFacts;
  generated_at?: string;
  generated_by?: string;
  model_used?: string;
  source_language?: 'multi' | 'tg' | 'ru' | 'zh';
  primary_market_language?: 'tg' | 'ru' | 'zh';
  display_priority?: Array<'tg' | 'ru' | 'zh'>;
};

interface InventoryProduct {
  id: string;
  name: string;
  name_i18n: { zh: string; ru: string; tg: string };
  description: string;
  description_i18n: { zh: string; ru: string; tg: string };
  image_url: string;
  image_urls: string[];
  specifications: string;
  specifications_i18n: { zh: string; ru: string; tg: string };
  material: string;
  material_i18n: { zh: string; ru: string; tg: string };
  details: string;
  details_i18n: { zh: string; ru: string; tg: string };
  original_price: number;
  cost_price: number;
  wholesale_price: number;
  retail_price: number;
  min_order_quantity: number;
  unit_measure: string;
  currency: string;
  stock: number;
  reserved_stock: number;
  sku: string;
  barcode: string;
  status: 'ACTIVE' | 'INACTIVE' | 'OUT_OF_STOCK';
  created_at: string;
  updated_at: string;
  ai_understanding?: InventoryAIUnderstanding | null;
  local_batch_id?: string | null;
}

interface InventoryTransaction {
  id: string;
  inventory_product_id: string;
  transaction_type: string;
  quantity: number;
  stock_before: number;
  stock_after: number;
  notes: string;
  created_at: string;
}

const emptyLocalizedAIText = (): LocalizedAIText => ({ zh: '', ru: '', tg: '' });
const emptySemanticFacts = (): Required<InventorySemanticFacts> => ({
  parameter_highlights: [],
  usage_steps: [],
  usage_scenarios: [],
});

const emptyAIUnderstandingForm = {
  target_people: emptyLocalizedAIText(),
  selling_angle: emptyLocalizedAIText(),
  how_to_use: emptyLocalizedAIText(),
  best_scene: emptyLocalizedAIText(),
  local_life_connection: emptyLocalizedAIText(),
  recommended_badge: emptyLocalizedAIText(),
  semantic_facts: emptySemanticFacts(),
  generated_at: '',
  generated_by: '',
  model_used: '',
  source_language: 'multi' as const,
  primary_market_language: 'tg' as const,
  display_priority: ['tg', 'ru', 'zh'] as Array<'tg' | 'ru' | 'zh'>,
};

const getAITextByLang = (value?: InventoryAIText | null, lang: keyof LocalizedAIText = 'zh') => {
  if (!value) return '';
  if (typeof value === 'string') return lang === 'ru' ? value : '';
  return value[lang] || '';
};

const normalizeFacts = (facts?: InventorySemanticFacts | null): Required<InventorySemanticFacts> => ({
  parameter_highlights: Array.isArray(facts?.parameter_highlights) ? facts?.parameter_highlights.filter(Boolean) : [],
  usage_steps: Array.isArray(facts?.usage_steps) ? facts?.usage_steps.filter(Boolean) : [],
  usage_scenarios: Array.isArray(facts?.usage_scenarios) ? facts?.usage_scenarios.filter(Boolean) : [],
});

const normalizeAIUnderstandingForForm = (value?: InventoryAIUnderstanding | null) => ({
  target_people: {
    zh: getAITextByLang(value?.target_people, 'zh'),
    ru: getAITextByLang(value?.target_people, 'ru'),
    tg: getAITextByLang(value?.target_people, 'tg'),
  },
  selling_angle: {
    zh: getAITextByLang(value?.selling_angle, 'zh'),
    ru: getAITextByLang(value?.selling_angle, 'ru'),
    tg: getAITextByLang(value?.selling_angle, 'tg'),
  },
  how_to_use: {
    zh: getAITextByLang(value?.how_to_use, 'zh'),
    ru: getAITextByLang(value?.how_to_use, 'ru'),
    tg: getAITextByLang(value?.how_to_use, 'tg'),
  },
  best_scene: {
    zh: getAITextByLang(value?.best_scene, 'zh'),
    ru: getAITextByLang(value?.best_scene, 'ru'),
    tg: getAITextByLang(value?.best_scene, 'tg'),
  },
  local_life_connection: {
    zh: getAITextByLang(value?.local_life_connection, 'zh'),
    ru: getAITextByLang(value?.local_life_connection, 'ru'),
    tg: getAITextByLang(value?.local_life_connection, 'tg'),
  },
  recommended_badge: {
    zh: getAITextByLang(value?.recommended_badge, 'zh'),
    ru: getAITextByLang(value?.recommended_badge, 'ru'),
    tg: getAITextByLang(value?.recommended_badge, 'tg'),
  },
  semantic_facts: normalizeFacts(value?.semantic_facts),
  generated_at: value?.generated_at || '',
  generated_by: value?.generated_by || '',
  model_used: value?.model_used || '',
  source_language: value?.source_language || 'multi' as const,
  primary_market_language: value?.primary_market_language || 'tg' as const,
  display_priority: value?.display_priority?.length ? value.display_priority : ['tg', 'ru', 'zh'],
});

export default function InventoryProductManagementPage() {
  const { supabase } = useSupabase();
  const { admin: adminUser } = useAdminAuth();
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  // 筛选 Tab：'ACTIVE' | 'INACTIVE' | 'OUT_OF_STOCK' | 'ALL'
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'INACTIVE' | 'OUT_OF_STOCK' | 'ALL'>('ACTIVE');
  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 10;
  const [showModal, setShowModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [adjustQuantity, setAdjustQuantity] = useState<number>(0);
  const [adjustNotes, setAdjustNotes] = useState<string>('');
  // AI 理解状态
  const [aiGeneratingId, setAiGeneratingId] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiViewProduct, setAiViewProduct] = useState<InventoryProduct | null>(null);
  // 批量 AI 理解回填状态
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    processed: number;
    successCount: number;
    errorCount: number;
    totalRemaining: number;
    currentBatch: number;
  } | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchLog, setBatchLog] = useState<Array<{ name: string; status: string; error?: string }>>([]);

  // 多选 & 本地批次
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [localBatchCreating, setLocalBatchCreating] = useState(false);
  // 一键创建商城活动（lotteries）状态
  const [batchCreateLotteryRunning, setBatchCreateLotteryRunning] = useState(false);

  // 行内快速编辑B2B价格状态（成本价 & 批发价）
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [editingCostValue, setEditingCostValue] = useState<string>('');
  const [savingCostId, setSavingCostId] = useState<string | null>(null);
  const [editingWholesaleId, setEditingWholesaleId] = useState<string | null>(null);
  const [editingWholesaleValue, setEditingWholesaleValue] = useState<string>('');
  const [savingWholesaleId, setSavingWholesaleId] = useState<string | null>(null);

  // 商品分类
  const [categories, setCategories] = useState<{ id: string; code: string; name_i18n: I18nText }[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  const [formData, setFormData] = useState({
    name_zh: '',
    name_ru: '',
    name_tg: '',
    description_zh: '',
    description_ru: '',
    description_tg: '',
    specifications_zh: '',
    specifications_ru: '',
    specifications_tg: '',
    material_zh: '',
    material_ru: '',
    material_tg: '',
    details_zh: '',
    details_ru: '',
    details_tg: '',
    image_url: '',
    image_urls: [] as string[],
    original_price: 0,
    cost_price: 0,
    wholesale_price: 0,
    retail_price: 0,
    min_order_quantity: 1,
    unit_measure: '件',
    currency: 'TJS',
    stock: 0,
    sku: '',
    barcode: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'OUT_OF_STOCK',
    ai_understanding: { ...emptyAIUnderstandingForm },
  });

  const updateAIUnderstandingField = (
    field: 'target_people' | 'selling_angle' | 'how_to_use' | 'best_scene' | 'local_life_connection' | 'recommended_badge',
    lang: keyof LocalizedAIText,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      ai_understanding: {
        ...prev.ai_understanding,
        [field]: {
          ...prev.ai_understanding[field],
          [lang]: value,
        },
      },
    }));
  };

  // 切换 Tab 时重置到第1页；currentPage 变化时直接 fetch
  // 合并为单一 effect 避免竞态导致 HTTP 416
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1); // 这会再次触发本 effect，届时 currentPage===1 时执行 fetch
    } else {
      fetchProducts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    fetchProducts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // 加载商品分类列表
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await adminQuery<{ id: string; code: string; name_i18n: I18nText }>(supabase, 'homepage_categories', {
          select: 'id, code, name_i18n',
          filters: [{ col: 'is_active', op: 'eq', val: true }],
          orderBy: 'sort_order',
          orderAsc: true,
        });
        setCategories(data || []);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      }
    };
    fetchCategories();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('inventory_products')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }

      const { data, error, count } = await query;
      if (error) { throw error; }
      setProducts(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      toast.error('获取库存商品列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (productId: string) => {
    try {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('*')
        .eq('inventory_product_id', productId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {throw error;}
      setTransactions(data || []);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      toast.error('获取库存变动记录失败');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const buildLocalizedField = (
      field: keyof Pick<
        typeof formData.ai_understanding,
        'target_people' | 'selling_angle' | 'how_to_use' | 'best_scene' | 'local_life_connection' | 'recommended_badge'
      >
    ) => {
      const value = formData.ai_understanding[field];
      if (!value || typeof value === 'string') return null;
      const normalized = {
        zh: value.zh.trim(),
        ru: value.ru.trim(),
        tg: value.tg.trim(),
      };
      return normalized.zh || normalized.ru || normalized.tg ? normalized : null;
    };

    const semanticFacts = {
      parameter_highlights: formData.ai_understanding.semantic_facts.parameter_highlights.map((item) => item.trim()).filter(Boolean),
      usage_steps: formData.ai_understanding.semantic_facts.usage_steps.map((item) => item.trim()).filter(Boolean),
      usage_scenarios: formData.ai_understanding.semantic_facts.usage_scenarios.map((item) => item.trim()).filter(Boolean),
    };

    const aiUnderstanding = Object.fromEntries(
      Object.entries({
        target_people: buildLocalizedField('target_people'),
        selling_angle: buildLocalizedField('selling_angle'),
        how_to_use: buildLocalizedField('how_to_use'),
        best_scene: buildLocalizedField('best_scene'),
        local_life_connection: buildLocalizedField('local_life_connection'),
        recommended_badge: buildLocalizedField('recommended_badge'),
        semantic_facts: semanticFacts.parameter_highlights.length || semanticFacts.usage_steps.length || semanticFacts.usage_scenarios.length
          ? semanticFacts
          : undefined,
        generated_at: formData.ai_understanding.generated_at || undefined,
        generated_by: formData.ai_understanding.generated_by || undefined,
        model_used: formData.ai_understanding.model_used || undefined,
        source_language: formData.ai_understanding.source_language || 'multi',
        primary_market_language: formData.ai_understanding.primary_market_language || 'tg',
        display_priority: formData.ai_understanding.display_priority?.length ? formData.ai_understanding.display_priority : ['tg', 'ru', 'zh'],
      }).filter(([, value]) => value !== '' && value !== undefined && value !== null)
    );

    const productData = {
      name: formData.name_zh,
      name_i18n: {
        zh: formData.name_zh,
        ru: formData.name_ru,
        tg: formData.name_tg,
      },
      description: formData.description_zh,
      description_i18n: {
        zh: formData.description_zh,
        ru: formData.description_ru,
        tg: formData.description_tg,
      },
      specifications: formData.specifications_zh,
      specifications_i18n: {
        zh: formData.specifications_zh,
        ru: formData.specifications_ru,
        tg: formData.specifications_tg,
      },
      material: formData.material_zh,
      material_i18n: {
        zh: formData.material_zh,
        ru: formData.material_ru,
        tg: formData.material_tg,
      },
      details: formData.details_zh,
      details_i18n: {
        zh: formData.details_zh,
        ru: formData.details_ru,
        tg: formData.details_tg,
      },
      image_url: formData.image_urls[0] || formData.image_url,
      image_urls: formData.image_urls,
      original_price: formData.original_price,
      cost_price: formData.cost_price,
      wholesale_price: formData.wholesale_price,
      retail_price: formData.retail_price,
      min_order_quantity: formData.min_order_quantity,
      unit_measure: formData.unit_measure,
      currency: formData.currency,
      stock: formData.stock,
      sku: formData.sku || null,
      barcode: formData.barcode || null,
      status: formData.status,
      ai_understanding: Object.keys(aiUnderstanding).length > 0 ? aiUnderstanding : null,
    };

    try {
      let productId: string | null = null;

      if (editingProduct) {
        const { error } = await supabase
          .from('inventory_products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) {throw error;}
        productId = editingProduct.id;
        toast.success('库存商品更新成功');
      } else {
        const { data: insertedData, error } = await supabase
          .from('inventory_products')
          .insert([productData])
          .select('id')
          .single();

        if (error) {throw error;}
        productId = insertedData?.id || null;
        toast.success('库存商品创建成功');
      }

      // 处理商品分类关联
      if (productId) {
        try {
          // 先删除旧的分类关联
          await supabase
            .from('product_categories')
            .delete()
            .eq('product_id', productId);
          // 如果选择了分类，创建新的关联
          if (selectedCategoryId) {
            await supabase
              .from('product_categories')
              .insert({ product_id: productId, category_id: selectedCategoryId });
          }
        } catch (catErr: any) {
          console.warn('分类关联操作失败:', catErr.message);
        }
      }

      setShowModal(false);
      setEditingProduct(null);
      resetForm();
      setCurrentPage(1);
      fetchProducts();
    } catch (error: any) {
      console.error('Failed to save product:', error);
      toast.error(error.message || '保存库存商品失败');
    }
  };

  const handleEdit = async (product: InventoryProduct) => {
    setEditingProduct(product);
    setFormData({
      name_zh: product.name_i18n?.zh || product.name || '',
      name_ru: product.name_i18n?.ru || '',
      name_tg: product.name_i18n?.tg || '',
      description_zh: product.description_i18n?.zh || product.description || '',
      description_ru: product.description_i18n?.ru || '',
      description_tg: product.description_i18n?.tg || '',
      specifications_zh: product.specifications_i18n?.zh || product.specifications || '',
      specifications_ru: product.specifications_i18n?.ru || '',
      specifications_tg: product.specifications_i18n?.tg || '',
      material_zh: product.material_i18n?.zh || product.material || '',
      material_ru: product.material_i18n?.ru || '',
      material_tg: product.material_i18n?.tg || '',
      details_zh: product.details_i18n?.zh || product.details || '',
      details_ru: product.details_i18n?.ru || '',
      details_tg: product.details_i18n?.tg || '',
      image_url: product.image_url || '',
      image_urls: product.image_urls || [],
      original_price: product.original_price || 0,
      cost_price: product.cost_price || 0,
      wholesale_price: product.wholesale_price || 0,
      retail_price: product.retail_price || 0,
      min_order_quantity: product.min_order_quantity || 1,
      unit_measure: product.unit_measure || '件',
      currency: product.currency || 'TJS',
      stock: product.stock || 0,
      sku: product.sku || '',
      barcode: product.barcode || '',
      status: product.status || 'ACTIVE',
      ai_understanding: normalizeAIUnderstandingForForm(product.ai_understanding),
    });
    // 加载该商品的分类关联
    try {
      const { data: catRelations } = await supabase
        .from('product_categories')
        .select('category_id')
        .eq('product_id', product.id)
        .limit(1);
      setSelectedCategoryId(catRelations?.[0]?.category_id || '');
    } catch {
      setSelectedCategoryId('');
    }
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个库存商品吗？删除后无法恢复。')) {return;}

    try {
      // 检查关联的积分商城商品
      const { data: linkedLotteries } = await supabase
        .from('lotteries')
        .select('id, title, title_i18n, status')
        .eq('inventory_product_id', id);

      if (linkedLotteries && linkedLotteries.length > 0) {
        // 检查是否有进行中的商城商品
        const activeLotteries = linkedLotteries.filter((l: any) => l.status === 'ACTIVE' || l.status === 'PENDING');
        if (activeLotteries.length > 0) {
          const lotteryNames = activeLotteries.map((l: any) => {
            const i18n = l.title_i18n;
            if (i18n && typeof i18n === 'object') {
              return (i18n as any).zh || (i18n as any).ru || (i18n as any).tg || l.title || '未命名';
            }
            return typeof l.title === 'string' ? l.title : '未命名';
          }).join('、');
          const confirmed = window.confirm(
            `该库存商品关联了 ${activeLotteries.length} 个进行中的商城商品：\n${lotteryNames}\n\n删除库存商品将同时自动取消这些商城商品。\n\n确定要继续删除吗？`
          );
          if (!confirmed) return;

          // 自动联动取消关联的积分商城商品
          const lotteryIds = activeLotteries.map((l: any) => l.id);
          const { error: cancelError } = await supabase
            .from('lotteries')
            .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
            .in('id', lotteryIds);

          if (cancelError) {
            console.error('Failed to cancel linked lotteries:', cancelError);
            toast.error('联动取消商城商品失败：' + cancelError.message);
            return;
          }
          toast.success(`已自动取消 ${activeLotteries.length} 个关联的商城商品`);
        }

        // 解除所有关联商城商品的 inventory_product_id 关联，以便删除库存商品
        const allLotteryIds = linkedLotteries.map((l: any) => l.id);
        const { error: unlinkError } = await supabase
          .from('lotteries')
          .update({ inventory_product_id: null })
          .in('id', allLotteryIds);

        if (unlinkError) {
          console.error('Failed to unlink lotteries:', unlinkError);
          toast.error('解除商城商品关联失败：' + unlinkError.message);
          return;
        }
      }

      // 修复 A02-2 / 2026-05: 检查是否有未完成的全款购买订单。
      // full_purchase_orders 表通过 lottery_id (text) 关联 lotteries，
      // 不直接持有 inventory_product_id 列。因此必须先经 lotteries 跳转。
      const linkedLotteryIds = (linkedLotteries || []).map((l: any) => String(l.id));
      if (linkedLotteryIds.length > 0) {
        const { data: activeOrders, error: ordersError } = await supabase
          .from('full_purchase_orders')
          .select('id')
          .in('lottery_id', linkedLotteryIds)
          .in('status', ['pending', 'processing', 'paid', 'shipped'])
          .limit(1);
        if (ordersError) {
          console.error('Failed to check active orders:', ordersError);
          toast.error('校验未完成订单失败：' + ordersError.message);
          return;
        }
        if (activeOrders && activeOrders.length > 0) {
          toast.error('该商品存在未完成的订单（待处理/已支付/已发货），无法删除。请先处理相关订单。');
          return;
        }
      }

      const { error } = await supabase
        .from('inventory_products')
        .delete()
        .eq('id', id);

      if (error) {throw error;}
      toast.success('库存商品删除成功');
      setCurrentPage(1);
      fetchProducts();
    } catch (error) {
      console.error('Failed to delete product:', error);
      toast.error('删除库存商品失败');
    }
  };

  const toggleStatus = async (product: InventoryProduct) => {
    try {
      let newStatus: 'ACTIVE' | 'INACTIVE' | 'OUT_OF_STOCK';
      if (product.status === 'ACTIVE') {
        // 【联动检查】下架前检查是否有关联的 ACTIVE 积分商城商品
        const { data: linkedLotteries, error: checkError } = await supabase
          .from('lotteries')
          .select('id, title, title_i18n')
          .eq('inventory_product_id', product.id)
          .in('status', ['ACTIVE', 'PENDING']);

        if (!checkError && linkedLotteries && linkedLotteries.length > 0) {
          const lotteryNames = linkedLotteries.map((l: any) => {
            const i18n = l.title_i18n;
            if (i18n && typeof i18n === 'object') {
              return (i18n as any).zh || (i18n as any).ru || (i18n as any).tg || l.title || '未命名';
            }
            return typeof l.title === 'string' ? l.title : '未命名';
          }).join('、');
          const confirmed = window.confirm(
            `该库存商品关联了 ${linkedLotteries.length} 个积分商城商品：\n${lotteryNames}\n\n下架库存商品将同时自动下架这些商城商品（状态改为 CANCELLED）。\n\n确定要继续下架吗？`
          );
          if (!confirmed) return;

          // 【自动联动】将关联的积分商城商品状态改为 CANCELLED
          const lotteryIds = linkedLotteries.map((l: any) => l.id);
          const { error: updateLotteryError } = await supabase
            .from('lotteries')
            .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
            .in('id', lotteryIds);

          if (updateLotteryError) {
            console.error('Failed to cancel linked lotteries:', updateLotteryError);
            toast.error('联动下架商城商品失败：' + updateLotteryError.message);
            return;
          }
          toast.success(`已自动下架 ${linkedLotteries.length} 个关联的商城商品`);
        }

        newStatus = 'INACTIVE';
      } else {
        // 修复 A02-4: 库存为 0 时不允许上架为 ACTIVE，应设为 OUT_OF_STOCK
        newStatus = product.stock <= 0 ? 'OUT_OF_STOCK' : 'ACTIVE';
        if (product.stock <= 0) {
          toast.error('库存为 0，无法上架。请先补充库存。');
          return;
        }
      }
      const { error } = await supabase
        .from('inventory_products')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', product.id);

      if (error) {throw error;}
      toast.success(newStatus === 'INACTIVE' ? '库存商品已下架' : '库存商品已上架');
      fetchProducts();
    } catch (error) {
      console.error('Failed to toggle status:', error);
      toast.error('状态切换失败');
    }
  };

  // ====== 行内快速编辑成本价 ======
  const startEditCost = (product: InventoryProduct) => {
    setEditingCostId(product.id);
    setEditingCostValue(String(product.cost_price ?? 0));
  };
  const cancelEditCost = () => {
    setEditingCostId(null);
    setEditingCostValue('');
  };
  const submitEditCost = async (product: InventoryProduct) => {
    const trimmed = editingCostValue.trim();
    if (trimmed === '') { toast.error('请输入成本价'); return; }
    const newPrice = Number(trimmed);
    if (!Number.isFinite(newPrice) || newPrice < 0) { toast.error('成本价必须是大于等于 0 的数字'); return; }
    if (newPrice > 9999999) { toast.error('价格超出合理范围'); return; }
    const rounded = Math.round(newPrice * 100) / 100;
    if (rounded === Number(product.cost_price)) { cancelEditCost(); return; }
    try {
      setSavingCostId(product.id);
      const { error } = await supabase
        .from('inventory_products')
        .update({ cost_price: rounded, updated_at: new Date().toISOString() })
        .eq('id', product.id);
      if (error) { throw error; }
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, cost_price: rounded } : p));
      toast.success(`成本价已更新为 ${product.currency || 'TJS'} ${rounded}`);
      cancelEditCost();
    } catch (err: any) {
      console.error('Failed to quick update cost_price:', err);
      toast.error('成本价更新失败：' + (err?.message || '未知错误'));
    } finally {
      setSavingCostId(null);
    }
  };

  // ====== 行内快速编辑批发价 ======
  const startEditWholesale = (product: InventoryProduct) => {
    setEditingWholesaleId(product.id);
    setEditingWholesaleValue(String(product.wholesale_price ?? 0));
  };
  const cancelEditWholesale = () => {
    setEditingWholesaleId(null);
    setEditingWholesaleValue('');
  };
  const submitEditWholesale = async (product: InventoryProduct) => {
    const trimmed = editingWholesaleValue.trim();
    if (trimmed === '') { toast.error('请输入批发价'); return; }
    const newPrice = Number(trimmed);
    if (!Number.isFinite(newPrice) || newPrice < 0) { toast.error('批发价必须是大于等于 0 的数字'); return; }
    if (newPrice > 9999999) { toast.error('价格超出合理范围'); return; }
    const rounded = Math.round(newPrice * 100) / 100;
    if (rounded === Number(product.wholesale_price)) { cancelEditWholesale(); return; }
    try {
      setSavingWholesaleId(product.id);
      const { error } = await supabase
        .from('inventory_products')
        .update({ wholesale_price: rounded, updated_at: new Date().toISOString() })
        .eq('id', product.id);
      if (error) { throw error; }
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, wholesale_price: rounded } : p));
      toast.success(`批发价已更新为 ${product.currency || 'TJS'} ${rounded}`);
      cancelEditWholesale();
    } catch (err: any) {
      console.error('Failed to quick update wholesale_price:', err);
      toast.error('批发价更新失败：' + (err?.message || '未知错误'));
    } finally {
      setSavingWholesaleId(null);
    }
  };

  const handleShowHistory = async (product: InventoryProduct) => {
    setSelectedProduct(product);
    await fetchTransactions(product.id);
    setShowHistoryModal(true);
  };

  const handleShowAdjust = (product: InventoryProduct) => {
    setSelectedProduct(product);
    setAdjustQuantity(0);
    setAdjustNotes('');
    setShowAdjustModal(true);
  };

  const handleAdjustStock = async () => {
    if (!selectedProduct || adjustQuantity === 0) {
      toast.error('请输入有效的调整数量（不能为 0）');
      return;
    }
    // 修复 A02-3: 调整数量范围限制
    if (Math.abs(adjustQuantity) > 99999) {
      toast.error('单次调整数量不能超过 99999');
      return;
    }

    try {
      // 修复 A02-1: 使用原子操作避免竞态条件 - 先查最新库存再原子更新
      const { data: latestProduct, error: fetchError } = await supabase
        .from('inventory_products')
        .select('stock')
        .eq('id', selectedProduct.id)
        .single();

      if (fetchError || !latestProduct) throw new Error('无法获取最新库存数据');

      const currentStock = latestProduct.stock;
      const newStock = currentStock + adjustQuantity;
      if (newStock < 0) {
        toast.error(`库存不足，当前库存为 ${currentStock}，无法减少 ${Math.abs(adjustQuantity)}`);
        return;
      }

      // 原子更新：同时更新库存和状态
      const newStatus = newStock === 0 ? 'OUT_OF_STOCK' : (selectedProduct.status === 'OUT_OF_STOCK' ? 'ACTIVE' : selectedProduct.status);
      const { error: updateError } = await supabase
        .from('inventory_products')
        .update({ stock: newStock, status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', selectedProduct.id)
        .eq('stock', currentStock); // 乐观锁：确保库存未被他人修改

      if (updateError) throw updateError;

      // 记录库存变动
      const { error: transactionError } = await supabase
        .from('inventory_transactions')
        .insert({
          inventory_product_id: selectedProduct.id,
          transaction_type: adjustQuantity > 0 ? 'STOCK_IN' : 'STOCK_OUT',
          quantity: adjustQuantity,
          stock_before: currentStock,
          stock_after: newStock,
          notes: adjustNotes || (adjustQuantity > 0 ? '手动入库' : '手动出库'),
        });

      if (transactionError) {
        console.error('Failed to log transaction:', transactionError);
      }

      toast.success(`库存调整成功：${currentStock} → ${newStock}`);
      setShowAdjustModal(false);
      fetchProducts();
    } catch (error) {
      console.error('Failed to adjust stock:', error);
      toast.error('库存调整失败，可能存在并发冲突，请刷新后重试');
    }
  };

  // ─── AI 理解生成（异步派发 + 轮询） ─────────────────────────
  // 【背景】Supabase Edge Functions 网关存在 150s idle timeout，
  //   原同步链路（qwen-vl-max + qwen3.5-plus + 重试）轻易超过此阈值
  //   导致 504 Gateway Timeout（详见 ai-understanding-generate v3.0）。
  // 【方案】后端改为派发任务后立即返回 job_id，由前端通过
  //   ai-understanding-job-status 接口轮询，直到 succeeded / failed。
  const handleGenerateAI = async (product: InventoryProduct, forceRegenerate = false) => {
    setAiGeneratingId(product.id);

    const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
    const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error('请先登录');
      setAiGeneratingId(null);
      return;
    }

    const callJson = async (path: string, init: RequestInit) => {
      const resp = await fetch(`${supabaseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'x-admin-session-token': sessionToken,
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
          ...(init.headers || {}),
        },
      });
      const text = await resp.text();
      let data: any = {};
      if (text) {
        try { data = JSON.parse(text); } catch { data = { error: text }; }
      }
      return { resp, data };
    };

    let progressToastId: string | number | undefined;

    try {
      // 1) 派发任务
      const { resp, data: result } = await callJson(
        '/functions/v1/ai-understanding-generate',
        {
          method: 'POST',
          body: JSON.stringify({
            product_id: product.id,
            force_regenerate: forceRegenerate,
          }),
        },
      );

      if (!resp.ok && resp.status !== 202) {
        const statusHint = resp.status ? ` (HTTP ${resp.status})` : '';
        throw new Error(result.error || `AI 理解派发失败${statusHint}`);
      }

      // 兼容旧路径：已有数据 + 非强制重生成 → 同步成功
      if (result.skipped) {
        toast.success('该商品已有 AI 理解数据');
        fetchProducts();
        return;
      }

      // 兼容旧路径：偶发同步成功（旧版本未升级时）
      if (result.success && result.ai_understanding && result.status !== 'pending' && result.status !== 'processing') {
        toast.success('AI 商品理解生成成功！');
        fetchProducts();
        return;
      }

      const jobId: string | undefined = result.job_id;
      if (!jobId) {
        throw new Error('后端未返回 job_id，无法轮询任务状态');
      }

      progressToastId = toast.loading('AI 商品理解任务已派发，正在生成…');

      // 2) 轮询：3s 间隔，最长 5 分钟
      const startedAt = Date.now();
      const POLL_INTERVAL_MS = 3000;
      const MAX_DURATION_MS = 5 * 60 * 1000;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() - startedAt > MAX_DURATION_MS) {
          throw new Error('AI 理解生成超时（>5min），请稍后查看商品列表或重试');
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

        const { resp: sResp, data: sData } = await callJson(
          `/functions/v1/ai-understanding-job-status?job_id=${encodeURIComponent(jobId)}`,
          { method: 'GET' },
        );
        if (!sResp.ok) {
          // 网络抖动：继续重试，不直接失败
          // eslint-disable-next-line no-console
          console.warn('[ai-understanding] 状态查询失败，继续重试:', sResp.status, sData);
          continue;
        }
        const job = sData?.job;
        if (!job) continue;

        if (job.status === 'succeeded') {
          if (progressToastId !== undefined) toast.dismiss(progressToastId);
          toast.success('AI 商品理解生成成功！');
          fetchProducts();
          return;
        }
        if (job.status === 'failed') {
          throw new Error(job.error || 'AI 理解生成失败');
        }
        // pending / processing：刷新 loading 文案
        if (progressToastId !== undefined) {
          toast.loading(
            `AI 生成中…${job.stage ? `（${job.stage}）` : ''} ${job.progress || 0}%`,
            { id: progressToastId },
          );
        }
      }
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('AI 理解生成失败:', error);
      if (progressToastId !== undefined) toast.dismiss(progressToastId);
      toast.error(error.message || 'AI 理解生成失败');
    } finally {
      setAiGeneratingId(null);
    }
  };

  /**
   * 批量 AI 理解回填：循环调用 ai-understanding-batch Edge Function，
   * 每批处理 batch_size 个商品，直到所有商品都处理完毕。
   */
  const handleBatchAI = async () => {
    setBatchRunning(true);
    setBatchLog([]);
    setBatchProgress(null);
    setShowBatchModal(true);

    const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
    const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error('请先登录');
      setBatchRunning(false);
      return;
    }

    const BATCH_SIZE = 5;
    let offset = 0;
    let batchNum = 0;
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalError = 0;

    try {
      while (true) {
        batchNum++;
        setBatchProgress(prev => ({
          processed: totalProcessed,
          successCount: totalSuccess,
          errorCount: totalError,
          totalRemaining: prev?.totalRemaining ?? 0,
          currentBatch: batchNum,
        }));

        const response = await fetch(`${supabaseUrl}/functions/v1/ai-understanding-batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-session-token': sessionToken,
            'Authorization': `Bearer ${anonKey}`,
            'apikey': anonKey,
          },
          body: JSON.stringify({
            batch_size: BATCH_SIZE,
            offset: 0,  // 始终从 0 开始，因为已处理的商品不再是 NULL
            delay_ms: 2000,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || '批量处理失败');
        }

        // 没有更多商品需要处理
        if (result.processed === 0) {
          setBatchProgress({
            processed: totalProcessed,
            successCount: totalSuccess,
            errorCount: totalError,
            totalRemaining: 0,
            currentBatch: batchNum,
          });
          break;
        }

        totalProcessed += result.processed;
        totalSuccess += result.success_count;
        totalError += result.error_count;

        // 更新日志
        setBatchLog(prev => [
          ...prev,
          ...result.results.map((r: any) => ({
            name: r.name,
            status: r.status,
            error: r.error,
          })),
        ]);

        setBatchProgress({
          processed: totalProcessed,
          successCount: totalSuccess,
          errorCount: totalError,
          totalRemaining: result.total_remaining,
          currentBatch: batchNum,
        });

        // 如果没有剩余商品，结束循环
        if (result.total_remaining <= 0) {
          break;
        }

        // 批次间省略 offset，因为已处理的商品不再匹配 NULL 条件
      }

      toast.success(`批量回填完成！成功 ${totalSuccess} 个，失败 ${totalError} 个`);
      fetchProducts();
    } catch (error: any) {
      console.error('批量 AI 理解失败:', error);
      toast.error(error.message || '批量处理失败');
    } finally {
      setBatchRunning(false);
    }
  };

  // ─── 多选辅助函数 ────────────────────────────────────────
  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedProductIds.size === products.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(products.map(p => p.id)));
    }
  };

  // 筛选出当前选中且未关联本地批次的商品
  const selectedUnbatchedProducts = products.filter(
    p => selectedProductIds.has(p.id) && !p.local_batch_id
  );

  // ─── 一键生成本地批次 ──────────────────────────────────────
  const handleCreateLocalBatch = async () => {
    if (selectedUnbatchedProducts.length === 0) {
      toast.error('请先选择未关联批次的商品');
      return;
    }
    if (!adminUser?.id) {
      toast.error('请先登录');
      return;
    }

    try {
      setLocalBatchCreating(true);

      // 1. 生成批次号 LOCAL-STOCK-YYYYMMDD-NN
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

      const { data: existingBatches } = await supabase
        .from('shipment_batches')
        .select('batch_no')
        .like('batch_no', `LOCAL-${dateStr}-%`)
        .order('batch_no', { ascending: false })
        .limit(1);

      let seqNum = 1;
      if (existingBatches && existingBatches.length > 0) {
        const match = existingBatches[0].batch_no.match(/LOCAL-\d{8}-(\d+)/);
        if (match) seqNum = parseInt(match[1]) + 1;
      }
      const batchNo = `LOCAL-${dateStr}-${seqNum.toString().padStart(2, '0')}`;

      // 2. 创建 ARRIVED 状态的本地批次
      const { data: batch, error: createErr } = await supabase
        .from('shipment_batches')
        .insert({
          batch_no: batchNo,
          status: 'ARRIVED',
          shipped_at: new Date().toISOString(),
          arrived_at: new Date().toISOString(),
          total_orders: selectedUnbatchedProducts.length,
          normal_orders: selectedUnbatchedProducts.length,
          missing_orders: 0,
          damaged_orders: 0,
          admin_note: `本地库存批次 - 包含 ${selectedUnbatchedProducts.length} 个已到货商品`,
          created_by: adminUser.id,
        })
        .select()
        .single();

      if (createErr) throw createErr;

      // 3. 更新选中商品的 local_batch_id
      const productIds = selectedUnbatchedProducts.map(p => p.id);
      const { error: updateErr } = await supabase
        .from('inventory_products')
        .update({ local_batch_id: batch.id })
        .in('id', productIds);

      if (updateErr) throw updateErr;

      // 4. 查找关联的已完成订单并更新 logistics_status 为 READY_FOR_PICKUP
      // 关联链路: inventory_products -> lotteries.inventory_product_id -> full_purchase_orders.lottery_id
      let updatedOrderCount = 0;
      for (const product of selectedUnbatchedProducts) {
        // 查找关联此 inventory_product 的 lotteries
        const { data: relatedLotteries } = await supabase
          .from('lotteries')
          .select('id')
          .eq('inventory_product_id', product.id);

        if (relatedLotteries && relatedLotteries.length > 0) {
          const lotteryIds = relatedLotteries.map((l: any) => l.id);
          // 更新这些 lottery 关联的已完成但未发货的 full_purchase_orders
          const { data: updatedOrders } = await supabase
            .from('full_purchase_orders')
            .update({
              logistics_status: 'READY_FOR_PICKUP',
              pickup_status: 'PENDING_PICKUP',
              batch_id: batch.id,
            })
            .in('lottery_id', lotteryIds)
            .eq('status', 'COMPLETED')
            .eq('logistics_status', 'PENDING_SHIPMENT')
            .select('id');

          if (updatedOrders) {
            updatedOrderCount += updatedOrders.length;
          }
        }
      }

      const orderMsg = updatedOrderCount > 0 ? `，已更新 ${updatedOrderCount} 个订单为可提货` : '';
      toast.success(`本地批次 ${batchNo} 创建成功，已关联 ${productIds.length} 个商品${orderMsg}`);
      setSelectedProductIds(new Set());
      fetchProducts();
    } catch (error: any) {
      console.error('Failed to create local batch:', error);
      toast.error(error.message || '创建本地批次失败');
    } finally {
      setLocalBatchCreating(false);
    }
  };

  // ─── 一键创建商城活动（lotteries）──────────────────
  // 仅处理当前选中且状态为 ACTIVE 的库存商品；已存在 PENDING/ACTIVE/SOLD_OUT
  // 活动的商品会被自动忽略。默认状态 ACTIVE（进行中）、比价留空。
  const handleBatchCreateLotteries = async () => {
    const selected = products.filter(p => selectedProductIds.has(p.id));
    if (selected.length === 0) {
      toast.error('请先选择需要创建活动的商品');
      return;
    }
    if (!adminUser?.id) {
      toast.error('请先登录');
      return;
    }

    try {
      setBatchCreateLotteryRunning(true);
      // 复用共享 helper：状态默认 ACTIVE、比价 [] 、其他字段从库存商品读取
      const result = await batchCreateLotteriesFromInventory(
        supabase,
        selected.map(p => ({
          id: p.id,
          name: p.name,
          name_i18n: p.name_i18n,
          description_i18n: p.description_i18n,
          image_url: p.image_url,
          image_urls: p.image_urls,
          original_price: p.original_price,
          stock: p.stock,
          status: p.status,
          sku: p.sku,
          ai_understanding: p.ai_understanding ?? null,
        })),
        {
          status: 'ACTIVE',
          priceComparisons: [],
        }
      );

      // 汇总消息
      const parts: string[] = [];
      if (result.created.length > 0) parts.push(`创建成功 ${result.created.length} 个`);
      if (result.skipped.length > 0) parts.push(`跳过已存在活动 ${result.skipped.length} 个`);
      if (result.inactive.length > 0) parts.push(`跳过非上架商品 ${result.inactive.length} 个`);
      if (result.insufficientStock.length > 0) parts.push(`库存不足 ${result.insufficientStock.length} 个`);
      if (result.failed.length > 0) parts.push(`失败 ${result.failed.length} 个`);
      const summary = parts.length > 0 ? parts.join('、') : '未创建任何活动';

      if (result.created.length > 0 && result.failed.length === 0) {
        toast.success(summary);
      } else if (result.created.length > 0) {
        toast.success(summary);
        // 额外提示失败详情
        const firstErr = result.failed[0];
        if (firstErr) toast.error(`部分创建失败：${firstErr.error}`);
      } else if (result.failed.length > 0) {
        toast.error(`${summary}；首个错误：${result.failed[0].error}`);
      } else {
        // 所有都被跳过
        toast(summary, { icon: 'ℹ️' });
      }

      setSelectedProductIds(new Set());
      fetchProducts();
    } catch (error: any) {
      console.error('Failed to batch create lotteries:', error);
      toast.error(error.message || '一键创建商城活动失败');
    } finally {
      setBatchCreateLotteryRunning(false);
    }
  };

  const handleViewAI = (product: InventoryProduct) => {
    setAiViewProduct(product);
    setShowAiModal(true);
  };

  const resetForm = () => {
    setFormData({
      name_zh: '',
      name_ru: '',
      name_tg: '',
      description_zh: '',
      description_ru: '',
      description_tg: '',
      specifications_zh: '',
      specifications_ru: '',
      specifications_tg: '',
      material_zh: '',
      material_ru: '',
      material_tg: '',
      details_zh: '',
      details_ru: '',
      details_tg: '',
      image_url: '',
      image_urls: [],
      original_price: 0,
      currency: 'TJS',
      stock: 0,
      sku: '',
      barcode: '',
      status: 'ACTIVE',
      ai_understanding: normalizeAIUnderstandingForForm(null),
    });
    setSelectedCategoryId('');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-700">上架</span>;
      case 'INACTIVE':
        return <span className="px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-700">下架</span>;
      case 'OUT_OF_STOCK':
        return <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700">缺货</span>;
      default:
        return <span className="px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-700">{status}</span>;
    }
  };

  const getTransactionTypeName = (type: string) => {
    const typeNames: Record<string, string> = {
      'FULL_PURCHASE': '全款购买',
      'LOTTERY_PRIZE': '一元购物中奖',
      'STOCK_IN': '入库',
      'STOCK_OUT': '出库',
      'ADJUSTMENT': '库存调整',
      'RESERVE': '预留',
      'RELEASE_RESERVE': '释放预留',
    };
    return typeNames[type] || type;
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-7 h-7" />
            库存商品管理
          </h1>
          <p className="text-gray-500 text-sm mt-1">管理仓库实际库存，用于全款购买和一元购物中奖发货</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleBatchAI}
            disabled={batchRunning}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {batchRunning ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Zap className="w-5 h-5" />
            )}
            {batchRunning ? '批量处理中...' : '批量 AI 理解'}
          </button>
          <button
            onClick={handleBatchCreateLotteries}
            disabled={batchCreateLotteryRunning || selectedProductIds.size === 0}
            title="为选中的库存商品一键创建商城活动（已有进行中/待开始/售罄活动的商品会被自动忽略）"
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-blue-500 text-white px-4 py-2 rounded-lg hover:from-indigo-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {batchCreateLotteryRunning ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ShoppingBag className="w-5 h-5" />
            )}
            {batchCreateLotteryRunning
              ? '创建中...'
              : selectedProductIds.size > 0
                ? `一键创建商城活动 (${selectedProductIds.size})`
                : '一键创建商城活动'}
          </button>
          <button
            onClick={handleCreateLocalBatch}
            disabled={localBatchCreating || selectedUnbatchedProducts.length === 0}
            className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-teal-500 text-white px-4 py-2 rounded-lg hover:from-green-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {localBatchCreating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Truck className="w-5 h-5" />
            )}
            {localBatchCreating
              ? '创建中...'
              : selectedProductIds.size > 0
                ? `一键生成本地批次 (${selectedUnbatchedProducts.length})`
                : '一键生成本地批次'}
          </button>
          <button
            onClick={() => {
              setEditingProduct(null);
              resetForm();
              setShowModal(true);
            }}
            className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
          >
            <Plus className="w-5 h-5" />
            添加库存商品
          </button>
        </div>
      </div>

      {/* 筛选 Tab */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        {([
          { key: 'ACTIVE', label: '上架', color: 'text-green-700' },
          { key: 'INACTIVE', label: '下架', color: 'text-gray-600' },
          { key: 'OUT_OF_STOCK', label: '缺货', color: 'text-red-600' },
          { key: 'ALL', label: '全部', color: 'text-blue-600' },
        ] as const).map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              statusFilter === key
                ? 'bg-white shadow text-gray-900'
                : `${color} hover:bg-white/60`
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">加载中...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Package className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p>{statusFilter === 'ALL' ? '暂无库存商品' : `暂无${statusFilter === 'ACTIVE' ? '上架' : statusFilter === 'INACTIVE' ? '下架' : '缺货'}商品`}</p>
          {statusFilter === 'ALL' && <p className="text-sm mt-2">点击“添加库存商品”按鈕创建第一个库存商品</p>}
        </div>
      ) : (
        <>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-center w-10">
                  <button onClick={toggleSelectAll} className="text-gray-500 hover:text-gray-800">
                    {selectedProductIds.size === products.length && products.length > 0 ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">商品</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">成本价</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">批发价</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">库存</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">到货状态</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">商品状态</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(products || []).map((product) => (
                <tr key={product.id} className={`hover:bg-gray-50 ${selectedProductIds.has(product.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-3 py-4 text-center">
                    <button onClick={() => toggleSelectProduct(product.id)} className="text-gray-500 hover:text-gray-800">
                      {selectedProductIds.has(product.id) ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <img
                        src={product.image_url || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22%3E%3Crect fill=%22%23f0f0f0%22 width=%2248%22 height=%2248%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2210%22%3ENo Img%3C/text%3E%3C/svg%3E'}
                        alt={product.name}
                        className="w-12 h-12 rounded object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22%3E%3Crect fill=%22%23f0f0f0%22 width=%2248%22 height=%2248%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2210%22%3ENo Img%3C/text%3E%3C/svg%3E';
                        }}
                      />
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {product.name_i18n?.zh || product.name || '未命名商品'}
                        </div>
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {product.description_i18n?.zh || product.description || '暂无描述'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {editingCostId === product.id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-gray-500">{product.currency || 'TJS'}</span>
                        <input
                          type="number"
                          autoFocus
                          step="0.01"
                          min="0"
                          value={editingCostValue}
                          onChange={(e) => setEditingCostValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); submitEditCost(product); }
                            else if (e.key === 'Escape') { e.preventDefault(); cancelEditCost(); }
                          }}
                          onFocus={(e) => e.target.select()}
                          disabled={savingCostId === product.id}
                          className="w-24 border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <button type="button" onClick={() => submitEditCost(product)} disabled={savingCostId === product.id} title="保存（Enter）" className="p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-50">
                          {savingCostId === product.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button type="button" onClick={cancelEditCost} disabled={savingCostId === product.id} title="取消（Esc）" className="p-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-50">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditCost(product)}
                        title="点击快速修改成本价"
                        className="group inline-flex items-center gap-1 px-2 py-1 -mx-2 -my-1 rounded hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        <span>{product.cost_price ? `${product.currency || 'TJS'} ${product.cost_price}` : '-'}</span>
                        <Pencil className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500" />
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingWholesaleId === product.id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-gray-500">{product.currency || 'TJS'}</span>
                        <input
                          type="number"
                          autoFocus
                          step="0.01"
                          min="0"
                          value={editingWholesaleValue}
                          onChange={(e) => setEditingWholesaleValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); submitEditWholesale(product); }
                            else if (e.key === 'Escape') { e.preventDefault(); cancelEditWholesale(); }
                          }}
                          onFocus={(e) => e.target.select()}
                          disabled={savingWholesaleId === product.id}
                          className="w-24 border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <button type="button" onClick={() => submitEditWholesale(product)} disabled={savingWholesaleId === product.id} title="保存（Enter）" className="p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-50">
                          {savingWholesaleId === product.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button type="button" onClick={cancelEditWholesale} disabled={savingWholesaleId === product.id} title="取消（Esc）" className="p-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-50">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditWholesale(product)}
                        title="点击快速修改批发价"
                        className="group inline-flex items-center gap-1 px-2 py-1 -mx-2 -my-1 rounded hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        <span className="text-sm text-blue-700 font-semibold">
                          {product.wholesale_price ? `${product.currency || 'TJS'} ${product.wholesale_price}` : '-'}
                        </span>
                        <Pencil className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500" />
                      </button>
                    )}
                    {product.min_order_quantity > 1 && (
                      <span className="block text-xs text-gray-400">起批{product.min_order_quantity}{product.unit_measure || '件'}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-bold ${product.stock <= 0 ? 'text-red-600' : product.stock <= 5 ? 'text-orange-600' : 'text-green-600'}`}>
                      {product.stock}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {product.local_batch_id ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                        <Truck className="w-3.5 h-3.5" />
                        已到货
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">
                        未关联批次
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(product.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      {/* AI 理解按钮 */}
                      {product.ai_understanding ? (
                        <button
                          onClick={() => handleViewAI(product)}
                          className="text-amber-600 hover:text-amber-900"
                          title="查看 AI 理解"
                        >
                          <Brain className="w-5 h-5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleGenerateAI(product)}
                          disabled={aiGeneratingId === product.id}
                          className={`${aiGeneratingId === product.id ? 'text-gray-400 cursor-wait' : 'text-amber-500 hover:text-amber-700'}`}
                          title="生成 AI 理解"
                        >
                          {aiGeneratingId === product.id ? (
                            <RefreshCw className="w-5 h-5 animate-spin" />
                          ) : (
                            <Sparkles className="w-5 h-5" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => handleShowAdjust(product)}
                        className="text-purple-600 hover:text-purple-900"
                        title="调整库存"
                      >
                        <ArrowUpDown className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleShowHistory(product)}
                        className="text-blue-600 hover:text-blue-900"
                        title="查看变动记录"
                      >
                        <History className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => toggleStatus(product)}
                        className="text-gray-600 hover:text-gray-900"
                        title={product.status === 'ACTIVE' ? '下架' : '上架'}
                      >
                        {product.status === 'ACTIVE' ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => handleEdit(product)}
                        className="text-indigo-600 hover:text-indigo-900"
                        title="编辑"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="text-red-600 hover:text-red-900"
                        title="删除"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页器 */}
        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4 px-2">
            <span className="text-sm text-gray-500">
              共 {totalCount} 个商品，第 {currentPage} / {Math.ceil(totalCount / PAGE_SIZE)} 页
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border rounded-md disabled:opacity-40 hover:bg-gray-50"
              >
                上一页
              </button>
              {Array.from({ length: Math.min(5, Math.ceil(totalCount / PAGE_SIZE)) }, (_, i) => {
                const total = Math.ceil(totalCount / PAGE_SIZE);
                let start = Math.max(1, currentPage - 2);
                const end = Math.min(total, start + 4);
                if (end - start < 4) start = Math.max(1, end - 4);
                const page = start + i;
                if (page > total) return null;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 text-sm border rounded-md ${
                      currentPage === page
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / PAGE_SIZE), p + 1))}
                disabled={currentPage >= Math.ceil(totalCount / PAGE_SIZE)}
                className="px-3 py-1 text-sm border rounded-md disabled:opacity-40 hover:bg-gray-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {/* 创建/编辑商品 Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingProduct ? '编辑库存商品' : '添加库存商品'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* 名称 */}
                <div>
                  <label className="block text-sm font-medium mb-2">商品名称</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">中文 *</label>
                      <input
                        type="text"
                        value={formData.name_zh}
                        onChange={(e) => setFormData({ ...formData, name_zh: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">俄语</label>
                      <input
                        type="text"
                        value={formData.name_ru}
                        onChange={(e) => setFormData({ ...formData, name_ru: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">塔吉克语</label>
                      <input
                        type="text"
                        value={formData.name_tg}
                        onChange={(e) => setFormData({ ...formData, name_tg: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                  </div>
                </div>

                {/* AI 商品理解 */}
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                        <Brain className="w-4 h-4" />
                        AI 商品理解（三语）
                      </h3>
                      <p className="text-xs text-amber-700 mt-1">
                        采用“语义事实层 + 塔吉克语/俄语直出 + 中文后台辅助翻译”的新方案。面向用户的目标人群、卖点与如何使用，优先保证塔吉克语表达自然、易懂、可直接转化。
                      </p>
                    </div>
                    {formData.ai_understanding.generated_at && (
                      <div className="text-right text-[11px] text-amber-700 shrink-0">
                        <div>生成时间：{new Date(formData.ai_understanding.generated_at).toLocaleString()}</div>
                        {formData.ai_understanding.model_used && <div>模型：{formData.ai_understanding.model_used}</div>}
                        <div>生成策略：{formData.ai_understanding.source_language || 'multi'}</div>
                        <div>主市场语言：{formData.ai_understanding.primary_market_language || 'tg'}</div>
                      </div>
                    )}
                  </div>

                  {[
                    ['target_people', '适合谁用', '例如：年轻妈妈、冬天手脚容易发凉、经常坐地垫陪孩子的人'],
                    ['selling_angle', '好在哪儿', '例如：比烧热水袋更快，插电一会儿就暖起来，陪娃和做家务都更舒服'],
                    ['how_to_use', '如何使用', '例如：插电预热几分钟后再把脚放进去，久坐、看电视或陪孩子时使用更舒服'],
                    ['best_scene', '使用场景', '例如：晚上坐在地毯上陪孩子看动画，脚伸进去一会儿就热起来'],
                    ['local_life_connection', '本地关联', '例如：适合冬天供暖不稳定、家里常席地而坐喝茶的塔吉克家庭'],
                    ['recommended_badge', '推荐标签', '例如：冬天必备'],
                  ].map(([field, label, placeholder]) => (
                    <div key={field} className="rounded-lg border border-amber-100 bg-white/70 p-3 space-y-3">
                      <label className="block text-sm font-medium text-amber-900">{label}</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">中文</label>
                          {field === 'recommended_badge' ? (
                            <input
                              type="text"
                              value={formData.ai_understanding[field as 'recommended_badge'].zh}
                              onChange={(e) => updateAIUnderstandingField(field as any, 'zh', e.target.value)}
                              className="w-full border rounded px-3 py-2 bg-white"
                              placeholder={placeholder}
                            />
                          ) : (
                            <textarea
                              value={formData.ai_understanding[field as 'target_people' | 'selling_angle' | 'how_to_use' | 'best_scene' | 'local_life_connection'].zh}
                              onChange={(e) => updateAIUnderstandingField(field as any, 'zh', e.target.value)}
                              className="w-full border rounded px-3 py-2 bg-white"
                              rows={3}
                              placeholder={placeholder}
                            />
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">俄语</label>
                          {field === 'recommended_badge' ? (
                            <input
                              type="text"
                              value={formData.ai_understanding[field as 'recommended_badge'].ru}
                              onChange={(e) => updateAIUnderstandingField(field as any, 'ru', e.target.value)}
                              className="w-full border rounded px-3 py-2 bg-white"
                              placeholder="俄语主文案"
                            />
                          ) : (
                            <textarea
                              value={formData.ai_understanding[field as 'target_people' | 'selling_angle' | 'how_to_use' | 'best_scene' | 'local_life_connection'].ru}
                              onChange={(e) => updateAIUnderstandingField(field as any, 'ru', e.target.value)}
                              className="w-full border rounded px-3 py-2 bg-white"
                              rows={3}
                              placeholder="俄语主文案"
                            />
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">塔吉克语</label>
                          {field === 'recommended_badge' ? (
                            <input
                              type="text"
                              value={formData.ai_understanding[field as 'recommended_badge'].tg}
                              onChange={(e) => updateAIUnderstandingField(field as any, 'tg', e.target.value)}
                              className="w-full border rounded px-3 py-2 bg-white"
                              placeholder="塔吉克语翻译"
                            />
                          ) : (
                            <textarea
                              value={formData.ai_understanding[field as 'target_people' | 'selling_angle' | 'how_to_use' | 'best_scene' | 'local_life_connection'].tg}
                              onChange={(e) => updateAIUnderstandingField(field as any, 'tg', e.target.value)}
                              className="w-full border rounded px-3 py-2 bg-white"
                              rows={3}
                              placeholder="塔吉克语翻译"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="rounded-lg border border-amber-100 bg-white/70 p-3 space-y-3">
                    <div className="text-sm font-medium text-amber-900">语义事实层（辅助校验，不直接给用户看）</div>
                    <p className="text-xs text-amber-700">
                      这里可补充参数亮点、使用步骤与典型场景，帮助后续重新生成或人工校对时保持三语内容一致、避免夸大和遗漏。
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">参数亮点（每行一条）</label>
                        <textarea
                          value={formData.ai_understanding.semantic_facts.parameter_highlights.join('\n')}
                          onChange={(e) => setFormData({
                            ...formData,
                            ai_understanding: {
                              ...formData.ai_understanding,
                              semantic_facts: {
                                ...formData.ai_understanding.semantic_facts,
                                parameter_highlights: e.target.value.split('\n'),
                              },
                            },
                          })}
                          className="w-full border rounded px-3 py-2 bg-white"
                          rows={4}
                          placeholder="例如：加热更快｜可折叠收纳｜适合冬季久坐"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">使用步骤（每行一条）</label>
                        <textarea
                          value={formData.ai_understanding.semantic_facts.usage_steps.join('\n')}
                          onChange={(e) => setFormData({
                            ...formData,
                            ai_understanding: {
                              ...formData.ai_understanding,
                              semantic_facts: {
                                ...formData.ai_understanding.semantic_facts,
                                usage_steps: e.target.value.split('\n'),
                              },
                            },
                          })}
                          className="w-full border rounded px-3 py-2 bg-white"
                          rows={4}
                          placeholder="例如：插电预热｜放脚进入｜久坐时持续保暖"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">典型场景（每行一条）</label>
                        <textarea
                          value={formData.ai_understanding.semantic_facts.usage_scenarios.join('\n')}
                          onChange={(e) => setFormData({
                            ...formData,
                            ai_understanding: {
                              ...formData.ai_understanding,
                              semantic_facts: {
                                ...formData.ai_understanding.semantic_facts,
                                usage_scenarios: e.target.value.split('\n'),
                              },
                            },
                          })}
                          className="w-full border rounded px-3 py-2 bg-white"
                          rows={4}
                          placeholder="例如：冬天看电视｜地毯上陪孩子｜办公室久坐"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-amber-900">生成来源</label>
                      <input
                        type="text"
                        value={formData.ai_understanding.generated_by}
                        onChange={(e) => setFormData({ ...formData, ai_understanding: { ...formData.ai_understanding, generated_by: e.target.value } })}
                        className="w-full border rounded px-3 py-2 bg-white"
                        placeholder="例如：ai-listing-generate"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-amber-900">使用模型</label>
                      <input
                        type="text"
                        value={formData.ai_understanding.model_used}
                        onChange={(e) => setFormData({ ...formData, ai_understanding: { ...formData.ai_understanding, model_used: e.target.value } })}
                        className="w-full border rounded px-3 py-2 bg-white"
                        placeholder="例如：qwen-vl-max -&gt; qwen3.5-plus"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-amber-900">生成策略</label>
                      <input
                        type="text"
                        value={formData.ai_understanding.source_language || 'multi'}
                        onChange={(e) => setFormData({ ...formData, ai_understanding: { ...formData.ai_understanding, source_language: e.target.value as 'multi' | 'tg' | 'ru' | 'zh' } })}
                        className="w-full border rounded px-3 py-2 bg-white"
                        placeholder="multi"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-amber-900">主市场语言</label>
                      <input
                        type="text"
                        value={formData.ai_understanding.primary_market_language || 'tg'}
                        onChange={(e) => setFormData({ ...formData, ai_understanding: { ...formData.ai_understanding, primary_market_language: e.target.value as 'tg' | 'ru' | 'zh' } })}
                        className="w-full border rounded px-3 py-2 bg-white"
                        placeholder="tg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-amber-900">展示优先级</label>
                      <input
                        type="text"
                        value={formData.ai_understanding.display_priority.join(', ')}
                        onChange={(e) => setFormData({
                          ...formData,
                          ai_understanding: {
                            ...formData.ai_understanding,
                            display_priority: e.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter((item): item is 'tg' | 'ru' | 'zh' => ['tg', 'ru', 'zh'].includes(item)),
                          },
                        })}
                        className="w-full border rounded px-3 py-2 bg-white"
                        placeholder="tg, ru, zh"
                      />
                    </div>
                  </div>
                </div>

                {/* 图片上传 */}
                <MultiImageUpload
                  label="商品图片 (最多5张)"
                  bucket="inventory-products"
                  folder="products"
                  maxImages={10}
                  imageUrls={formData.image_urls}
                  onImageUrlsChange={(urls) => setFormData({ ...formData, image_urls: urls, image_url: urls[0] || '' })}
                />

                {/* 价格和库存 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">原价（TJS）*</label>
                    <input
                      type="number"
                      value={formData.original_price}
                      onChange={(e) => setFormData({ ...formData, original_price: Number(e.target.value) })}
                      className="w-full border rounded px-3 py-2"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">初始库存 *</label>
                    <input
                      type="number"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                      className="w-full border rounded px-3 py-2"
                      min="0"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">SKU编码</label>
                    <input
                      type="text"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                      placeholder="可选"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">条形码</label>
                    <input
                      type="text"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                      placeholder="可选"
                    />
                  </div>
                </div>

                {/* ==================== B2B 批发定价 ==================== */}
                <div className="border-t pt-4 mt-2">
                  <h4 className="text-sm font-semibold text-blue-700 mb-3">B2B 批发定价</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">成本价（TJS）</label>
                      <input
                        type="number"
                        value={formData.cost_price}
                        onChange={(e) => setFormData({ ...formData, cost_price: Number(e.target.value) })}
                        className="w-full border rounded px-3 py-2"
                        min="0"
                        step="0.01"
                        placeholder="内部结算"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">批发价（TJS）*</label>
                      <input
                        type="number"
                        value={formData.wholesale_price}
                        onChange={(e) => setFormData({ ...formData, wholesale_price: Number(e.target.value) })}
                        className="w-full border rounded px-3 py-2 border-blue-300"
                        min="0"
                        step="0.01"
                        placeholder="批发商可见"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">建议零售价（TJS）</label>
                      <input
                        type="number"
                        value={formData.retail_price}
                        onChange={(e) => setFormData({ ...formData, retail_price: Number(e.target.value) })}
                        className="w-full border rounded px-3 py-2"
                        min="0"
                        step="0.01"
                        placeholder="展示参考价"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">起批量</label>
                      <input
                        type="number"
                        value={formData.min_order_quantity}
                        onChange={(e) => setFormData({ ...formData, min_order_quantity: Number(e.target.value) })}
                        className="w-full border rounded px-3 py-2"
                        min="1"
                        step="1"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">计量单位</label>
                      <select
                        value={formData.unit_measure}
                        onChange={(e) => setFormData({ ...formData, unit_measure: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                      >
                        <option value="件">件</option>
                        <option value="箱">箱</option>
                        <option value="kg">kg</option>
                        <option value="个">个</option>
                        <option value="套">套</option>
                        <option value="包">包</option>
                      </select>
                    </div>
                  </div>
                </div>
                {/* 规格和材质 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">规格（中文）</label>
                    <input
                      type="text"
                      value={formData.specifications_zh}
                      onChange={(e) => setFormData({ ...formData, specifications_zh: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                      placeholder="如：100ml / 500g"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">材质（中文）</label>
                    <input
                      type="text"
                      value={formData.material_zh}
                      onChange={(e) => setFormData({ ...formData, material_zh: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                      placeholder="如：纯棉 / 不锈钢"
                    />
                  </div>
                </div>

                {/* 状态 */}
                <div>
                  <label className="block text-sm font-medium mb-1">状态</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="ACTIVE">上架</option>
                    <option value="INACTIVE">下架</option>
                  </select>
                </div>

                {/* 商品分类 */}
                <div>
                  <label className="block text-sm font-medium mb-1">商品分类</label>
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">未分类</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name_i18n?.zh || cat.code}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">选择商品所属的首页分类，用于前台展示归类</p>
                </div>

                {/* 按钮 */}
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingProduct(null);
                      resetForm();
                    }}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    {editingProduct ? '保存修改' : '创建商品'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 库存变动记录 Modal */}
      {showHistoryModal && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                库存变动记录 - {selectedProduct.name_i18n?.zh || selectedProduct.name}
              </h2>
              {transactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">暂无变动记录</div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">时间</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">类型</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">变动</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">库存</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">备注</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {new Date(tx.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-sm">{getTransactionTypeName(tx.transaction_type)}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className={tx.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                            {tx.quantity > 0 ? '+' : ''}{tx.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {tx.stock_before} → {tx.stock_after}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">{tx.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 库存调整 Modal */}
      {showAdjustModal && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                调整库存 - {selectedProduct.name_i18n?.zh || selectedProduct.name}
              </h2>
              <div className="mb-4">
                <p className="text-sm text-gray-500">当前库存: <span className="font-bold text-lg">{selectedProduct.stock}</span></p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">调整数量</label>
                  <input
                    type="number"
                    value={adjustQuantity}
                    onChange={(e) => setAdjustQuantity(Number(e.target.value))}
                    className="w-full border rounded px-3 py-2"
                    placeholder="正数入库，负数出库"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    调整后库存: <span className="font-bold">{selectedProduct.stock + adjustQuantity}</span>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">备注</label>
                  <input
                    type="text"
                    value={adjustNotes}
                    onChange={(e) => setAdjustNotes(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    placeholder="调整原因"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleAdjustStock}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                >
                  确认调整
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI 商品理解查看 Modal */}
      {showAiModal && aiViewProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
                <Brain className="w-5 h-5 text-amber-600" />
                AI 商品理解
              </h2>
              <p className="text-sm text-gray-500 mb-4">{aiViewProduct.name_i18n?.zh || aiViewProduct.name || '未命名商品'}</p>
              
              {aiViewProduct.ai_understanding ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3 text-xs text-amber-800">
                    当前采用“语义事实层 + 塔吉克语/俄语直出 + 中文后台辅助翻译”的策略，用户面向文案优先保证塔吉克语自然易懂。
                  </div>
                  {[
                    ['target_people', '适合谁', 'amber'],
                    ['selling_angle', '好在哪', 'rose'],
                    ['how_to_use', '如何使用', 'blue'],
                    ['best_scene', '使用场景', 'orange'],
                    ['local_life_connection', '本地关联', 'teal'],
                    ['recommended_badge', '推荐标签', 'purple'],
                  ].map(([field, label, color]) => {
                    const value = aiViewProduct.ai_understanding?.[field as keyof InventoryAIUnderstanding];
                    const zh = getAITextByLang(value, 'zh');
                    const ru = getAITextByLang(value, 'ru');
                    const tg = getAITextByLang(value, 'tg');
                    if (!zh && !ru && !tg) return null;

                    return (
                      <div key={field}>
                        <label className={`text-xs font-medium text-${color}-700`}>{label}</label>
                        <div className={`mt-1 rounded-lg bg-${color}-50 p-3 space-y-2`}>
                          {tg && (
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-gray-500">塔吉克语优先文案</div>
                              {field === 'recommended_badge' ? (
                                <span className={`inline-block mt-1 px-3 py-1 bg-${color}-100 text-${color}-700 rounded-full text-sm font-medium`}>{tg}</span>
                              ) : (
                                <p className="text-sm text-gray-700 mt-1">{tg}</p>
                              )}
                            </div>
                          )}
                          {ru && (
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-gray-500">俄语直出文案</div>
                              {field === 'recommended_badge' ? (
                                <span className={`inline-block mt-1 px-3 py-1 bg-${color}-100 text-${color}-700 rounded-full text-sm font-medium`}>{ru}</span>
                              ) : (
                                <p className="text-sm text-gray-700 mt-1">{ru}</p>
                              )}
                            </div>
                          )}
                          {zh && (
                            <div>
                              <div className="text-[11px] uppercase tracking-wide text-gray-500">中文后台参考</div>
                              <p className="text-sm text-gray-700 mt-1">{zh}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {aiViewProduct.ai_understanding.semantic_facts && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                      <div className="text-sm font-medium text-slate-800">语义事实层</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-slate-700">
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">参数亮点</div>
                          <ul className="list-disc pl-5 space-y-1">
                            {(aiViewProduct.ai_understanding.semantic_facts.parameter_highlights || []).map((item, index) => (
                              <li key={`parameter-${index}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">使用步骤</div>
                          <ul className="list-disc pl-5 space-y-1">
                            {(aiViewProduct.ai_understanding.semantic_facts.usage_steps || []).map((item, index) => (
                              <li key={`step-${index}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">典型场景</div>
                          <ul className="list-disc pl-5 space-y-1">
                            {(aiViewProduct.ai_understanding.semantic_facts.usage_scenarios || []).map((item, index) => (
                              <li key={`scenario-${index}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                  {(aiViewProduct.ai_understanding.generated_at || aiViewProduct.ai_understanding.primary_market_language || aiViewProduct.ai_understanding.display_priority?.length) && (
                    <p className="text-xs text-gray-400 pt-2 border-t">
                      {aiViewProduct.ai_understanding.generated_at && `生成时间：${new Date(aiViewProduct.ai_understanding.generated_at).toLocaleString()}`}
                      {aiViewProduct.ai_understanding.model_used && ` | 模型：${aiViewProduct.ai_understanding.model_used}`}
                      {aiViewProduct.ai_understanding.source_language && ` | 生成策略：${aiViewProduct.ai_understanding.source_language}`}
                      {aiViewProduct.ai_understanding.primary_market_language && ` | 主市场语言：${aiViewProduct.ai_understanding.primary_market_language}`}
                      {aiViewProduct.ai_understanding.display_priority?.length && ` | 展示优先级：${aiViewProduct.ai_understanding.display_priority.join(' > ')}`}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Sparkles className="w-12 h-12 mx-auto mb-2" />
                  <p>该商品尚未生成 AI 理解</p>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowAiModal(false);
                    handleGenerateAI(aiViewProduct, true);
                  }}
                  disabled={aiGeneratingId === aiViewProduct.id}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                >
                  {aiGeneratingId === aiViewProduct.id ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> 生成中...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" /> 重新生成</>
                  )}
                </button>
                <button
                  onClick={() => setShowAiModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 批量 AI 理解回填进度弹窗 */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Zap className="w-5 h-5 text-purple-500" />
                批量 AI 商品理解回填
              </h3>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              {/* 进度摘要 */}
              {batchProgress && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>当前批次：第 {batchProgress.currentBatch} 批</span>
                    <span className="text-gray-500">
                      剩余 {batchProgress.totalRemaining} 个商品
                    </span>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-600">成功 {batchProgress.successCount}</span>
                    <span className="text-red-600">失败 {batchProgress.errorCount}</span>
                    <span className="text-gray-600">已处理 {batchProgress.processed}</span>
                  </div>
                  {batchRunning && (
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-500"
                        style={{
                          width: batchProgress.totalRemaining + batchProgress.processed > 0
                            ? `${(batchProgress.processed / (batchProgress.totalRemaining + batchProgress.processed)) * 100}%`
                            : '100%',
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 处理日志 */}
              {batchLog.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 mb-2">处理日志</p>
                  {batchLog.map((log, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between text-xs px-3 py-1.5 rounded ${
                        log.status === 'success'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      <span className="truncate flex-1">{log.name}</span>
                      <span className="ml-2 flex-shrink-0">
                        {log.status === 'success' ? '✓' : `✗ ${log.error || ''}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {batchRunning && batchLog.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                  <p>正在初始化批量处理...</p>
                </div>
              )}

              {!batchRunning && batchLog.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <Sparkles className="w-8 h-8 mx-auto mb-2" />
                  <p>所有商品已有 AI 理解数据，无需回填</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t flex justify-end">
              <button
                onClick={() => setShowBatchModal(false)}
                disabled={batchRunning}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {batchRunning ? '处理中...' : '关闭'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
