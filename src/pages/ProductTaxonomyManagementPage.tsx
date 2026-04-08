/**
 * 商品分类标签批量管理页面
 *
 * 为商品批量分配首页分类和标签。
 * 支持：商品列表（搜索/筛选）、查看已分配分类/标签、批量编辑。
 *
 * 与 BannerManagementPage 保持一致的 CRUD 模式。
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, Tag, FolderOpen, Save, X, Check,
  ChevronDown, ChevronUp, Filter,
} from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import { adminQuery, adminInsert, adminDelete } from '../lib/adminApi';
import toast from 'react-hot-toast';
import type {
  DbHomepageCategoryRow, DbHomepageTagRow, TagGroup, I18nText,
} from '../types/homepage';

// ============================================================
// Types
// ============================================================
interface ProductItem {
  id: string;
  name_i18n: I18nText;
  image_url: string;
  original_price: number;
  status: string;
  sku: string;
}

interface ProductWithTaxonomy extends ProductItem {
  category_ids: string[];
  tag_ids: string[];
}

const TAG_GROUP_LABELS: Record<TagGroup, string> = {
  scene: '场景', audience: '人群', festival: '节日',
  style: '风格', function: '功能', local: '本地化',
};

const TAG_GROUP_COLORS: Record<TagGroup, string> = {
  scene: 'bg-blue-100 text-blue-700',
  audience: 'bg-purple-100 text-purple-700',
  festival: 'bg-red-100 text-red-700',
  style: 'bg-pink-100 text-pink-700',
  function: 'bg-green-100 text-green-700',
  local: 'bg-yellow-100 text-yellow-700',
};

export default function ProductTaxonomyManagementPage() {
  const { supabase } = useSupabase();
  const [categories, setCategories] = useState<DbHomepageCategoryRow[]>([]);
  const [tags, setTags] = useState<DbHomepageTagRow[]>([]);
  const [products, setProducts] = useState<ProductWithTaxonomy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('ACTIVE');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchCategories, setBatchCategories] = useState<string[]>([]);
  const [batchTags, setBatchTags] = useState<string[]>([]);
  const [batchMode, setBatchMode] = useState<'add' | 'replace'>('add');

  useEffect(() => { fetchBaseData(); }, []);
  useEffect(() => { fetchProducts(); }, [filterStatus]);

  const fetchBaseData = async () => {
    try {
      // [RLS 修复] 使用 adminQuery
      const [catData, tagData] = await Promise.all([
        adminQuery<DbHomepageCategoryRow>(supabase, 'homepage_categories', {
          select: '*',
          filters: [{ col: 'is_active', op: 'eq', val: 'true' }],
          orderBy: 'sort_order',
          orderAsc: true,
        }),
        adminQuery<DbHomepageTagRow>(supabase, 'homepage_tags', {
          select: '*',
          filters: [{ col: 'is_active', op: 'eq', val: 'true' }],
          orderBy: 'tag_group',
          orderAsc: true,
        }),
      ]);
      setCategories(catData || []);
      setTags(tagData || []);
    } catch (error: any) {
      toast.error('获取分类/标签数据失败');
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      // [RLS 修复] 使用 adminQuery
      const filters = filterStatus !== 'all' ? [{ col: 'status', op: 'eq' as const, val: filterStatus }] : [];
      const productData = await adminQuery<ProductItem & { sku: string }>(supabase, 'inventory_products', {
        select: 'id, name_i18n, image_url, original_price, status, sku',
        filters,
        orderBy: 'created_at',
        orderAsc: false,
        limit: 100,
      });
      if (!productData || productData.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }
      const productIds = productData.map(p => p.id);
      // product_categories 和 product_tags 是新表，需要 adminQuery
      const [catRelations, tagRelations] = await Promise.all([
        adminQuery<{ product_id: string; category_id: string }>(supabase, 'product_categories', { select: 'product_id, category_id' }),
        adminQuery<{ product_id: string; tag_id: string }>(supabase, 'product_tags', { select: 'product_id, tag_id' }),
      ]);
      // 只保留当前页面商品的关系
      const productIdSet = new Set(productIds);
      const catMap = new Map<string, string[]>();
      (catRelations || []).filter(r => productIdSet.has(r.product_id)).forEach(r => {
        const arr = catMap.get(r.product_id) || [];
        arr.push(r.category_id);
        catMap.set(r.product_id, arr);
      });
      const tagMap = new Map<string, string[]>();
      (tagRelations || []).filter(r => productIdSet.has(r.product_id)).forEach(r => {
        const arr = tagMap.get(r.product_id) || [];
        arr.push(r.tag_id);
        tagMap.set(r.product_id, arr);
      });
      setProducts(productData.map(p => ({
        ...p,
        category_ids: catMap.get(p.id) || [],
        tag_ids: tagMap.get(p.id) || [],
      })));
    } catch (error: any) {
      toast.error('获取商品列表失败');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p => {
    if (searchKeyword.trim()) {
      const name = (p.name_i18n as I18nText)?.zh || '';
      const nameRu = (p.name_i18n as I18nText)?.ru || '';
      const kw = searchKeyword.toLowerCase();
      if (!name.toLowerCase().includes(kw) && !nameRu.toLowerCase().includes(kw) && !p.sku.toLowerCase().includes(kw)) return false;
    }
    if (filterCategory !== 'all') {
      if (filterCategory === 'unassigned') { if (p.category_ids.length > 0) return false; }
      else { if (!p.category_ids.includes(filterCategory)) return false; }
    }
    return true;
  });

  const startEdit = (product: ProductWithTaxonomy) => {
    setEditingProductId(product.id);
    setEditCategories([...product.category_ids]);
    setEditTags([...product.tag_ids]);
  };

  const cancelEdit = () => {
    setEditingProductId(null);
    setEditCategories([]);
    setEditTags([]);
  };

  const saveEdit = async () => {
    if (!editingProductId) return;
    setSaving(true);
    try {
      // [RLS 修复] 使用 adminDelete + adminInsert
      await adminDelete(supabase, 'product_categories', [{ col: 'product_id', op: 'eq', val: editingProductId }]);
      await adminDelete(supabase, 'product_tags', [{ col: 'product_id', op: 'eq', val: editingProductId }]);
      for (const cid of editCategories) {
        await adminInsert(supabase, 'product_categories', { product_id: editingProductId, category_id: cid });
      }
      for (const tid of editTags) {
        await adminInsert(supabase, 'product_tags', { product_id: editingProductId, tag_id: tid });
      }
      toast.success('分类标签保存成功');
      cancelEdit();
      fetchProducts();
    } catch (error: any) {
      toast.error('保存失败: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleSelectProduct = (id: string) => {
    const next = new Set(selectedProducts);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedProducts(next);
  };

  const selectAll = () => {
    if (selectedProducts.size === filteredProducts.length) setSelectedProducts(new Set());
    else setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
  };

  const executeBatch = async () => {
    if (selectedProducts.size === 0) return;
    setSaving(true);
    try {
      const productIds = Array.from(selectedProducts);
      for (const pid of productIds) {
        /**
         * [审查修复] 替换模式逻辑 bug：
         * 原代码在替换模式下，仅当 batchCategories/batchTags 非空时才删除旧关系。
         * 这导致管理员无法通过替换模式"清空"某个商品的分类或标签。
         * 修复：替换模式下无条件删除旧关系，然后仅在有新选择时插入。
         */
        // [RLS 修复] 使用 adminDelete + adminInsert
        if (batchMode === 'replace') {
          await adminDelete(supabase, 'product_categories', [{ col: 'product_id', op: 'eq', val: pid }]);
          await adminDelete(supabase, 'product_tags', [{ col: 'product_id', op: 'eq', val: pid }]);
        }
        for (const cid of batchCategories) {
          await adminInsert(supabase, 'product_categories', { product_id: pid, category_id: cid });
        }
        for (const tid of batchTags) {
          await adminInsert(supabase, 'product_tags', { product_id: pid, tag_id: tid });
        }
      }
      toast.success(`已为 ${productIds.length} 个商品${batchMode === 'add' ? '追加' : '替换'}分类标签`);
      setShowBatchModal(false);
      setSelectedProducts(new Set());
      setBatchCategories([]);
      setBatchTags([]);
      fetchProducts();
    } catch (error: any) {
      toast.error('批量操作失败: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const getCategoryName = (id: string) => {
    const cat = categories.find(c => c.id === id);
    return cat ? (cat.name_i18n?.zh || cat.code) : id.slice(0, 8);
  };
  const getTagName = (id: string) => {
    const tag = tags.find(t => t.id === id);
    return tag ? (tag.name_i18n?.zh || tag.code) : id.slice(0, 8);
  };
  const getTagGroup = (id: string): TagGroup => {
    const tag = tags.find(t => t.id === id);
    return tag?.tag_group || 'scene';
  };
  const tagsByGroup = tags.reduce<Record<TagGroup, DbHomepageTagRow[]>>((acc, t) => {
    if (!acc[t.tag_group]) acc[t.tag_group] = [];
    acc[t.tag_group].push(t);
    return acc;
  }, {} as Record<TagGroup, DbHomepageTagRow[]>);
  const unassignedCount = products.filter(p => p.category_ids.length === 0).length;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">商品分类标签管理</h1>
          <p className="text-sm text-gray-500 mt-1">共 {products.length} 个商品，{unassignedCount} 个未分配分类</p>
        </div>
        <div className="flex gap-2">
          {selectedProducts.size > 0 && (
            <button onClick={() => setShowBatchModal(true)}
              className="flex items-center gap-2 bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600">
              <Tag className="w-4 h-4" /> 批量操作 ({selectedProducts.size})
            </button>
          )}
          <button onClick={() => { fetchBaseData(); fetchProducts(); }}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200">
            <RefreshCw className="w-4 h-4" /> 刷新
          </button>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input type="text" value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full border rounded pl-9 pr-3 py-2" placeholder="搜索商品名称或 SKU..." />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border rounded px-3 py-2">
          <option value="all">全部状态</option>
          <option value="ACTIVE">上架中</option>
          <option value="INACTIVE">已下架</option>
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="border rounded px-3 py-2">
          <option value="all">全部分类</option>
          <option value="unassigned">未分配</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name_i18n?.zh || c.code}</option>
          ))}
        </select>
      </div>

      {/* 商品列表 */}
      {loading ? (
        <div className="text-center py-12">加载中...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">无匹配商品</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input type="checkbox" checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                    onChange={selectAll} className="rounded" />
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">商品</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">分类</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">标签</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredProducts.map(product => {
                const name = (product.name_i18n as I18nText)?.zh || product.sku;
                const isEditing = editingProductId === product.id;
                return (
                  <tr key={product.id} className={`hover:bg-gray-50 ${isEditing ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedProducts.has(product.id)}
                        onChange={() => toggleSelectProduct(product.id)} className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={product.image_url} alt="" className="w-10 h-10 rounded object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = ''; }} />
                        <div>
                          <div className="text-sm font-medium text-gray-800 max-w-[200px] truncate">{name}</div>
                          <div className="text-xs text-gray-500">{product.sku} | {product.original_price} TJS</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex flex-wrap gap-1">
                          {categories.map(cat => (
                            <button key={cat.id}
                              onClick={() => setEditCategories(prev =>
                                prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
                              )}
                              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                                editCategories.includes(cat.id)
                                  ? 'bg-orange-500 text-white border-orange-500'
                                  : 'bg-white text-gray-600 border-gray-300 hover:border-orange-300'
                              }`}>
                              {cat.name_i18n?.zh || cat.code}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {product.category_ids.length === 0 ? (
                            <span className="text-xs text-gray-400">未分配</span>
                          ) : product.category_ids.map(cid => (
                            <span key={cid} className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                              {getCategoryName(cid)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex flex-wrap gap-1 max-w-[300px]">
                          {tags.map(tag => (
                            <button key={tag.id}
                              onClick={() => setEditTags(prev =>
                                prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                              )}
                              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                                editTags.includes(tag.id)
                                  ? 'bg-blue-500 text-white border-blue-500'
                                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'
                              }`}>
                              {tag.name_i18n?.zh || tag.code}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {product.tag_ids.length === 0 ? (
                            <span className="text-xs text-gray-400">无标签</span>
                          ) : product.tag_ids.map(tid => {
                            const group = getTagGroup(tid);
                            return (
                              <span key={tid} className={`text-xs px-2 py-0.5 rounded ${TAG_GROUP_COLORS[group]}`}>
                                {getTagName(tid)}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={saveEdit} disabled={saving}
                            className="flex items-center gap-1 bg-green-500 text-white px-2 py-1 rounded text-xs hover:bg-green-600 disabled:opacity-50">
                            <Save className="w-3 h-3" /> {saving ? '...' : '保存'}
                          </button>
                          <button onClick={cancelEdit}
                            className="flex items-center gap-1 bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs hover:bg-gray-200">
                            <X className="w-3 h-3" /> 取消
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(product)}
                          className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs hover:bg-blue-200">
                          <Tag className="w-3 h-3" /> 编辑
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 批量操作模态框 */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">批量操作 ({selectedProducts.size} 个商品)</h2>
                <button onClick={() => setShowBatchModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex gap-4 mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="batchMode" value="add"
                    checked={batchMode === 'add'} onChange={() => setBatchMode('add')} />
                  <span className="text-sm">追加模式</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="batchMode" value="replace"
                    checked={batchMode === 'replace'} onChange={() => setBatchMode('replace')} />
                  <span className="text-sm text-red-600">替换模式</span>
                </label>
              </div>
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" /> 分类
                </h3>
                <div className="flex flex-wrap gap-2">
                  {categories.map(cat => (
                    <button key={cat.id}
                      onClick={() => setBatchCategories(prev =>
                        prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
                      )}
                      className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                        batchCategories.includes(cat.id)
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-orange-300'
                      }`}>
                      {cat.name_i18n?.zh || cat.code}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4" /> 标签
                </h3>
                {Object.entries(tagsByGroup).map(([group, groupTags]) => (
                  <div key={group} className="mb-3">
                    <div className="text-xs text-gray-500 mb-1">{TAG_GROUP_LABELS[group as TagGroup]}</div>
                    <div className="flex flex-wrap gap-2">
                      {groupTags.map(tag => (
                        <button key={tag.id}
                          onClick={() => setBatchTags(prev =>
                            prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                          )}
                          className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                            batchTags.includes(tag.id)
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'
                          }`}>
                          {tag.name_i18n?.zh || tag.code}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end pt-4 border-t">
                <button onClick={() => setShowBatchModal(false)}
                  className="px-4 py-2 border rounded hover:bg-gray-50">取消</button>
                <button onClick={executeBatch}
                  disabled={saving || (batchCategories.length === 0 && batchTags.length === 0)}
                  className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50">
                  {saving ? '处理中...' : `确认${batchMode === 'add' ? '追加' : '替换'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
