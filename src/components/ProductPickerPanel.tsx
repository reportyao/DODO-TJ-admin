/**
 * 通用商品选择器面板
 *
 * 功能：
 * - 侧边滑出面板，点击触发按钮或搜索框获得焦点时打开
 * - 支持按分类浏览所有商品
 * - 支持模糊搜索（中文/俄文/塔吉克文/SKU）
 * - 支持一次多选，确认后批量添加
 * - 已选商品高亮显示，防止重复添加
 *
 * 用于：HomepageTopicManagementPage、AITopicGenerationPage 等需要选择商品的场景
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, Check, Package, ChevronRight, Loader2 } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import { adminQuery } from '../lib/adminApi';
import type { I18nText } from '../types/homepage';

// ============================================================
// 类型定义
// ============================================================
export interface ProductPickerItem {
  id: string;
  name_i18n?: I18nText;
  name?: string;
  description_i18n?: I18nText | null;
  image_url: string | null;
  original_price: number;
  status: string;
  sku?: string | null;
}

interface CategoryItem {
  id: string;
  code: string;
  name_i18n: I18nText;
}

interface ProductPickerPanelProps {
  /** 面板是否打开 */
  open: boolean;
  /** 关闭面板回调 */
  onClose: () => void;
  /** 确认选择回调，返回选中的商品列表 */
  onConfirm: (products: ProductPickerItem[]) => void;
  /** 已经挂载的商品ID列表（用于标记已选） */
  existingProductIds?: string[];
  /** 面板标题 */
  title?: string;
}

// ============================================================
// 组件
// ============================================================
export default function ProductPickerPanel({
  open,
  onClose,
  onConfirm,
  existingProductIds = [],
  title = '选择商品',
}: ProductPickerPanelProps) {
  const { supabase } = useSupabase();

  // 状态
  const [products, setProducts] = useState<ProductPickerItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [totalCount, setTotalCount] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const existingSet = new Set(existingProductIds);

  // 打开面板时自动聚焦搜索框并加载数据
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      setSearchKeyword('');
      setSelectedCategoryId('all');
      fetchCategories();
      fetchProducts('all', '');
      setTimeout(() => searchInputRef.current?.focus(), 200);
    }
  }, [open]);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(selectedCategoryId, searchKeyword);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword, selectedCategoryId]);

  // 获取分类列表
  const fetchCategories = async () => {
    try {
      const data = await adminQuery<CategoryItem>(supabase, 'homepage_categories', {
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

  // 获取商品列表
  const fetchProducts = useCallback(async (categoryId: string, keyword: string) => {
    setLoading(true);
    try {
      // 基础筛选：只查ACTIVE商品
      const filters: { col: string; op: string; val: any }[] = [
        { col: 'status', op: 'eq', val: 'ACTIVE' },
      ];

      // [BUG-14 修复] 构建搜索条件，对特殊字符进行转义
      let orFilters: string | undefined;
      if (keyword.trim()) {
        // 移除 PostgREST 查询中可能导致解析错误的特殊字符
        const kw = keyword.trim().replace(/[.,()%_]/g, '');
        if (kw) {
          orFilters = `name_i18n->>zh.ilike.%${kw}%,name_i18n->>ru.ilike.%${kw}%,name_i18n->>tg.ilike.%${kw}%,sku.ilike.%${kw}%`;
        }
      }

      // 查询商品
      const data = await adminQuery<ProductPickerItem>(supabase, 'inventory_products', {
        select: 'id, name_i18n, image_url, original_price, status, sku',
        filters: filters as any,
        orFilters,
        orderBy: 'created_at',
        orderAsc: false,
        limit: 200,
      });

      let result = data || [];

      // [BUG-15 修复] 分类筛选逻辑修正：'unassigned' 应独立处理，不应先按 categoryId 查询
      if (categoryId !== 'all') {
        if (categoryId === 'unassigned') {
          // 未分类：获取所有已分类的商品ID，然后排除
          const allRelations = await adminQuery<{ product_id: string }>(supabase, 'product_categories', {
            select: 'product_id',
          });
          const assignedIds = new Set((allRelations || []).map(r => r.product_id));
          result = result.filter(p => !assignedIds.has(p.id));
        } else {
          const catRelations = await adminQuery<{ product_id: string }>(supabase, 'product_categories', {
            select: 'product_id',
            filters: [{ col: 'category_id', op: 'eq', val: categoryId }] as any,
          });
          const productIdSet = new Set((catRelations || []).map(r => r.product_id));
          result = result.filter(p => productIdSet.has(p.id));
        }
      }

      setProducts(result);
      setTotalCount(result.length);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // 切换选中状态
  const toggleSelect = (productId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  // 全选当前页
  const selectAll = () => {
    const selectableProducts = products.filter(p => !existingSet.has(p.id));
    if (selectedIds.size === selectableProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableProducts.map(p => p.id)));
    }
  };

  // 确认选择
  const handleConfirm = () => {
    const selectedProducts = products.filter(p => selectedIds.has(p.id));
    onConfirm(selectedProducts);
    onClose();
  };

  // 获取商品名称
  const getProductName = (product: ProductPickerItem): string => {
    return product.name_i18n?.zh || product.name_i18n?.ru || product.name || '未命名商品';
  };

  if (!open) return null;

  return (
    <>
      {/* 遮罩层 - z-[60] 确保在编辑模态框(z-50)之上 */}
      <div
        className="fixed inset-0 bg-black/40 z-[60] transition-opacity"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      />

      {/* 侧边面板 - z-[70] 确保在遮罩层之上 */}
      <div className="fixed right-0 top-0 h-full w-[520px] max-w-[90vw] bg-white shadow-2xl z-[70] flex flex-col animate-in slide-in-from-right duration-300" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              共 {totalCount} 个商品 · 已选 {selectedIds.size} 个
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 搜索栏 */}
        <div className="px-4 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索商品名称（中/俄/塔）或 SKU..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
            />
          </div>
        </div>

        {/* 分类筛选 */}
        <div className="px-4 py-2 border-b overflow-x-auto">
          <div className="flex gap-1.5 flex-nowrap">
            <button
              onClick={() => setSelectedCategoryId('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategoryId === 'all'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setSelectedCategoryId('unassigned')}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategoryId === 'unassigned'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              未分类
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategoryId === cat.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat.name_i18n?.zh || cat.code}
              </button>
            ))}
          </div>
        </div>

        {/* 全选操作栏 */}
        <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
          <button
            onClick={selectAll}
            className="text-xs text-orange-600 hover:text-orange-700 font-medium"
          >
            {selectedIds.size === products.filter(p => !existingSet.has(p.id)).length && selectedIds.size > 0
              ? '取消全选'
              : '全选当前页'}
          </button>
          {selectedIds.size > 0 && (
            <span className="text-xs text-gray-500">
              已选 {selectedIds.size} 个商品
            </span>
          )}
        </div>

        {/* 商品列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              <span className="ml-2 text-sm text-gray-500">加载中...</span>
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Package className="w-12 h-12 mb-3" />
              <p className="text-sm">暂无商品</p>
              {searchKeyword && (
                <p className="text-xs mt-1">尝试更换关键词搜索</p>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {products.map(product => {
                const isExisting = existingSet.has(product.id);
                const isSelected = selectedIds.has(product.id);
                const name = getProductName(product);

                return (
                  <div
                    key={product.id}
                    onClick={() => !isExisting && toggleSelect(product.id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      isExisting
                        ? 'bg-gray-50 opacity-60 cursor-not-allowed'
                        : isSelected
                          ? 'bg-orange-50 border-l-4 border-orange-500'
                          : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* 选择框 */}
                    <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isExisting
                        ? 'bg-gray-300 border-gray-300'
                        : isSelected
                          ? 'bg-orange-500 border-orange-500'
                          : 'border-gray-300 hover:border-orange-400'
                    }`}>
                      {(isExisting || isSelected) && <Check className="w-3 h-3 text-white" />}
                    </div>

                    {/* 商品图片 */}
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="48"%3E%3Crect fill="%23f3f4f6" width="48" height="48"/%3E%3C/svg%3E';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-5 h-5 text-gray-300" />
                        </div>
                      )}
                    </div>

                    {/* 商品信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-orange-600 font-medium">
                          ¥{product.original_price?.toFixed(2) || '0.00'}
                        </span>
                        {product.sku && (
                          <span className="text-xs text-gray-400">SKU: {product.sku}</span>
                        )}
                        {isExisting && (
                          <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">已挂载</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部确认栏 */}
        <div className="px-5 py-4 border-t bg-gray-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedIds.size > 0
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            确认添加 ({selectedIds.size})
          </button>
        </div>
      </div>
    </>
  );
}
