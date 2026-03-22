import imageCompression from 'browser-image-compression'
import { supabase } from '@/lib/supabase'
// 复用 supabase.ts 中的单例客户端，避免 Multiple GoTrueClient 警告

/**
 * 图片上传工具模块（管理后台版）
 * 
 * 【性能优化 v2】
 * - 压缩格式从 JPEG 改为 WebP（更小的文件体积，更好的质量）
 * - 缓存时间从 1小时 改为 1年（URL含时间戳hash，天然支持缓存破坏）
 * - 多图上传使用 Promise.all 并发处理
 */

/**
 * 压缩图片
 * @param file 原始图片文件
 * @returns 压缩后的图片文件
 */
async function compressImage(file: File): Promise<File> {
  const options = {
    maxSizeMB: 1,              // 最大文件大小1MB
    maxWidthOrHeight: 1920,    // 最大宽度或高度
    useWebWorker: true,
    fileType: 'image/webp' as const,  // 【优化】改为 WebP 格式，比 JPEG 小 25-35%
  }
  
  try {
    const compressedFile = await imageCompression(file, options)
    console.log(
      `[uploadImage] 压缩: ${(file.size / 1024).toFixed(0)}KB -> ${(compressedFile.size / 1024).toFixed(0)}KB ` +
      `(${((1 - compressedFile.size / file.size) * 100).toFixed(0)}% 减少)`
    )
    return compressedFile
  } catch (error) {
    console.warn('[uploadImage] 压缩失败，使用原图:', error)
    return file
  }
}

/**
 * 上传图片到Supabase Storage
 * @param file 图片文件
 * @param bucket 存储桶名称
 * @param folder 文件夹路径 (可选)
 * @returns 图片的公开URL
 */
export async function uploadImage(
  file: File,
  bucket: string = 'payment-proofs',
  folder?: string
): Promise<string> {
  try {
    // 压缩图片（自动转为 WebP）
    const compressedFile = await compressImage(file)
    
    // 判断压缩后的实际格式
    const isWebP = compressedFile.type === 'image/webp'
    const ext = isWebP ? 'webp' : 'jpg'
    const contentType = isWebP ? 'image/webp' : 'image/jpeg'
    
    // 生成唯一文件名
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
    const filePath = folder ? `${folder}/${fileName}` : fileName

    // 上传文件
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, compressedFile, {
        // 【性能优化】设置1年缓存（URL含时间戳hash，天然支持缓存破坏）
        cacheControl: '31536000',
        upsert: false,
        contentType: contentType,
      })

    if (error) {
      throw error
    }

    // 获取公开URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath)

    return publicUrl
  } catch (error) {
    console.error('[uploadImage] 上传失败:', error)
    throw new Error('图片上传失败')
  }
}

/**
 * 上传多张图片（并发处理）
 * 
 * 【性能优化】使用 Promise.all 并发上传
 * 
 * @param files 图片文件数组
 * @param bucket 存储桶名称
 * @param folder 文件夹路径 (可选)
 * @returns 图片URL数组（顺序与输入一致）
 */
export async function uploadImages(
  files: File[],
  bucket: string = 'payment-proofs',
  folder?: string
): Promise<string[]> {
  const uploadPromises = files.map(file => uploadImage(file, bucket, folder))
  return Promise.all(uploadPromises)
}

/**
 * 删除图片
 * @param url 图片URL
 * @param bucket 存储桶名称
 */
export async function deleteImage(url: string, bucket: string = 'payment-proofs'): Promise<void> {
  try {
    // 从URL提取文件路径
    const urlParts = url.split('/')
    const bucketIndex = urlParts.indexOf(bucket)
    if (bucketIndex === -1) {
      throw new Error('Invalid URL: bucket not found')
    }
    const filePath = urlParts.slice(bucketIndex + 1).join('/')

    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath])

    if (error) {
      throw error
    }
  } catch (error) {
    console.error('[deleteImage] 删除失败:', error)
    throw new Error('图片删除失败')
  }
}
