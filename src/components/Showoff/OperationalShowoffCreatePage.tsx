import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { MultiImageUpload } from '../MultiImageUpload';
import { SingleImageUpload } from '../SingleImageUpload';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Sparkles, User, Image, Gift, ThumbsUp, Calendar } from 'lucide-react';

interface InventoryProduct {
  id: string;
  name: string;
  name_i18n: any;
  image_url: string | null;
  status: string;
}

export const OperationalShowoffCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();

  // ========== 表单状态 ==========
  const [displayUsername, setDisplayUsername] = useState('');
  const [displayAvatarUrl, setDisplayAvatarUrl] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [lotteryId, setLotteryId] = useState('');
  const [title, setTitle] = useState('');
  const [rewardCoins, setRewardCoins] = useState<number>(0);
  const [likesCount, setLikesCount] = useState<number | ''>('');

  const [createdAt, setCreatedAt] = useState('');

  // ========== 商品列表状态 ==========
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  // ========== 提交状态 ==========
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ========== 加载商品列表 ==========
  const fetchProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const { data, error } = await supabase
        .from('inventory_products')
        .select('id, name, name_i18n, image_url, status')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      console.error('加载商品列表失败:', error);
      toast.error('加载商品列表失败');
    } finally {
      setIsLoadingProducts(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // ========== 过滤商品列表 ==========
  const filteredProducts = products.filter(product => {
    if (!productSearchTerm) return true;
    const searchLower = productSearchTerm.toLowerCase();
    return (product.name || '').toLowerCase().includes(searchLower);
  });

  // ========== 获取选中商品的信息 ==========
  const selectedProduct = products.find(p => p.id === lotteryId);

  // ========== 提交表单 ==========
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 表单验证
    if (!displayUsername.trim()) {
      toast.error('请输入虚拟用户昵称');
      return;
    }
    if (!displayAvatarUrl.trim()) {
      toast.error('请上传虚拟用户头像');
      return;
    }
    if (!content.trim()) {
      toast.error('请输入晒单文案');
      return;
    }
    if (images.length === 0) {
      toast.error('请至少上传一张晒单图片');
      return;
    }

      if (!admin) {
      toast.error('管理员未登录');
      return;
    }
    // 验证 likesCount 不能为负数
    if (likesCount !== '' && (likesCount as number) < 0) {
      toast.error('点赞数不能为负数');
      return;
    }
    setIsSubmitting(true);
    try {
      // 使用 supabase.functions.invoke 避免在请求头中暴露 service_role key
      const { data: result, error: fnError } = await supabase.functions.invoke('admin-create-showoff', {
        body: {
          display_username: displayUsername.trim(),
          display_avatar_url: displayAvatarUrl.trim(),
          content: content.trim(),
          images: images,
          lottery_id: lotteryId || null,
          title: title.trim() || null,
          reward_coins: rewardCoins || 0,
          likes_count: likesCount !== '' ? likesCount : null,
          created_at: createdAt || null,
          admin_id: admin.id,
        },
      });
      if (fnError) {throw fnError;}
      if (!result?.success) {
        throw new Error(result?.error || '创建失败');
      }
      toast.success('运营晴单创建成功！');
      
      // 重置表单
      setDisplayUsername('');
      setDisplayAvatarUrl('');
      setContent('');
      setImages([]);
      setLotteryId('');
      setTitle('');
      setRewardCoins(0);
      setLikesCount('');

      setCreatedAt('');

      // 可选: 跳转到晒单列表
      // navigate('/showoff-review');

    } catch (error: any) {
      console.error('创建运营晒单失败:', error);
      toast.error(`创建失败: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回</span>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">创建运营晒单</h1>
          <p className="text-sm text-gray-500 mt-1">
            创建虚拟晒单内容，用于营造社区活跃氛围
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 虚拟用户信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="w-5 h-5 text-blue-600" />
              <span>虚拟用户信息</span>
            </CardTitle>
            <CardDescription>
              设置晒单发布者的虚拟身份信息
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="displayUsername">
                  用户昵称 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="displayUsername"
                  placeholder="例如: 幸运的Манус"
                  value={displayUsername}
                  onChange={(e) => setDisplayUsername(e.target.value)}
                  maxLength={50}
                />
                <p className="text-xs text-gray-500">
                  建议使用当地常见的名字或昵称
                </p>
              </div>
              <div className="space-y-2">
                <Label>
                  用户头像 <span className="text-red-500">*</span>
                </Label>
                <SingleImageUpload
                  label=""
                  bucket="avatars"
                  folder="operational"
                  imageUrl={displayAvatarUrl}
                  onImageUrlChange={setDisplayAvatarUrl}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 关联商品 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Gift className="w-5 h-5 text-orange-600" />
              <span>关联商品</span>
            </CardTitle>
            <CardDescription>
              选择晒单关联的商品，将显示"获得xx商品"
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="productSearch">搜索商品</Label>
              <Input
                id="productSearch"
                placeholder="输入商品名称搜索..."
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
              />
            </div>
            
            {isLoadingProducts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-64 overflow-y-auto">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => setLotteryId(product.id === lotteryId ? '' : product.id)}
                    className={`p-3 border rounded-lg cursor-pointer transition-all ${
                      product.id === lotteryId
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {product.image_url && (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-20 object-cover rounded mb-2"
                      />
                    )}
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {product.name}
                    </p>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      product.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {product.status === 'ACTIVE' ? '在售' : product.status === 'INACTIVE' ? '下架' : product.status === 'SOLD_OUT' ? '已售罄' : product.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {selectedProduct && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  已选择: <strong>{selectedProduct.name}</strong>
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">自定义标题 (可选)</Label>
              <Input
                id="title"
                placeholder="留空则使用商品标题"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
              <p className="text-xs text-gray-500">
                如果填写，将覆盖商品标题显示
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 晒单内容 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Image className="w-5 h-5 text-purple-600" />
              <span>晒单内容</span>
            </CardTitle>
            <CardDescription>
              编辑晒单的文案和图片
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="content">
                晒单文案 <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="content"
                placeholder="例如: 太开心了！第一次参与就中奖了，商品质量很好，推荐大家参与！"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                maxLength={500}
              />
              <p className="text-xs text-gray-500 text-right">
                {content.length}/500
              </p>
            </div>

            <MultiImageUpload
              label="晒单图片 *"
              bucket="lottery-images"
              folder="operational-showoff"
              maxImages={9}
              imageUrls={images}
              onImageUrlsChange={setImages}
            />
          </CardContent>
        </Card>

        {/* 运营数据 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-amber-600" />
              <span>运营数据</span>
            </CardTitle>
            <CardDescription>
              设置初始的互动数据和奖励信息
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rewardCoins" className="flex items-center space-x-1">
                  <Gift className="w-4 h-4 text-amber-500" />
                  <span>积分奖励</span>
                </Label>
                <Input
                  id="rewardCoins"
                  type="number"
                  min="0"
                  max="1000"
                  placeholder="0"
                  value={rewardCoins}
                  onChange={(e) => setRewardCoins(parseInt(e.target.value) || 0)}
                />
                <p className="text-xs text-gray-500">
                  显示"获得xx积分"
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="likesCount" className="flex items-center space-x-1">
                  <ThumbsUp className="w-4 h-4 text-red-500" />
                  <span>初始点赞数</span>
                </Label>
                <Input
                  id="likesCount"
                  type="number"
                  min="0"
                  max="9999"
                  placeholder="随机生成"
                  value={likesCount}
                  onChange={(e) => setLikesCount(e.target.value ? parseInt(e.target.value) : '')}
                />
                <p className="text-xs text-gray-500">
                  留空则随机 20-100
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="createdAt" className="flex items-center space-x-1">
                  <Calendar className="w-4 h-4 text-green-500" />
                  <span>发布时间</span>
                </Label>
                <Input
                  id="createdAt"
                  type="datetime-local"
                  value={createdAt}
                  onChange={(e) => setCreatedAt(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  留空则使用当前时间
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 提交按钮 */}
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            disabled={isSubmitting}
          >
            取消
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                创建中...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                立即发布
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};
