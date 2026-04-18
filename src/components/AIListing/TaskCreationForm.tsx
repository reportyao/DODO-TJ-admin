/**
 * TaskCreationForm — AI 商品上架任务创建表单
 *
 * 功能：
 *   1. 图片上传区域（复用 MultiImageUpload 的交互模式，JPEG 输出）
 *   2. 基础信息表单（品类、名称、规格、售价、库存、备注）
 *   3. 提交校验 + 回调
 *
 * UI 风格：与现有管理后台一致（Card 容器 + TailwindCSS）
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, X, Loader2, GripVertical, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadImage } from '@/lib/uploadImage';
import { useSupabase } from '@/contexts/SupabaseContext';
import { adminQuery } from '@/lib/adminApi';
import type { AITask } from '@/types/aiListing';
import type { I18nText } from '@/types/homepage';

// 动态分类项类型（来自 homepage_categories 表）
interface HomepageCategoryItem {
  id: string;
  code: string;
  name_i18n: I18nText;
}

interface TaskCreationFormProps {
  onSubmit: (task: AITask) => void;
  disabled?: boolean;  // 当队列满时禁用提交
}

export const TaskCreationForm: React.FC<TaskCreationFormProps> = ({
  onSubmit,
  disabled = false,
}) => {
  const { supabase } = useSupabase();

  // [v2.1] 动态分类数据（来自 homepage_categories 表）
  const [categories, setCategories] = useState<HomepageCategoryItem[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await adminQuery<HomepageCategoryItem>(supabase, 'homepage_categories', {
          select: 'id, code, name_i18n',
          filters: [{ col: 'is_active', op: 'eq', val: true }],
          orderBy: 'sort_order',
          orderAsc: true,
        });
        setCategories(data || []);
      } catch (error) {
        console.error('Failed to fetch homepage categories:', error);
        toast.error('获取分类列表失败');
      } finally {
        setCategoriesLoading(false);
      }
    };
    fetchCategories();
  }, [supabase]);

  // 图片状态
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 表单状态
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [productName, setProductName] = useState('');
  const [specs, setSpecs] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [notes, setNotes] = useState('');

  const MAX_IMAGES = 5;

  // ─── 图片上传（JPEG 格式，兼容阿里云 API）─────────────────────────────
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files);
    const availableSlots = MAX_IMAGES - imageUrls.length;

    if (newFiles.length > availableSlots) {
      toast.error(`最多只能上传 ${MAX_IMAGES} 张图片，您还可以上传 ${availableSlots} 张。`);
      return;
    }

    setIsUploading(true);
    try {
      // AI 场景使用 JPEG 格式（阿里云 SegmentCommodity 不支持 WebP）
      const uploadPromises = newFiles.map(file =>
        uploadImage(file, 'product-images', 'ai-listing', 'image/jpeg')
      );
      const newUrls = await Promise.all(uploadPromises);
      setImageUrls(prev => [...prev, ...newUrls]);
      toast.success('图片上传成功!');
    } catch (error: any) {
      toast.error(`图片上传失败: ${error.message}`);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  }, [imageUrls.length]);

  // ─── URL 拉取图片 ──────────────────────────────────────────────────
  const handleAddImageUrl = useCallback(async () => {
    const url = imageUrlInput.trim();
    if (!url) {
      toast.error('请输入图片链接');
      return;
    }
    if (imageUrls.length >= MAX_IMAGES) {
      toast.error(`最多只能上传 ${MAX_IMAGES} 张图片`);
      return;
    }
    try {
      new URL(url);
    } catch {
      toast.error('请输入有效的URL');
      return;
    }

    setIsDownloading(true);
    try {
      const response = await fetch(
        `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/download-and-upload-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(import.meta as any).env.VITE_SUPABASE_ANON_KEY}`,
            'apikey': (import.meta as any).env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            imageUrl: url,
            bucket: 'product-images',
            folder: 'ai-listing',
          }),
        }
      );
      const result = await response.json();
      if (!result.success) throw new Error(result.error || '下载图片失败');

      setImageUrls(prev => [...prev, result.publicUrl]);
      setImageUrlInput('');
      toast.success('图片下载并上传成功!');
    } catch (error: any) {
      toast.error(`操作失败: ${error.message}`);
    } finally {
      setIsDownloading(false);
    }
  }, [imageUrlInput, imageUrls.length]);

  // ─── 图片排序 ──────────────────────────────────────────────────────
  const handleRemove = (index: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleMoveLeft = (index: number) => {
    if (index === 0) return;
    setImageUrls(prev => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index]!, arr[index - 1]!];
      return arr;
    });
  };

  const handleMoveRight = (index: number) => {
    setImageUrls(prev => {
      if (index >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[index], arr[index + 1]] = [arr[index + 1]!, arr[index]!];
      return arr;
    });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    setImageUrls(prev => {
      const arr = [...prev];
      const [dragged] = arr.splice(draggedIndex, 1);
      if (dragged) arr.splice(dropIndex, 0, dragged);
      return arr;
    });
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // ─── 提交 ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    // 校验必填项
    if (imageUrls.length === 0) {
      toast.error('请至少上传 1 张商品图片');
      return;
    }
    const finalCategory = category === '__other__' ? customCategory.trim() : category;
    if (!finalCategory) {
      toast.error('请选择或输入商品品类');
      return;
    }
    if (!productName.trim()) {
      toast.error('请输入商品名称');
      return;
    }
    const priceNum = parseFloat(price);
    if (!price || isNaN(priceNum) || priceNum <= 0) {
      toast.error('请输入有效的售价');
      return;
    }
    const stockNum = parseInt(stock, 10);
    if (!stock || isNaN(stockNum) || stockNum < 0) {
      toast.error('请输入有效的库存数量');
      return;
    }

    // 查找匹配的分类 ID（用于入库时创建 product_categories 关联）
    const matchedCategory = categories.find(
      (cat) => (cat.name_i18n?.zh || cat.code) === finalCategory
    );

    // 构造 AITask
    const task: AITask = {
      id: crypto.randomUUID(),
      status: 'queued',
      progress: 0,
      stage: '排队中...',
      imageUrls,
      category: finalCategory,
      categoryId: matchedCategory?.id,
      productName: productName.trim(),
      specs: specs.trim(),
      price: priceNum,
      stock: stockNum,
      notes: notes.trim(),
      savedToInventory: false,
      createdAt: new Date(),
    };

    onSubmit(task);

    // 重置表单（保留品类，方便连续添加同品类商品）
    setImageUrls([]);
    setProductName('');
    setSpecs('');
    setPrice('');
    setStock('');
    setNotes('');
    toast.success('任务已添加到队列');
  }, [imageUrls, category, customCategory, productName, specs, price, stock, notes, categories, onSubmit]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-600" />
          创建 AI 上架任务
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ─── 图片上传区域 ─────────────────────────────────────── */}
        <div className="space-y-2">
          <Label>商品图片 <span className="text-red-500">*</span></Label>

          {imageUrls.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {imageUrls.map((url, index) => (
                <div
                  key={`img-${index}-${url.slice(-20)}`}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    dragOverIndex === index ? 'border-blue-500 scale-105' : 'border-gray-300'
                  } ${draggedIndex === index ? 'opacity-50' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                >
                  <span className="absolute top-1 left-1 p-1 cursor-grab bg-black bg-opacity-50 rounded-full text-white z-10">
                    <GripVertical className="w-4 h-4" />
                  </span>
                  <img src={url} alt={`商品图 ${index + 1}`} className="w-full h-full object-cover" />
                  {index === 0 && (
                    <span className="absolute bottom-1 left-1 px-2 py-0.5 bg-orange-500 text-white text-xs rounded z-10">
                      主图
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    className="absolute top-1 right-1 p-1 bg-red-500 rounded-full text-white hover:bg-red-600 z-10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-1 right-1 flex gap-1 z-10">
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => handleMoveLeft(index)}
                        className="p-1 bg-black bg-opacity-50 rounded text-white hover:bg-opacity-70"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                    )}
                    {index < imageUrls.length - 1 && (
                      <button
                        type="button"
                        onClick={() => handleMoveRight(index)}
                        className="p-1 bg-black bg-opacity-50 rounded text-white hover:bg-opacity-70"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {imageUrls.length < MAX_IMAGES && (
            <>
              <label className="flex items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors bg-gray-50">
                {isUploading ? (
                  <div className="flex items-center space-x-2 text-blue-600">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>上传中...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-gray-500">
                    <Upload className="w-6 h-6" />
                    <span className="mt-1 text-sm">点击上传图片 (最多 {MAX_IMAGES} 张)</span>
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>

              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="或输入图片链接URL"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddImageUrl()}
                  disabled={isDownloading}
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={handleAddImageUrl}
                  disabled={isDownloading || !imageUrlInput.trim()}
                  className="flex items-center gap-2"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      下载中...
                    </>
                  ) : (
                    '添加'
                  )}
                </Button>
              </div>
            </>
          )}

          <p className="text-xs text-gray-500">
            图片将自动压缩为 JPEG 格式 (最大 500KB, 1800px, 质量 85%)。拖动图片可排序，第一张为主图（用于 AI 分析和抠图）。
          </p>
        </div>

        {/* ─── 基础信息表单 ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 品类（动态加载自首页场景化分类管理） */}
          <div className="space-y-2">
            <Label>品类 <span className="text-red-500">*</span></Label>
            <Select value={category} onValueChange={setCategory} disabled={categoriesLoading}>
              <SelectTrigger>
                <SelectValue placeholder={categoriesLoading ? '加载分类中...' : '选择品类'} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.name_i18n?.zh || cat.code}>
                    {cat.name_i18n?.zh || cat.code}
                  </SelectItem>
                ))}
                <SelectItem value="__other__">其他（手动输入）</SelectItem>
              </SelectContent>
            </Select>
            {category === '__other__' && (
              <Input
                placeholder="请输入品类名称"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
              />
            )}
          </div>

          {/* 商品名称 */}
          <div className="space-y-2">
            <Label>商品名称 <span className="text-red-500">*</span></Label>
            <Input
              placeholder="例如：男士加厚棉服"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
          </div>

          {/* 规格 */}
          <div className="space-y-2">
            <Label>规格</Label>
            <Input
              placeholder="例如：XL / 黑色 / 180g"
              value={specs}
              onChange={(e) => setSpecs(e.target.value)}
            />
          </div>

          {/* 售价 */}
          <div className="space-y-2">
            <Label>售价 (TJS) <span className="text-red-500">*</span></Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="例如：199.99"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          {/* 库存 */}
          <div className="space-y-2">
            <Label>库存 <span className="text-red-500">*</span></Label>
            <Input
              type="number"
              min="0"
              step="1"
              placeholder="例如：100"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </div>
        </div>

        {/* 补充备注 */}
        <div className="space-y-2">
          <Label>补充备注</Label>
          <Textarea
            placeholder="可选：补充商品特点、目标人群等信息，帮助 AI 生成更精准的文案"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {/* 提交按钮 */}
        <Button
          onClick={handleSubmit}
          disabled={disabled || isUploading || isDownloading}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          size="lg"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          添加到 AI 生成队列
        </Button>
      </CardContent>
    </Card>
  );
};
