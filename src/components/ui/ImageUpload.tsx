import React, { useState, useRef } from 'react';
import { Button } from './button';
import toast from 'react-hot-toast';
import { adminUploadImage } from '@/lib/adminApi';

// 安全修复: 图片上传改为通过 Edge Function
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';

interface ImageUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  maxImages?: number;
  maxSizeMB?: number;
  bucket?: string; // 指定使用的Storage Bucket，默认为'lottery-images'
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  value = [],
  onChange,
  maxImages = 5,
  maxSizeMB = 5,
  bucket = 'lottery-images',
}) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * 压缩图片
   */
  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // 限制最大尺寸为800x800，优化手机展示
          const maxSize = 800;
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height / width) * maxSize;
              width = maxSize;
            } else {
              width = (width / height) * maxSize;
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, width, height);

          // 【性能优化】优先使用 WebP 格式（比 JPEG 小 25-35%）
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('压缩失败'));
              }
            },
            'image/webp',
            0.82
          );
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  /**
   * 生成唯一文件名
   */
  const generateFileName = (_originalName: string): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    // 【优化】统一使用 webp 扩展名
    return `lottery_${timestamp}_${random}.webp`;
  };

  /**
   * 上传图片到Supabase Storage（通过 Edge Function）
   */
  const uploadToStorage = async (blob: Blob, fileName: string): Promise<string> => {
    // 安全修复: 通过 Edge Function 上传，服务端使用 service_role 权限
    const file = new File([blob], fileName, { type: 'image/webp' });
    return await adminUploadImage(supabaseUrl, file, bucket);
  };

  /**
   * 处理文件选择
   */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {return;}

    if (value.length + files.length > maxImages) {
      toast.error(`最多只能上传${maxImages}张图片`);
      return;
    }

    setUploading(true);
    const newUrls: string[] = [];
    let successCount = 0;
    let failCount = 0;

    try {
      // 【性能优化】并发上传所有图片
      const uploadTasks = files.map(async (file) => {
        try {
          // 检查文件类型
          if (!file.type.startsWith('image/')) {
            toast.error(`${file.name} 不是图片文件`);
            failCount++;
            return;
          }

          // 检查文件大小
          const fileSizeMB = file.size / (1024 * 1024);
          if (fileSizeMB > maxSizeMB) {
            toast(`${file.name} (${fileSizeMB.toFixed(1)}MB) 正在压缩...`, {
              icon: '🔄',
              duration: 2000,
            });
          }

          // 压缩图片
          const compressedBlob = await compressImage(file);
          const compressedSizeMB = compressedBlob.size / (1024 * 1024);
          
          // 生成文件名
          const fileName = generateFileName(file.name);
          
          // 上传到Supabase Storage
          const publicUrl = await uploadToStorage(compressedBlob, fileName);
          
          newUrls.push(publicUrl);
          successCount++;

        } catch (error: any) {
          console.error(`❌ ${file.name} 上传失败:`, error);
          toast.error(`${file.name} 上传失败: ${error.message}`);
          failCount++;
        }
      });

      await Promise.all(uploadTasks);

      if (successCount > 0) {
        onChange([...value, ...newUrls]);
        toast.success(`成功上传${successCount}张图片`);
      }

      if (failCount > 0) {
        toast.error(`${failCount}张图片上传失败`);
      }
    } catch (error: any) {
      toast.error(`上传失败: ${error.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  /**
   * 删除图片（从列表中移除）
   */
  const handleRemove = async (index: number, _url: string) => {
    // 安全修复: Storage 删除操作应通过服务端处理，当前仅从列表中移除
    const newUrls = value.filter((_, i) => i !== index);
    onChange(newUrls);
    toast.success('图片已移除');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || value.length >= maxImages}
        >
          {uploading ? '上传中...' : '选择图片'}
        </Button>
        <span className="text-sm text-gray-500">
          {value.length}/{maxImages} 张
        </span>
        {uploading && (
          <span className="text-sm text-blue-600 animate-pulse">
            正在上传到云存储...
          </span>
        )}
      </div>

      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {value.map((url, index) => (
            <div key={index} className="relative group">
              <img
                src={url}
                alt={`上传图片 ${index + 1}`}
                className="w-full h-32 object-cover rounded border"
                onError={(e) => {
                  // 图片加载失败时显示占位符
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3E加载失败%3C/text%3E%3C/svg%3E';
                }}
              />
              <button
                type="button"
                onClick={() => handleRemove(index, url)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                title="删除图片"
              >
                ×
              </button>
              <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                云存储
              </div>
            </div>
          ))}
        </div>
      )}

      {value.length === 0 && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
            aria-hidden="true"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-500">点击上方按钮选择图片</p>
          <p className="mt-1 text-xs text-gray-400">支持 JPG、PNG、WebP、GIF 格式</p>
        </div>
      )}
    </div>
  );
};
