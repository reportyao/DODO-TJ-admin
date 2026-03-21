import React, { useState } from 'react';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Upload, X, Loader2, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadImage } from '@/lib/uploadImage';

interface MultiImageUploadProps {
  label: string;
  bucket: string;
  folder: string;
  maxImages: number;
  imageUrls: string[];
  onImageUrlsChange: (urls: string[]) => void;
}

export const MultiImageUpload: React.FC<MultiImageUploadProps> = ({
  label,
  bucket,
  folder,
  maxImages,
  imageUrls,
  onImageUrlsChange,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);

  // 安全获取 imageUrls，确保始终是数组
  const safeImageUrls = Array.isArray(imageUrls) ? imageUrls : [];

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {return;}

    const newFiles = Array.from(files);
    const availableSlots = maxImages - safeImageUrls.length;

    if (newFiles.length > availableSlots) {
      toast.error(`最多只能上传 ${maxImages} 张图片，您还可以上传 ${availableSlots} 张。`);
      return;
    }

    setIsUploading(true);
    const uploadPromises = newFiles.map(file => uploadImage(file, bucket, folder));

    try {
      const newUrls = await Promise.all(uploadPromises);
      onImageUrlsChange([...safeImageUrls, ...newUrls]);
      toast.success('图片上传成功并已优化!');
    } catch (error: any) {
      toast.error(`图片上传失败: ${error.message}`);
      console.error('Image upload error:', error);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemove = (indexToRemove: number) => {
    const newUrls = safeImageUrls.filter((_, index) => index !== indexToRemove);
    onImageUrlsChange(newUrls);
  };

  const handleAddImageUrl = async () => {
    const url = imageUrlInput.trim();
    if (!url) {
      toast.error('请输入图片链接');
      return;
    }

    if (safeImageUrls.length >= maxImages) {
      toast.error(`最多只能上传 ${maxImages} 张图片`);
      return;
    }

    // 验证URL格式
    try {
      new URL(url);
    } catch (error) {
      toast.error('请输入有效的URL');
      return;
    }

    setIsDownloading(true);
    try {
      // 调用后端云函数下载并上传图片
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-and-upload-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            imageUrl: url,
            bucket: bucket,
            folder: folder,
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '下载图片失败');
      }

      onImageUrlsChange([...safeImageUrls, result.publicUrl]);
      setImageUrlInput('');
      toast.success('图片下载并上传成功!');
    } catch (error: any) {
      toast.error(`操作失败: ${error.message}`);
      console.error('Download and upload error:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleMoveLeft = (index: number) => {
    if (index === 0) {return;}
    const newUrls = [...safeImageUrls];
    [newUrls[index - 1], newUrls[index]] = [newUrls[index]!, newUrls[index - 1]!];
    onImageUrlsChange(newUrls);
  };

  const handleMoveRight = (index: number) => {
    if (index === safeImageUrls.length - 1) {return;}
    const newUrls = [...safeImageUrls];
    [newUrls[index], newUrls[index + 1]] = [newUrls[index + 1]!, newUrls[index]!];
    onImageUrlsChange(newUrls);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newUrls = [...safeImageUrls];
    const [draggedItem] = newUrls.splice(draggedIndex, 1);
    if (draggedItem) {
      newUrls.splice(dropIndex, 0, draggedItem);
    }
    onImageUrlsChange(newUrls);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      
      {safeImageUrls.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
          {safeImageUrls.map((url, index) => (
            <div
              key={`image-${index}-${url.slice(-20)}`}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                dragOverIndex === index ? 'border-blue-500 scale-105' : 'border-gray-300'
              } ${draggedIndex === index ? 'opacity-50' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              {/* Drag handle indicator */}
              <span className="absolute top-1 left-1 p-1 cursor-grab bg-black bg-opacity-50 rounded-full text-white hover:bg-opacity-70 transition-colors z-10">
                <GripVertical className="w-4 h-4" />
              </span>
              
              {/* Image */}
              <img src={url} alt={`Image ${index + 1}`} className="w-full h-full object-cover" />
              
              {/* Main image badge */}
              {index === 0 && (
                <span className="absolute bottom-1 left-1 px-2 py-0.5 bg-orange-500 text-white text-xs rounded z-10">
                  主图
                </span>
              )}
              
              {/* Remove button */}
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="absolute top-1 right-1 p-1 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>
              
              {/* Move buttons */}
              <div className="absolute bottom-1 right-1 flex gap-1 z-10">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => handleMoveLeft(index)}
                    className="p-1 bg-black bg-opacity-50 rounded text-white hover:bg-opacity-70 transition-colors"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                )}
                {index < safeImageUrls.length - 1 && (
                  <button
                    type="button"
                    onClick={() => handleMoveRight(index)}
                    className="p-1 bg-black bg-opacity-50 rounded text-white hover:bg-opacity-70 transition-colors"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {safeImageUrls.length < maxImages && (
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
                <span className="mt-1 text-sm">点击上传图片 (最多 {maxImages} 张)</span>
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
              onKeyPress={(e) => e.key === 'Enter' && handleAddImageUrl()}
              disabled={isDownloading}
              className="flex-1"
            />
            <button
              type="button"
              onClick={handleAddImageUrl}
              disabled={isDownloading || !imageUrlInput.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>下载中...</span>
                </>
              ) : (
                <span>添加</span>
              )}
            </button>
          </div>
        </>
      )}
      <p className="text-xs text-gray-500">
        图片将自动压缩并转换为 WebP 格式 (最大 1MB, 1920px)。拖动图片可排序，第一张为主图。
      </p>
    </div>
  );
};
