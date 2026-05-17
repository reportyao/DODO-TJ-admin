import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { adminDelete, adminInsert, adminQuery, adminUpdate } from '../lib/adminApi';
import ProductPickerPanel, { ProductPickerItem } from '../components/ProductPickerPanel';
import { MultiLanguageInput } from '../components/MultiLanguageInput';

type I18nField = Record<string, string>;

type GiftRule = {
  id: string;
  name: string;
  description?: string | null;
  name_i18n?: I18nField | null;
  description_i18n?: I18nField | null;
  threshold_amount: number;
  max_gift_items: number;
  is_active: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

type GiftRuleProduct = {
  id?: string;
  rule_id?: string;
  product_id: string;
  gift_quantity: number;
  sort_order: number;
  is_active: boolean;
  product_name?: string;
  image_url?: string | null;
  sku?: string | null;
  stock?: number | null;
};

type InventoryProduct = {
  id: string;
  name?: string;
  name_i18n?: Record<string, string> | null;
  image_url?: string | null;
  sku?: string | null;
  stock?: number | null;
  status?: string;
};

const emptyForm = {
  name: '',
  description: '',
  name_i18n: {} as I18nField,
  description_i18n: {} as I18nField,
  threshold_amount: 1000,
  max_gift_items: 1,
  is_active: true,
  starts_at: '',
  ends_at: '',
  sort_order: 100,
};

function toLocalInputValue(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

function getProductName(product?: Partial<InventoryProduct> | GiftRuleProduct): string {
  const anyProduct = product as any;
  return anyProduct?.name_i18n?.zh || anyProduct?.name_i18n?.ru || anyProduct?.name || anyProduct?.product_name || '未命名商品';
}

function getRuleDisplayName(rule: GiftRule): string {
  return rule.name_i18n?.zh || rule.name_i18n?.ru || rule.name || '未命名规则';
}

export default function B2BGiftWithPurchasePage() {
  const [rules, setRules] = useState<GiftRule[]>([]);
  const [ruleProducts, setRuleProducts] = useState<Record<string, GiftRuleProduct[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRule, setEditingRule] = useState<GiftRule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [giftProducts, setGiftProducts] = useState<GiftRuleProduct[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminQuery<GiftRule>(supabase, 'b2b_gift_rules', {
        orderBy: 'threshold_amount',
        orderAsc: false,
        limit: 100,
      });
      setRules(list);

      const links = await adminQuery<GiftRuleProduct>(supabase, 'b2b_gift_rule_products', {
        orderBy: 'sort_order',
        orderAsc: true,
        limit: 1000,
      });
      const productIds = Array.from(new Set(links.map((item) => item.product_id).filter(Boolean)));
      let productMap = new Map<string, InventoryProduct>();
      if (productIds.length > 0) {
        const products = await adminQuery<InventoryProduct>(supabase, 'inventory_products', {
          select: 'id,name,name_i18n,image_url,sku,stock,status',
          filters: [{ col: 'id', op: 'in', val: productIds.join(',') }],
          limit: productIds.length,
        });
        productMap = new Map(products.map((product) => [product.id, product]));
      }
      const grouped: Record<string, GiftRuleProduct[]> = {};
      links.forEach((link) => {
        const product = productMap.get(link.product_id);
        const enriched = {
          ...link,
          product_name: getProductName(product),
          image_url: product?.image_url || null,
          sku: product?.sku || null,
          stock: product?.stock ?? null,
        };
        if (!link.rule_id) return;
        grouped[link.rule_id] = [...(grouped[link.rule_id] || []), enriched];
      });
      setRuleProducts(grouped);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeRuleCount = useMemo(() => rules.filter((rule) => rule.is_active).length, [rules]);

  const openCreate = () => {
    setEditingRule(null);
    setForm({ ...emptyForm, name_i18n: {}, description_i18n: {} });
    setGiftProducts([]);
    setPickerOpen(false);
  };

  const openEdit = (rule: GiftRule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name || '',
      description: rule.description || '',
      name_i18n: rule.name_i18n ? { ...rule.name_i18n } : {},
      description_i18n: rule.description_i18n ? { ...rule.description_i18n } : {},
      threshold_amount: Number(rule.threshold_amount || 0),
      max_gift_items: Number(rule.max_gift_items || 1),
      is_active: Boolean(rule.is_active),
      starts_at: toLocalInputValue(rule.starts_at),
      ends_at: toLocalInputValue(rule.ends_at),
      sort_order: Number(rule.sort_order || 100),
    });
    setGiftProducts(ruleProducts[rule.id] || []);
    setPickerOpen(false);
  };

  const handleAddProducts = (products: ProductPickerItem[]) => {
    setGiftProducts((prev) => {
      const existing = new Set(prev.map((item) => item.product_id));
      const additions = products
        .filter((product) => !existing.has(product.id))
        .map((product, index) => ({
          product_id: product.id,
          gift_quantity: 1,
          sort_order: (prev.length + index + 1) * 10,
          is_active: true,
          product_name: getProductName(product),
          image_url: product.image_url || null,
          sku: product.sku || null,
          stock: product.stock ?? null,
        }));
      return [...prev, ...additions];
    });
  };

  const handleSave = async () => {
    // 至少需要一种语言的名称
    const hasName = form.name.trim() || form.name_i18n?.zh?.trim() || form.name_i18n?.ru?.trim() || form.name_i18n?.tg?.trim();
    if (!hasName) {
      alert('请至少输入一种语言的规则名称');
      return;
    }
    if (!Number.isFinite(Number(form.threshold_amount)) || Number(form.threshold_amount) <= 0) {
      alert('门槛金额必须大于0');
      return;
    }
    if (giftProducts.length === 0) {
      alert('请至少添加一个赠品');
      return;
    }

    setSaving(true);
    try {
      // 自动回填 name 字段（兼容旧逻辑）：优先用中文，其次俄语，最后塔吉克语
      const effectiveName = form.name_i18n?.zh?.trim() || form.name_i18n?.ru?.trim() || form.name_i18n?.tg?.trim() || form.name.trim();

      // MultiLanguageInput 已自动清除空键，直接使用
      const nameI18n = Object.keys(form.name_i18n || {}).length > 0 ? form.name_i18n : null;
      const descI18n = Object.keys(form.description_i18n || {}).length > 0 ? form.description_i18n : null;

      const payload = {
        name: effectiveName,
        description: form.description_i18n?.zh?.trim() || form.description_i18n?.ru?.trim() || form.description.trim() || null,
        name_i18n: nameI18n,
        description_i18n: descI18n,
        threshold_amount: Number(form.threshold_amount),
        max_gift_items: Math.max(1, Number(form.max_gift_items || 1)),
        is_active: form.is_active,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        sort_order: Number(form.sort_order || 100),
        updated_at: new Date().toISOString(),
      };

      let ruleId = editingRule?.id;
      if (ruleId) {
        await adminUpdate(supabase, 'b2b_gift_rules', payload, [{ col: 'id', op: 'eq', val: ruleId }]);
        await adminDelete(supabase, 'b2b_gift_rule_products', [{ col: 'rule_id', op: 'eq', val: ruleId }]);
      } else {
        const inserted = await adminInsert<any>(supabase, 'b2b_gift_rules', payload);
        ruleId = inserted?.id || inserted?.[0]?.id;
      }

      if (!ruleId) throw new Error('保存规则失败：缺少规则ID');

      for (const [index, product] of giftProducts.entries()) {
        await adminInsert(supabase, 'b2b_gift_rule_products', {
          rule_id: ruleId,
          product_id: product.product_id,
          gift_quantity: Math.max(1, Number(product.gift_quantity || 1)),
          sort_order: Number(product.sort_order || (index + 1) * 10),
          is_active: product.is_active !== false,
        });
      }

      await loadData();
      setEditingRule(null);
      setForm({ ...emptyForm, name_i18n: {}, description_i18n: {} });
      setGiftProducts([]);
      alert('满额赠送规则已保存');
    } catch (error: any) {
      alert(error?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rule: GiftRule) => {
    if (!confirm(`确定删除规则「${getRuleDisplayName(rule)}」？赠品池会一并删除。`)) return;
    await adminDelete(supabase, 'b2b_gift_rules', [{ col: 'id', op: 'eq', val: rule.id }]);
    await loadData();
    if (editingRule?.id === rule.id) openCreate();
  };

  const handleToggleActive = async (rule: GiftRule) => {
    await adminUpdate(supabase, 'b2b_gift_rules', { is_active: !rule.is_active, updated_at: new Date().toISOString() }, [{ col: 'id', op: 'eq', val: rule.id }]);
    await loadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">满额赠送配置</h1>
          <p className="text-sm text-gray-500 mt-1">配置批发购物车达到指定金额后可选择的0元赠品池，实际资格会在下单时由服务端再次校验。规则名称和说明支持中文/俄语/塔吉克语三种语言。</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">新建规则</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4"><div className="text-sm text-gray-500">规则总数</div><div className="text-2xl font-bold">{rules.length}</div></div>
        <div className="bg-white rounded-xl border p-4"><div className="text-sm text-gray-500">启用规则</div><div className="text-2xl font-bold text-green-600">{activeRuleCount}</div></div>
        <div className="bg-white rounded-xl border p-4"><div className="text-sm text-gray-500">最高门槛</div><div className="text-2xl font-bold">TJS {Math.max(0, ...rules.map((r) => Number(r.threshold_amount || 0))).toFixed(2)}</div></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 规则列表 */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold">规则列表</div>
          {loading ? <div className="p-6 text-gray-500">加载中...</div> : (
            <div className="divide-y">
              {rules.map((rule) => (
                <div key={rule.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{getRuleDisplayName(rule)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${rule.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{rule.is_active ? '启用' : '停用'}</span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">满 TJS {Number(rule.threshold_amount).toFixed(2)} 可选 {rule.max_gift_items} 件赠品 · {ruleProducts[rule.id]?.length || 0} 个赠品SKU</div>
                      {/* 显示多语言名称预览 */}
                      {rule.name_i18n && Object.keys(rule.name_i18n).length > 0 && (
                        <div className="text-xs text-gray-400 mt-1 space-x-2">
                          {rule.name_i18n.ru && <span>🇷🇺 {rule.name_i18n.ru}</span>}
                          {rule.name_i18n.tg && <span>🇹🇯 {rule.name_i18n.tg}</span>}
                          {rule.name_i18n.zh && <span>🇨🇳 {rule.name_i18n.zh}</span>}
                        </div>
                      )}
                      {rule.description && <div className="text-xs text-gray-400 mt-1">{rule.description}</div>}
                    </div>
                    <div className="flex gap-2 text-sm">
                      <button onClick={() => openEdit(rule)} className="text-blue-600 hover:underline">编辑</button>
                      <button onClick={() => handleToggleActive(rule)} className="text-amber-600 hover:underline">{rule.is_active ? '停用' : '启用'}</button>
                      <button onClick={() => handleDelete(rule)} className="text-red-600 hover:underline">删除</button>
                    </div>
                  </div>
                </div>
              ))}
              {rules.length === 0 && <div className="p-6 text-gray-500">暂无规则，请先新建。</div>}
            </div>
          )}
        </div>

        {/* 编辑/新建表单 */}
        <div className="bg-white rounded-xl border p-4 space-y-4">
          <div className="font-semibold">{editingRule ? '编辑规则' : '新建规则'}</div>

          {/* 多语言规则名称 */}
          <MultiLanguageInput
            label="规则名称（多语言）"
            value={form.name_i18n}
            onChange={(val) => setForm({ ...form, name_i18n: val })}
            placeholder="例如：满1000送试用装"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1"><span className="text-sm text-gray-600">门槛金额（TJS）</span><input type="number" min="0" value={form.threshold_amount} onChange={(e) => setForm({ ...form, threshold_amount: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2" /></label>
            <label className="space-y-1"><span className="text-sm text-gray-600">最多可选</span><input type="number" min="1" value={form.max_gift_items} onChange={(e) => setForm({ ...form, max_gift_items: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2" /></label>
            <label className="space-y-1"><span className="text-sm text-gray-600">开始时间</span><input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></label>
            <label className="space-y-1"><span className="text-sm text-gray-600">结束时间</span><input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></label>
            <label className="space-y-1"><span className="text-sm text-gray-600">排序</span><input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2" /></label>
            <label className="flex items-center gap-2 pt-6"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />启用规则</label>
          </div>

          {/* 多语言说明 */}
          <MultiLanguageInput
            label="规则说明（多语言，选填）"
            value={form.description_i18n}
            onChange={(val) => setForm({ ...form, description_i18n: val })}
            placeholder="活动说明"
            multiline
            rows={2}
          />

          {/* 赠品池 */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between"><div className="font-medium">赠品池</div><button onClick={() => setPickerOpen(true)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm">添加赠品</button></div>
            <div className="space-y-2">
              {giftProducts.map((product, index) => (
                <div key={product.product_id} className="flex items-center gap-3 border rounded-lg p-2">
                  <div className="w-12 h-12 rounded bg-gray-100 overflow-hidden">{product.image_url ? <img src={product.image_url} alt="" className="w-full h-full object-cover" /> : null}</div>
                  <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{product.product_name}</div><div className="text-xs text-gray-500">SKU {product.sku || '-'} · 库存 {product.stock ?? '-'}</div></div>
                  <input type="number" min="1" value={product.gift_quantity} onChange={(e) => setGiftProducts((prev) => prev.map((item, i) => i === index ? { ...item, gift_quantity: Number(e.target.value) } : item))} className="w-20 border rounded px-2 py-1 text-sm" />
                  <button onClick={() => setGiftProducts((prev) => prev.filter((item) => item.product_id !== product.product_id))} className="text-red-600 text-sm">移除</button>
                </div>
              ))}
              {giftProducts.length === 0 && <div className="text-sm text-gray-500 border rounded-lg p-4">尚未添加赠品。</div>}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2"><button onClick={openCreate} className="px-4 py-2 border rounded-lg">重置</button><button disabled={saving} onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">{saving ? '保存中...' : '保存规则'}</button></div>
        </div>
      </div>

      {pickerOpen && (
        <ProductPickerPanel
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onConfirm={(products: ProductPickerItem[]) => { handleAddProducts(products); setPickerOpen(false); }}
          existingProductIds={giftProducts.map((item) => item.product_id)}
        />
      )}
    </div>
  );
}
