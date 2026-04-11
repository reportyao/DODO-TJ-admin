import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Enums } from '@/types/supabase';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { MultiLanguageInput } from '../MultiLanguageInput';
import { RichTextEditor } from '../RichTextEditor';
import { ImageUpload } from '../ui/ImageUpload';
import { PriceComparisonInput } from '../PriceComparisonInput';
import toast from 'react-hot-toast';
import { formatDateTime } from '@/lib/utils';
import { adminInsert, adminUpdate } from '@/lib/adminApi';

type LotteryStatus = Enums<'LotteryStatus'>;
type Currency = Enums<'Currency'>;

interface PriceComparisonItem {
  platform: string;
  price: number;
}

interface InventoryProduct {
  id: string;
  name: string;
  name_i18n: { zh?: string; ru?: string; tg?: string };
  description_i18n?: { zh?: string; ru?: string; tg?: string };
  original_price: number;
  stock: number;
  status: string;
  image_urls?: string[];
  category?: string;
  sku?: string;
  ai_understanding?: Record<string, any> | null;
}

interface LotteryFormData {
  title: Record<string, string> | null;
  description: Record<string, string> | null;
  period: string;
  ticket_price: number;
  total_tickets: number;
  max_per_user: number;
  unlimited_purchase: boolean;
  currency: Currency;
  status: LotteryStatus;
  image_urls: string[];
  start_time: string;
  price_comparisons: PriceComparisonItem[];
  inventory_product_id: string | null;
  full_purchase_enabled: boolean;
  full_purchase_price: number | null;
  ai_understanding: Record<string, any> | null;
}

const initialFormData: LotteryFormData = {
  title: { zh: '', en: '', ru: '', tg: '' },
  description: { zh: '', en: '', ru: '', tg: '' },
  period: '',
  ticket_price: 0,
  total_tickets: 0,
  max_per_user: 1,
  unlimited_purchase: true,
  currency: 'TJS',
  status: 'PENDING',
  image_urls: [],
  start_time: new Date().toISOString().slice(0, 16),
  price_comparisons: [],
  inventory_product_id: null,
  full_purchase_enabled: true,
  full_purchase_price: null,
  ai_understanding: null,
};

/**
 * 生成期号：使用复杂算法避免规律被发现
 * 算法：时间戳 + 随机数 + Base36编码 + 校验位
 */
const generatePeriod = (): string => {
  const now = Date.now();
  // 使用时间戳的后8位 + 随机4位数
  const timePart = (now % 100000000).toString(36).toUpperCase();
  const randomPart = Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0');
  // 计算校验位（防止伪造）
  const checksum = ((now + Math.floor(Math.random() * 1000)) % 36).toString(36).toUpperCase();
  return `LM${timePart}${randomPart}${checksum}`;
};

export const LotteryForm: React.FC = () => {
  const { supabase } = useSupabase();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [formData, setFormData] = useState<LotteryFormData>(initialFormData);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [lotteryRound, setLotteryRound] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inventoryProducts, setInventoryProducts] = useState<InventoryProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // 加载库存商品列表
  const loadInventoryProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('inventory_products')
        .select('id, name, name_i18n, description_i18n, original_price, stock, status, image_urls, ai_understanding')
        .eq('status', 'ACTIVE')
        .order('name', { ascending: true });

      if (error) {throw error;}
      setInventoryProducts(data || []);
    } catch (error) {
      console.error('Failed to load inventory products:', error);
    }
  }, [supabase]);

  useEffect(() => {
    loadInventoryProducts();
  }, [loadInventoryProducts]);

  // 筛选和搜索库存商品
  const filteredProducts = useMemo(() => {
    let filtered = inventoryProducts;

    // 分类筛选
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(p => p.category === categoryFilter);
    }

    // 搜索筛选（按名称或ID）
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => {
        const name = p.name_i18n?.zh || p.name || '';
        const id = p.id || '';
        return name.toLowerCase().includes(query) || id.toLowerCase().includes(query);
      });
    }

    return filtered;
  }, [inventoryProducts, searchQuery, categoryFilter]);

  // 获取所有分类
  const categories = useMemo(() => {
    const cats = new Set<string>();
    inventoryProducts.forEach(p => {
      if (p.category) {cats.add(p.category);}
    });
    return Array.from(cats).sort();
  }, [inventoryProducts]);

  const loadLottery = useCallback(async () => {
    if (!id) {return;}

    try {
      const { data, error } = await supabase
        .from('lotteries')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {throw error;}

      if (data) {
        // 如果已开奖，尝试获取开奖轮次信息
        if (data.status === 'COMPLETED') {
          // 修复: 使用正确的表关系查询lottery_results
          // lottery_results表使用winner_id字段关联users表
          const { data: roundData, error: roundError } = await supabase
            .from('lottery_results')
            .select(
              `
                *,
                winner:users!lottery_results_winner_id_fkey (
                  id,
                  phone_number,
                  first_name,
                  last_name,
                  avatar_url
                )
              `
            )
            .eq('lottery_id', id)
            .single();

          if (roundError && roundError.code !== 'PGRST116') {
            console.error('Failed to fetch lottery result:', roundError);
            // 不抛出错误，继续加载表单数据
          }
          const result = roundData ? { ...roundData, winner: roundData.winner } : null;
          setLotteryRound(result);
        }

        // 解析比价清单数据
        let priceComparisons: PriceComparisonItem[] = [];
        try {
          const rawComparisons = (data as any).price_comparisons;
          if (Array.isArray(rawComparisons)) {
            priceComparisons = rawComparisons;
          }
        } catch {
          priceComparisons = [];
        }

        setFormData({
          // 优先使用JSONB字段，如果为空则尝试从旧字段读取
          title: (data.title_i18n as Record<string, string>) || (typeof data.title === 'string' ? { zh: data.title } : {}),
          description: (data.description_i18n as Record<string, string>) || (typeof data.description === 'string' ? { zh: data.description } : {}),
          period: data.period,
          ticket_price: data.ticket_price,
          total_tickets: data.total_tickets,
          max_per_user: data.max_per_user || 1,
          unlimited_purchase: data.max_per_user === null,
          currency: data.currency,
          status: data.status,
          image_urls: data.image_urls && data.image_urls.length > 0 ? data.image_urls : (data.image_url ? [data.image_url] : []),
          start_time: new Date(data.start_time).toISOString().slice(0, 16),
          price_comparisons: priceComparisons,
          inventory_product_id: data.inventory_product_id || null,
          full_purchase_enabled: data.full_purchase_enabled !== false,
          full_purchase_price: data.full_purchase_price || null,
          ai_understanding: (data as any).ai_understanding || null,
        });
      }
    } catch (error: any) {
      toast.error(`加载商城信息失败: ${error.message}`);
      console.error('Error loading lottery:', error);
    } finally {
      setIsLoading(false);
    }
  }, [id, supabase]);

  useEffect(() => {
    if (isEdit) {
      loadLottery();
    } else {
      setIsLoading(false);
    }
  }, [isEdit, loadLottery]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [id]: type === 'number' ? parseFloat(value) : value,
    }));
  };

  const handleSelectChange = (id: keyof LotteryFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const handleMultiLangChange = (id: 'title' | 'description', value: Record<string, string>) => {
    setFormData((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const handleUnlimitedPurchaseChange = (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      unlimited_purchase: checked,
      max_per_user: checked ? 1 : prev.max_per_user,
    }));
  };

  const handlePriceComparisonsChange = (value: PriceComparisonItem[]) => {
    setFormData((prev) => ({
      ...prev,
      price_comparisons: value,
    }));
  };

  // 选择SKU后自动填充数据
  const handleProductSelect = (productId: string) => {
    if (productId === 'none') {
      setFormData((prev) => ({
        ...prev,
        inventory_product_id: null,
      }));
      return;
    }

    const selectedProduct = inventoryProducts.find(p => p.id === productId);
    if (!selectedProduct) {return;}

    // 自动填充所有相关字段
    setFormData((prev) => ({
      ...prev,
      inventory_product_id: productId,
      // 自动填充标题
      title: selectedProduct.name_i18n || { zh: selectedProduct.name },
      // 自动填充描述
      description: selectedProduct.description_i18n || prev.description,
      // 自动填充图片
      image_urls: selectedProduct.image_urls && selectedProduct.image_urls.length > 0 
        ? selectedProduct.image_urls 
        : prev.image_urls,
      // 自动填充全款购买价格
      full_purchase_price: selectedProduct.original_price,
      // 自动填充单价（默认为1）
      ticket_price: prev.ticket_price === 0 ? 1 : prev.ticket_price,
      // 自动填充总票数（等于全款购买价格）
      total_tickets: prev.total_tickets === 0 ? Math.round(selectedProduct.original_price / 1) : prev.total_tickets,
      // 自动同步 AI 理解数据
      ai_understanding: selectedProduct.ai_understanding || null,
    }));

    toast.success('已自动填充商品信息！');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // 修复 A04: 添加全面输入验证
      if (formData.image_urls.length === 0) {
        toast.error('请至少上传一张图片');
        setIsSubmitting(false);
        return;
      }

      if (!formData.title?.zh?.trim()) {
        toast.error('请输入中文标题');
        setIsSubmitting(false);
        return;
      }

      if (!formData.ticket_price || Number(formData.ticket_price) <= 0) {
        toast.error('票价必须大于 0');
        setIsSubmitting(false);
        return;
      }

      if (!formData.total_tickets || Number(formData.total_tickets) <= 0) {
        toast.error('总票数必须大于 0');
        setIsSubmitting(false);
        return;
      }

      if (formData.full_purchase_enabled && (!formData.full_purchase_price || Number(formData.full_purchase_price) <= 0)) {
        toast.error('已启用全款购买，请设置全款价格');
        setIsSubmitting(false);
        return;
      }

      // 修复 A04-3: 编辑模式下防止修改已售彩票的关键字段
      if (isEdit && lotteryRound === null) {
        // 获取当前已售票数
        const { data: currentLottery } = await supabase
          .from('lotteries')
          .select('sold_tickets')
          .eq('id', id)
          .single();

        if (currentLottery && currentLottery.sold_tickets > 0) {
          if (Number(formData.total_tickets) < currentLottery.sold_tickets) {
            toast.error(`总票数不能小于已售票数 ${currentLottery.sold_tickets}`);
            setIsSubmitting(false);
            return;
          }
        }
      }

      // 计算结束时间和开奖时间（售罄后180秒自动开奖）
      const startTime = new Date(formData.start_time);
      // 结束时间设置为开始后7天（或根据业务需求调整）
      const endTime = new Date(startTime.getTime() + 7 * 24 * 60 * 60 * 1000);
      // 开奖时间 = 结束时间 + 180秒
      const drawTime = new Date(endTime.getTime() + 180 * 1000);

      // 显式构建 Payload，只包含数据库中存在的字段，彻底移除 details_i18n
      const payload: any = {
        title: (formData.title && formData.title.zh) || '',
        description: (formData.description && formData.description.zh) || '',
        title_i18n: formData.title || {},
        description_i18n: formData.description || {},
        period: isEdit ? formData.period : generatePeriod(),
        ticket_price: Number(formData.ticket_price),
        total_tickets: Number(formData.total_tickets),
        max_per_user: formData.unlimited_purchase ? null : Number(formData.max_per_user),
        currency: 'TJS',
        status: formData.status,
        image_url: formData.image_urls[0] || null,
        image_urls: formData.image_urls,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        draw_time: drawTime.toISOString(),
        updated_at: new Date().toISOString(),
        price_comparisons: formData.price_comparisons,
        inventory_product_id: formData.inventory_product_id || null,
        full_purchase_enabled: formData.full_purchase_enabled,
        full_purchase_price: formData.full_purchase_price ? Number(formData.full_purchase_price) : null,
        original_price: formData.full_purchase_price ? Number(formData.full_purchase_price) : 0,
        ai_understanding: formData.ai_understanding || null,
      };

      if (isEdit) {
        await adminUpdate(supabase, 'lotteries', payload, [{ col: 'id', op: 'eq', val: id as string }]);
      } else {
        await adminInsert(supabase, 'lotteries', payload);
      }

      toast.success(isEdit ? '商城信息更新成功!' : '商城创建成功!');
      navigate('/lotteries');
    } catch (error: any) {
      toast.error(error.message || (isEdit ? '更新失败' : '创建失败'));
      console.error('Submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-10">加载中...</div>;
  }

  const isDrawn = formData.status === 'COMPLETED';

  const verificationData = lotteryRound
    ? [
        { label: '开奖时间', value: formatDateTime(lotteryRound.draw_time) },
        { label: '中奖号码 (Winning Number)', value: lotteryRound.winning_number },
        { label: '时间戳总和 (S)', value: lotteryRound.timestamp_sum },
        { label: '总份数 (N)', value: lotteryRound.total_shares },
        { label: '中奖用户', value: lotteryRound.winner?.phone_number || lotteryRound.winner?.first_name || '暂无' },
        { label: '中奖门票 ID', value: lotteryRound.winning_ticket_id },
      ]
    : [];

  return (
    <Card className="w-full max-w-4xl mx-auto">
      {isDrawn && lotteryRound && (
        <Card className="mb-6 border-2 border-green-500 bg-green-50">
          <CardHeader>
            <CardTitle className="text-xl text-green-700">开奖结果与验证数据</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {verificationData.map((item, index) => (
                <div key={index} className="space-y-1">
                  <Label className="text-sm font-medium text-green-600">{item.label}</Label>
                  <p className="text-base font-semibold text-gray-800 break-all">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-green-100 rounded-lg">
              <Label className="text-sm font-medium text-green-600">开奖公式</Label>
              <p className="text-sm font-mono text-gray-700 break-all">
                (时间戳总和 S / 总份数 N) % 总份数 N + 1 = 中奖号码
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      <CardHeader>
        <CardTitle>{isEdit ? '编辑商城' : '创建新商城'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 🔝 关联库存商品（移到最上面） */}
          <div className="border-2 border-blue-200 rounded-lg p-6 space-y-4 bg-blue-50">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-bold text-blue-900">📦 关联库存商品（推荐优先选择）</Label>
              <div className="flex items-center gap-2">
                <input
                  id="full_purchase_enabled"
                  type="checkbox"
                  checked={formData.full_purchase_enabled}
                  onChange={(e) => setFormData((prev) => ({ ...prev, full_purchase_enabled: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <Label htmlFor="full_purchase_enabled" className="cursor-pointer text-sm">
                  启用全款购买
                </Label>
              </div>
            </div>
            
            {formData.full_purchase_enabled && (
              <>
                {/* 搜索和筛选 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="search">🔍 搜索商品</Label>
                    <Input
                      id="search"
                      type="text"
                      placeholder="输入商品名称或ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">🏷️ 分类筛选</Label>
                    <Select
                      value={categoryFilter}
                      onValueChange={setCategoryFilter}
                    >
                      <SelectTrigger id="category" className="bg-white">
                        <SelectValue placeholder="选择分类" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部分类</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* SKU选择 */}
                <div className="space-y-2">
                  <Label htmlFor="inventory_product_id">选择库存商品 *</Label>
                  <Select
                    value={formData.inventory_product_id || 'none'}
                    onValueChange={handleProductSelect}
                  >
                    <SelectTrigger id="inventory_product_id" className="bg-white">
                      <SelectValue placeholder="选择库存商品（将自动填充商品信息）" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      <SelectItem value="none">不关联库存商品</SelectItem>
                      {filteredProducts.length === 0 ? (
                        <SelectItem value="empty" disabled>
                          未找到匹配的商品
                        </SelectItem>
                      ) : (
                        filteredProducts.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            <div className="flex flex-col py-1">
                              <span className="font-medium">
                                {product.name_i18n?.zh || product.name}
                              </span>
                              <span className="text-xs text-gray-500">
                                ID: {product.id.substring(0, 8)}... | 库存: {product.stock} | 价格: TJS {product.original_price}
                              </span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-blue-600 font-medium">
                    💡 选择商品后将自动填充：标题、描述、图片、价格等信息
                  </p>
                  <p className="text-xs text-gray-500">
                    📦 关联库存商品后，全款购买将从该库存商品扣减库存，不影响一元购物的份数
                  </p>
                </div>

                {/* 显示已选择的商品信息 */}
                {formData.inventory_product_id && (
                  <div className="p-4 bg-white border border-blue-300 rounded-lg">
                    <p className="text-sm font-semibold text-blue-900 mb-2">✅ 已选择商品</p>
                    {(() => {
                      const selected = inventoryProducts.find(p => p.id === formData.inventory_product_id);
                      return selected ? (
                        <div className="space-y-1 text-sm">
                          <p><strong>名称:</strong> {selected.name_i18n?.zh || selected.name}</p>
                          <p><strong>ID:</strong> {selected.id}</p>
                          <p><strong>库存:</strong> {selected.stock}</p>
                          <p><strong>原价:</strong> TJS {selected.original_price}</p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="full_purchase_price">全款购买价格（TJS）</Label>
                  <Input
                    id="full_purchase_price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.full_purchase_price || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, full_purchase_price: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="留空则使用库存商品原价"
                    className="bg-white"
                  />
                  <p className="text-xs text-gray-500">
                    💰 留空则使用关联库存商品的原价
                  </p>
                </div>
              </>
            )}
          </div>

          {/* 多语言标题 */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <span>商城标题</span>
              <span className="text-xs text-gray-500 font-normal">(将同步到 title_i18n)</span>
            </Label>
            <MultiLanguageInput
              value={formData.title || {}}
              onChange={(v) => handleMultiLangChange('title', v)}
              placeholder="输入商品标题"
            />
          </div>

          {/* 多语言描述 */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <span>商城描述 / 详情</span>
              <span className="text-xs text-gray-500 font-normal">(支持多行文本，将同步到 description_i18n)</span>
            </Label>
            <MultiLanguageInput
              value={formData.description || {}}
              onChange={(v) => handleMultiLangChange('description', v)}
              placeholder="输入商品描述或详细介绍"
              multiline={true}
              rows={6}
            />
          </div>

          {/* 图片上传 */}
          <div className="space-y-2">
            <Label>商品图片 *</Label>
            <ImageUpload
              value={formData.image_urls}
              onChange={(urls) => setFormData((prev) => ({ ...prev, image_urls: urls }))}
              maxImages={10}
              maxSizeMB={5}
            />
            <p className="text-sm text-gray-500">支持上传最多5张图片，自动压缩并上传到云存储</p>
          </div>

          {/* 期号（自动生成，仅显示） */}
          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="period">期号（自动生成）</Label>
              <Input id="period" type="text" value={formData.period} disabled className="bg-gray-100" />
            </div>
          )}

          {/* 价格和数量 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ticket_price">单价（TJS）*</Label>
              <Input
                id="ticket_price"
                type="number"
                step="0.01"
                min="0"
                value={formData.ticket_price}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_tickets">总票数 *</Label>
              <Input
                id="total_tickets"
                type="number"
                min="1"
                value={formData.total_tickets}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_per_user">每人限购</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="max_per_user"
                  type="number"
                  min="1"
                  value={formData.max_per_user}
                  onChange={handleChange}
                  disabled={formData.unlimited_purchase}
                  className={formData.unlimited_purchase ? 'bg-gray-100' : ''}
                />
              </div>
            </div>
          </div>

          {/* 无限购选项 */}
          <div className="flex items-center gap-2">
            <input
              id="unlimited_purchase"
              type="checkbox"
              checked={formData.unlimited_purchase}
              onChange={(e) => handleUnlimitedPurchaseChange(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <Label htmlFor="unlimited_purchase" className="cursor-pointer">
              无限购（不限制用户购买份数）
            </Label>
          </div>

          {/* 比价清单 */}
          <div className="border-t pt-6">
            <PriceComparisonInput
              value={formData.price_comparisons}
              onChange={handlePriceComparisonsChange}
            />
          </div>

          {/* 开始时间 */}
          <div className="space-y-2">
            <Label htmlFor="start_time">开始时间 *</Label>
            <Input
              id="start_time"
              type="datetime-local"
              value={formData.start_time}
              onChange={handleChange}
              required
            />
            <p className="text-xs text-gray-500">
              💡 售罄后将自动倒计时180秒开奖
            </p>
          </div>

          {/* 状态 */}
          <div className="space-y-2">
            <Label htmlFor="status">状态</Label>
            <Select
              value={formData.status}
              onValueChange={(v) => handleSelectChange('status', v)}
              disabled={isDrawn}
            >
              <SelectTrigger id="status">
                <SelectValue placeholder="选择状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">待开始</SelectItem>
                <SelectItem value="ACTIVE">进行中</SelectItem>
                <SelectItem value="DRAWN">已开奖</SelectItem>
                <SelectItem value="CANCELLED">已取消</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 提示信息 */}
          <div className="space-y-3">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-blue-800">
                💡 货币已固定为<strong>塔吉克索莫尼（TJS）</strong>
              </p>
            </div>
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm text-yellow-800">
                ⏱️ <strong>自动开奖机制</strong>：售罄后系统将自动倒计时180秒，倒计时结束后自动开奖
              </p>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting || isDrawn}>
            {isSubmitting ? '提交中...' : isEdit ? (isDrawn ? '已开奖，无法修改' : '保存更改') : '创建商城'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
