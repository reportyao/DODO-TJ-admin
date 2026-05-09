import imageCompression from 'browser-image-compression'
import { adminUploadImage } from '@/lib/adminApi'

// 安全修复: 图片上传改为通过 Edge Function，不再在前端使用 Service Role Key
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || ''
const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || ''

/**
 * 图片上传工具模块（管理后台版）
 * 
 * 【性能优化 v2】
 * - 压缩格式从 JPEG 改为 WebP（更小的文件体积，更好的质量）
 * - 缓存时间从 1小时 改为 1年（URL含时间戳hash，天然支持缓存破坏）
 * - 多图上传使用 Promise.all 并发处理
 * 
 * 【v3 新增】
 * - 支持 outputFormat 参数，可指定压缩输出格式（默认 WebP）
 * - AI 商品上架场景需要 JPEG 格式（阿里云 SegmentCommodity 不支持 WebP）
 * 
 * 【v4 极限压缩优化】
 * - 默认压缩参数更激进：maxSizeMB 0.3, maxWidthOrHeight 1200, quality 0.72
 * - 批量上传统一使用 WebP 格式（比 JPEG 小 25-35%）
 * - 新增 downloadAndUploadImage：URL 模式图片通过 Edge Function 下载压缩后上传
 * - 所有路径（File/URL）均确保经过极限压缩，最大化降低存储成本
 */

/**
 * 压缩图片（极限压缩版）
 * @param file 原始图片文件
 * @param outputFormat 输出格式 MIME 类型，默认 'image/webp'
 * @returns 压缩后的图片文件
 */
async function compressImage(
  file: File,
  outputFormat: string = 'image/webp'
): Promise<File> {
  const options = {
    maxSizeMB: 0.3,            // 最大文件大小 300KB（极限压缩）
    maxWidthOrHeight: 1200,    // 最大宽度或高度 1200px（电商场景足够）
    useWebWorker: true,
    fileType: outputFormat as any,  // 使用传入的格式（默认 WebP）
    initialQuality: 0.72,      // 初始压缩质量 72%（视觉质量依然优秀，体积大幅减小）
  }
  
  try {
    const compressedFile = await imageCompression(file, options)
    const ratio = ((1 - compressedFile.size / file.size) * 100).toFixed(1)
    console.log(`[uploadImage] 压缩完成: ${(file.size / 1024).toFixed(0)}KB → ${(compressedFile.size / 1024).toFixed(0)}KB (压缩率: ${ratio}%, 格式: ${outputFormat})`)
    return compressedFile
  } catch (error) {
    console.warn('[uploadImage] 压缩失败，使用原图:', error)
    return file
  }
}

/**
 * 上传图片到Supabase Storage（带极限压缩）
 * @param file 图片文件
 * @param bucket 存储桶名称
 * @param folder 文件夹路径 (可选)
 * @param outputFormat 压缩输出格式 (可选，默认 'image/webp')
 * @returns 图片的公开URL
 */
export async function uploadImage(
  file: File,
  bucket: string = 'payment-proofs',
  folder?: string,
  outputFormat?: string
): Promise<string> {
  try {
    // 压缩图片（默认转为 WebP，可通过 outputFormat 指定其他格式）
    const compressedFile = await compressImage(file, outputFormat || 'image/webp')

    // 安全修复: 通过 Edge Function 上传，服务端使用 service_role 权限
    const publicUrl = await adminUploadImage(supabaseUrl, compressedFile, bucket, folder)
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
 * @param outputFormat 压缩输出格式 (可选，默认 'image/webp')
 * @returns 图片URL数组（顺序与输入一致）
 */
export async function uploadImages(
  files: File[],
  bucket: string = 'payment-proofs',
  folder?: string,
  outputFormat?: string
): Promise<string[]> {
  const uploadPromises = files.map(file => uploadImage(file, bucket, folder, outputFormat))
  return Promise.all(uploadPromises)
}

/**
 * 通过 Edge Function 下载外部 URL 图片并压缩后上传到 Supabase Storage
 * 
 * 【v4 新增】用于批量上传 URL 模式，确保外部图片也经过极限压缩
 * 
 * @param imageUrl 外部图片 URL
 * @param bucket 存储桶名称
 * @param folder 文件夹路径
 * @returns 压缩后上传到 Storage 的公开 URL
 */
export async function downloadAndUploadImage(
  imageUrl: string,
  bucket: string = 'inventory-products',
  folder: string = 'batch-upload'
): Promise<string> {
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/download-and-upload-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({
          imageUrl,
          bucket,
          folder,
          compress: true,
        }),
      }
    )

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error || '下载并上传图片失败')
    }

    console.log(`[downloadAndUploadImage] 完成: ${imageUrl} → ${result.publicUrl} (原始: ${(result.originalSize / 1024).toFixed(0)}KB, 压缩后: ${(result.compressedSize / 1024).toFixed(0)}KB)`)
    return result.publicUrl
  } catch (error: any) {
    console.error('[downloadAndUploadImage] 失败:', error)
    throw new Error(`下载并上传图片失败: ${error.message}`)
  }
}

/**
 * 批量下载并上传外部 URL 图片（逐个处理，避免 Edge Function 并发限制）
 * 
 * @param imageUrls 外部图片 URL 数组
 * @param bucket 存储桶名称
 * @param folder 文件夹路径
 * @returns 压缩后上传到 Storage 的公开 URL 数组
 */
export async function downloadAndUploadImages(
  imageUrls: string[],
  bucket: string = 'inventory-products',
  folder: string = 'batch-upload'
): Promise<string[]> {
  const results: string[] = []
  for (const url of imageUrls) {
    const publicUrl = await downloadAndUploadImage(url, bucket, folder)
    results.push(publicUrl)
  }
  return results
}

/**
 * 删除图片
 * @param url 图片URL
 * @param bucket 存储桶名称
 */
export async function deleteImage(_url: string, _bucket: string = 'payment-proofs'): Promise<void> {
  // 安全修复: 图片删除操作应通过服务端处理
  // 当前版本中图片删除不影响业务流程，后续可通过 Edge Function 实现
  console.warn('[deleteImage] 图片删除已暂时禁用，待服务端实现')
}
