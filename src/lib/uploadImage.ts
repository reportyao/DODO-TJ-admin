import imageCompression from 'browser-image-compression'
import { adminUploadImage } from '@/lib/adminApi'

// 安全修复: 图片上传改为通过 Edge Function，不再在前端使用 Service Role Key
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || ''

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
 */

/**
 * 压缩图片
 * @param file 原始图片文件
 * @param outputFormat 输出格式 MIME 类型，默认 'image/webp'
 * @returns 压缩后的图片文件
 */
async function compressImage(
  file: File,
  outputFormat: string = 'image/webp'
): Promise<File> {
  const options = {
    maxSizeMB: 1,              // 最大文件大小1MB
    maxWidthOrHeight: 1920,    // 最大宽度或高度
    useWebWorker: true,
    fileType: outputFormat as any,  // 使用传入的格式（默认 WebP，AI 场景传 'image/jpeg'）
  }
  
  try {
    const compressedFile = await imageCompression(file, options)
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
 * @param outputFormat 压缩输出格式 (可选，默认 'image/webp'，AI 场景传 'image/jpeg')
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
    const compressedFile = await compressImage(file, outputFormat)

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
 * @param outputFormat 压缩输出格式 (可选，默认 'image/webp'，AI 场景传 'image/jpeg')
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
 * 删除图片
 * @param url 图片URL
 * @param bucket 存储桶名称
 */
export async function deleteImage(_url: string, _bucket: string = 'payment-proofs'): Promise<void> {
  // 安全修复: 图片删除操作应通过服务端处理
  // 当前版本中图片删除不影响业务流程，后续可通过 Edge Function 实现
  console.warn('[deleteImage] 图片删除已暂时禁用，待服务端实现')
}
