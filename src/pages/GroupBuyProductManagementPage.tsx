import React, { useState, useEffect } from 'react';
import { Plus, Edit, Copy, Trash2, Eye, EyeOff } from 'lucide-react';
import { MultiImageUpload } from '@/components/MultiImageUpload';
import { useSupabase } from '@/contexts/SupabaseContext';
import toast from 'react-hot-toast';

interface PriceComparisonItem {
  platform: string;
  price: number;
}

interface InventoryProduct {
  id: string;
  name: string;
  name_i18n: { zh: string; ru: string; tg: string };
  description: string;
  description_i18n: { zh: string; ru: string; tg: string };
  image_url: string;
  image_urls: string[];
  original_price: number;
  stock: number;
  status: string;
}

// 修复后的接口，完全匹配数据库字段
interface GroupBuyProduct {
  id: string;
  name: string; // 数据库字段
  name_i18n: { zh: string; ru: string; tg: string }; // 数据库字段
  description: string; // 数据库字段
  description_i18n: { zh: string; ru: string; tg: string }; // 数据库字段
  image_url: string;
  image_urls: string[]; // 数据库字段（不是images）
  original_price: number;
  group_price: number; // 数据库字段（不是price_per_person）
  min_participants: number; // 数据库字段（不是group_size）
  max_participants: number; // 数据库字段
  duration_hours: number; // 数据库字段（不是timeout_hours）
  stock: number; // 数据库字段（不是stock_quantity）
  status: 'ACTIVE' | 'INACTIVE';
  currency: string;
  created_at: string;
  updated_at: string;
  price_comparisons?: PriceComparisonItem[];
}

export default function GroupBuyProductManagementPage() {
  const { supabase } = useSupabase();
  const [products, setProducts] = useState<GroupBuyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<GroupBuyProduct | null>(null);
  const [inventoryProducts, setInventoryProducts] = useState<InventoryProduct[]>([]);
  const [showSkuSelector, setShowSkuSelector] = useState(false);
  const [formData, setFormData] = useState({
    name_zh: '',
    name_ru: '',
    name_tg: '',
    description_zh: '',
    description_ru: '',
    description_tg: '',
    image_url: '',
    image_urls: [] as string[],
    original_price: 0,
    min_participants: 3,
    max_participants: 3,
    duration_hours: 24,
    stock: 100,
    currency: 'TJS',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    price_comparisons: [] as PriceComparisonItem[],
  });

  // 比价清单输入状态
  const [newPlatform, setNewPlatform] = useState('');
  const [newPrice, setNewPrice] = useState('');

  useEffect(() => {
    fetchProducts();
    fetchInventoryProducts();
  }, []);

  const fetchInventoryProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory_products')
        .select('id, name, name_i18n, description, description_i18n, image_url, image_urls, original_price, stock, status')
        .eq('status', 'ACTIVE')
        .order('name', { ascending: true });

      if (error) {throw error;}
      setInventoryProducts(data || []);
    } catch (error) {
      console.error('Failed to fetch inventory products:', error);
    }
  };

  const handleSelectSku = (product: InventoryProduct) => {
    const originalPrice = product.original_price || 0;
    setFormData({
      ...formData,
      name_zh: product.name_i18n?.zh || product.name || '',
      name_ru: product.name_i18n?.ru || '',
      name_tg: product.name_i18n?.tg || '',
      description_zh: product.description_i18n?.zh || product.description || '',
      description_ru: product.description_i18n?.ru || '',
      description_tg: product.description_i18n?.tg || '',
      image_url: product.image_url || '',
      image_urls: Array.isArray(product.image_urls) ? product.image_urls : (product.image_url ? [product.image_url] : []),
      original_price: originalPrice,
      stock: product.stock || 100,
      // 一键导入时：参与人数默认为3
      min_participants: 3,
      max_participants: 3,
      // 保留原有的 price_comparisons，不要覆盖
      price_comparisons: formData.price_comparisons || [],
    });
    setShowSkuSelector(false);
    toast.success('已从库存商品导入信息（最少/最多参与人数默认为3）');
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('group_buy_products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {throw error;}
      setProducts(data || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      toast.error('获取商品列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPriceComparison = () => {
    if (!newPlatform.trim() || !newPrice) {
      return;
    }

    const price = parseFloat(newPrice);
    if (isNaN(price) || price <= 0) {
      return;
    }

    const newItem: PriceComparisonItem = {
      platform: newPlatform.trim(),
      price: price,
    };

    setFormData({
      ...formData,
      price_comparisons: [...formData.price_comparisons, newItem],
    });
    setNewPlatform('');
    setNewPrice('');
  };

  const handleRemovePriceComparison = (index: number) => {
    const newComparisons = [...formData.price_comparisons];
    newComparisons.splice(index, 1);
    setFormData({
      ...formData,
      price_comparisons: newComparisons,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 构建完全匹配数据库字段的payload
    const productData = {
      name: formData.name_zh, // 使用中文作为默认name
      name_i18n: {
        zh: formData.name_zh,
        ru: formData.name_ru,
        tg: formData.name_tg,
      },
      description: formData.description_zh, // 使用中文作为默认description
      description_i18n: {
        zh: formData.description_zh,
        ru: formData.description_ru,
        tg: formData.description_tg,
      },
      image_url: formData.image_url,
      image_urls: Array.isArray(formData.image_urls) ? formData.image_urls : [], // 确保始终是数组
      original_price: formData.original_price,
      group_price: Math.round((formData.original_price / formData.min_participants) * 100) / 100, // 正确的字段名
      min_participants: formData.min_participants, // 正确的字段名
      max_participants: formData.max_participants, // 正确的字段名
      duration_hours: formData.duration_hours, // 正确的字段名
      stock: formData.stock, // 正确的字段名
      currency: formData.currency,
      status: formData.status,
      price_comparisons: Array.isArray(formData.price_comparisons) ? formData.price_comparisons : [],
    };

    try {
      if (editingProduct) {
        // Update existing product
        const { error } = await supabase
          .from('group_buy_products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) {throw error;}
        toast.success('商品更新成功');
      } else {
        // Create new product
        const { error } = await supabase
          .from('group_buy_products')
          .insert([productData]);

        if (error) {throw error;}
        toast.success('商品创建成功');
      }

      setShowModal(false);
      setEditingProduct(null);
      resetForm();
      fetchProducts();
    } catch (error) {
      console.error('Failed to save product:', error);
      toast.error(`保存商品失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleEdit = (product: GroupBuyProduct) => {
    setEditingProduct(product);
    // 确保 image_urls 始终是数组，处理所有可能的格式
    let imageUrls: string[] = [];
    if (Array.isArray(product.image_urls)) {
      imageUrls = product.image_urls;
    } else if (typeof product.image_urls === 'string') {
      // 尝试解析 JSON 字符串
      try {
        const parsed = JSON.parse(product.image_urls);
        imageUrls = Array.isArray(parsed) ? parsed : [product.image_urls];
      } catch {
        imageUrls = [product.image_urls];
      }
    } else if (product.image_url) {
      imageUrls = [product.image_url];
    }
    
    setFormData({
      name_zh: product.name_i18n?.zh || product.name || '',
      name_ru: product.name_i18n?.ru || '',
      name_tg: product.name_i18n?.tg || '',
      description_zh: product.description_i18n?.zh || product.description || '',
      description_ru: product.description_i18n?.ru || '',
      description_tg: product.description_i18n?.tg || '',
      image_url: product.image_url || '',
      image_urls: imageUrls,
      original_price: product.original_price || 0,
      min_participants: product.min_participants || 3,
      max_participants: product.max_participants || 3,
      duration_hours: product.duration_hours || 24,
      stock: product.stock || 100,
      currency: product.currency || 'TJS',
      status: product.status || 'ACTIVE',
      price_comparisons: product.price_comparisons || [],
    });
    setShowModal(true);
  };

  const handleDuplicate = (product: GroupBuyProduct) => {
    setEditingProduct(null);
    // 确保 image_urls 始终是数组，处理所有可能的格式
    let imageUrls: string[] = [];
    if (Array.isArray(product.image_urls)) {
      imageUrls = product.image_urls;
    } else if (typeof product.image_urls === 'string') {
      // 尝试解析 JSON 字符串
      try {
        const parsed = JSON.parse(product.image_urls);
        imageUrls = Array.isArray(parsed) ? parsed : [product.image_urls];
      } catch {
        imageUrls = [product.image_urls];
      }
    } else if (product.image_url) {
      imageUrls = [product.image_url];
    }
    
    setFormData({
      name_zh: (product.name_i18n?.zh || product.name || '') + ' (复制)',
      name_ru: (product.name_i18n?.ru || '') + ' (копия)',
      name_tg: (product.name_i18n?.tg || '') + ' (нусха)',
      description_zh: product.description_i18n?.zh || product.description || '',
      description_ru: product.description_i18n?.ru || '',
      description_tg: product.description_i18n?.tg || '',
      image_url: product.image_url || '',
      image_urls: imageUrls,
      original_price: product.original_price || 0,
      min_participants: product.min_participants || 3,
      max_participants: product.max_participants || 3,
      duration_hours: product.duration_hours || 24,
      stock: product.stock || 100,
      currency: product.currency || 'TJS',
      status: 'INACTIVE',
      price_comparisons: product.price_comparisons || [],
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个商品吗？删除后无法恢复。')) {return;}

    try {
      // 检查是否有进行中的拼团会话
      const { data: activeSessions } = await supabase
        .from('group_buy_sessions')
        .select('id')
        .eq('product_id', id)
        .eq('status', 'ACTIVE');

      if (activeSessions && Array.isArray(activeSessions) && activeSessions.length > 0) {
        toast.error('该商品有进行中的拼团会话，无法删除。请先等待会话结束或手动关闭。');
        return;
      }

      // 检查是否有拼团订单
      const { data: orders, error: ordersError } = await supabase
        .from('group_buy_orders')
        .select('id')
        .eq('product_id', id)
        .limit(1);

      if (ordersError) {
        console.error('Error checking orders:', ordersError);
      }

      if (orders && orders.length > 0) {
        toast.error('该商品已有用户下单，无法删除。如需删除，请联系技术人员处理关联数据。');
        return;
      }

      // 检查是否有拼团会话（包括已结束的）
      const { data: allSessions, error: sessionsError } = await supabase
        .from('group_buy_sessions')
        .select('id')
        .eq('product_id', id)
        .limit(1);

      if (sessionsError) {
        console.error('Error checking sessions:', sessionsError);
      }

      if (allSessions && allSessions.length > 0) {
        toast.error('该商品已有拼团会话记录，无法删除。如需删除，请联系技术人员处理关联数据。');
        return;
      }

      // 如果没有任何关联数据，执行删除
      const { error } = await supabase
        .from('group_buy_products')
        .delete()
        .eq('id', id);

      if (error) {
        // 如果仍然有外键约束错误，提供详细信息
        if (error.code === '23503') {
          toast.error(`删除失败：该商品仍有关联数据。请联系技术人员处理。`);
        } else {
          throw error;
        }
        return;
      }
      
      toast.success('商品删除成功');
      fetchProducts();
    } catch (error) {
      console.error('Failed to delete product:', error);
      toast.error(`删除商品失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const toggleStatus = async (product: GroupBuyProduct) => {
    try {
      const newStatus = product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const { error } = await supabase
        .from('group_buy_products')
        .update({ status: newStatus })
        .eq('id', product.id);

      if (error) {throw error;}
      fetchProducts();
    } catch (error) {
      console.error('Failed to toggle status:', error);
      toast.error('状态切换失败');
    }
  };

  const resetForm = () => {
    setFormData({
      name_zh: '',
      name_ru: '',
      name_tg: '',
      description_zh: '',
      description_ru: '',
      description_tg: '',
      image_url: '',
      image_urls: [],
      original_price: 0,
      min_participants: 3,
      max_participants: 3,
      duration_hours: 24,
      stock: 100,
      currency: 'TJS',
      status: 'ACTIVE',
      price_comparisons: [],
    });
    setNewPlatform('');
    setNewPrice('');
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">拼团商品管理</h1>
        <button
          onClick={() => {
            setEditingProduct(null);
            resetForm();
            setShowModal(true);
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center gap-2"
        >
          <Plus size={20} />
          新增商品
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">加载中...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  商品信息
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  价格
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  拼团设置
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  库存
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(products || []).map((product) => (
                <tr key={product.id}>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-10 w-10 rounded object-cover flex-shrink-0"
                      />
                      <div className="ml-4 min-w-0 max-w-md">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {product.name_i18n?.zh || product.name}
                        </div>
                        <div className="text-sm text-gray-500 line-clamp-2">
                          {product.description_i18n?.zh || product.description}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      原价: {product.original_price} TJS
                    </div>
                    <div className="text-sm text-gray-500">
                      拼团价: {product.group_price} TJS
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {product.min_participants}-{product.max_participants}人
                    </div>
                    <div className="text-sm text-gray-500">
                      {product.duration_hours}小时
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {product.stock}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => toggleStatus(product)}
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        product.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {product.status === 'ACTIVE' ? (
                        <Eye size={14} className="mr-1" />
                      ) : (
                        <EyeOff size={14} className="mr-1" />
                      )}
                      {product.status === 'ACTIVE' ? '上架' : '下架'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleEdit(product)}
                      className="text-indigo-600 hover:text-indigo-900 mr-3"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDuplicate(product)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal for Add/Edit Product */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">
                {editingProduct ? '编辑商品' : '新增商品'}
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingProduct(null);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-500"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* SKU选择器按钮 */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowSkuSelector(!showSkuSelector)}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                  {showSkuSelector ? '隐藏库存商品' : '从库存商品导入'}
                </button>
              </div>

              {/* SKU选择器 */}
              {showSkuSelector && (
                <div className="border rounded p-4 max-h-60 overflow-y-auto">
                  <h4 className="font-medium mb-2">选择库存商品</h4>
                  <div className="space-y-2">
                    {(inventoryProducts || []).map((product) => (
                      <div
                        key={product.id}
                        onClick={() => handleSelectSku(product)}
                        className="flex items-center p-2 hover:bg-gray-100 cursor-pointer rounded"
                      >
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="h-10 w-10 rounded object-cover"
                        />
                        <div className="ml-3">
                          <div className="text-sm font-medium">
                            {product.name_i18n?.zh || product.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            库存: {product.stock} | 价格: {product.original_price} TJS
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 商品名称（多语言） */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  商品名称 *
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="中文"
                    value={formData.name_zh}
                    onChange={(e) =>
                      setFormData({ ...formData, name_zh: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Русский"
                    value={formData.name_ru}
                    onChange={(e) =>
                      setFormData({ ...formData, name_ru: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                  />
                  <input
                    type="text"
                    placeholder="Тоҷикӣ"
                    value={formData.name_tg}
                    onChange={(e) =>
                      setFormData({ ...formData, name_tg: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
              </div>

              {/* 商品描述（多语言） */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  商品描述 *
                </label>
                <div className="space-y-2">
                  <textarea
                    placeholder="中文"
                    value={formData.description_zh}
                    onChange={(e) =>
                      setFormData({ ...formData, description_zh: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                    rows={3}
                    required
                  />
                  <textarea
                    placeholder="Русский"
                    value={formData.description_ru}
                    onChange={(e) =>
                      setFormData({ ...formData, description_ru: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                    rows={3}
                  />
                  <textarea
                    placeholder="Тоҷикӣ"
                    value={formData.description_tg}
                    onChange={(e) =>
                      setFormData({ ...formData, description_tg: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                    rows={3}
                  />
                </div>
              </div>

              {/* 图片上传 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  商品图片 *
                </label>
                <MultiImageUpload
                  label="商品图片"
                  bucket="products"
                  folder="group-buy"
                  imageUrls={formData.image_urls || []}
                  onImageUrlsChange={(urls) => {
                    setFormData({
                      ...formData,
                      image_urls: urls,
                      image_url: urls[0] || '',
                    });
                  }}
                  maxImages={10}
                />
              </div>

              {/* 价格和拼团设置 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    原价 (TJS) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.original_price}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        original_price: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    最少参与人数 *
                  </label>
                  <input
                    type="number"
                    min="2"
                    value={formData.min_participants}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        min_participants: parseInt(e.target.value) || 3,
                      })
                    }
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    最多参与人数 *
                  </label>
                  <input
                    type="number"
                    min="2"
                    value={formData.max_participants}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        max_participants: parseInt(e.target.value) || 10,
                      })
                    }
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    拼团时长 (小时) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.duration_hours}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        duration_hours: parseInt(e.target.value) || 24,
                      })
                    }
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    库存 *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        stock: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    货币
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) =>
                      setFormData({ ...formData, currency: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="TJS">TJS (索莫尼)</option>
                    <option value="USD">USD (美元)</option>
                    <option value="RUB">RUB (卢布)</option>
                  </select>
                </div>
              </div>

              {/* 价格对比 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  价格对比
                </label>
                <div className="space-y-2">
                  {(formData.price_comparisons || []).map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-sm">{item.platform}</span>
                      <span className="text-sm">{item.price} TJS</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePriceComparison(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="平台名称"
                      value={newPlatform}
                      onChange={(e) => setNewPlatform(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="价格"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      className="w-32 px-3 py-2 border rounded"
                    />
                    <button
                      type="button"
                      onClick={handleAddPriceComparison}
                      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                    >
                      添加
                    </button>
                  </div>
                </div>
              </div>

              {/* 状态 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  状态
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as 'ACTIVE' | 'INACTIVE',
                    })
                  }
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="ACTIVE">上架</option>
                  <option value="INACTIVE">下架</option>
                </select>
              </div>

              {/* 提交按钮 */}
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingProduct(null);
                    resetForm();
                  }}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  {editingProduct ? '更新' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
