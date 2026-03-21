import { createClient } from '@supabase/supabase-js'
import imageCompression from 'browser-image-compression'

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || ''
const supabaseServiceKey = (import.meta as any).env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''
// 使用与 SupabaseContext 相同的 storageKey，避免 Multiple GoTrueClient 警告
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false, storageKey: 'admin-supabase-auth' }
})

/**
 * 压缩图片
 * @param file 原始图片文件
 * @returns 压缩后的图片文件
 */
async function compressImage(file: File): Promise<File> {
  const options = {
    maxSizeMB: 1, // 最大文件大小1MB
    maxWidthOrHeight: 1920, // 最大宽度或高度
    useWebWorker: true,
    fileType: 'image/jpeg' as const, // 统一转换为JPEG格式以获得更好的压缩率
  }
  
  try {
    const compressedFile = await imageCompression(file, options)
    console.log(`图片压缩: ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`)
    return compressedFile
  } catch (error) {
    console.warn('图片压缩失败，使用原图:', error)
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
    // 压缩图片
    const compressedFile = await compressImage(file)
    
    // 生成唯一文件名 (统一使用.jpg扩展名)
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`
    const filePath = folder ? `${folder}/${fileName}` : fileName

    // 上传文件
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, compressedFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'image/jpeg'
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
    console.error('图片上传失败:', error)
    throw new Error('图片上传失败')
  }
}

/**
 * 上传多张图片
 * @param files 图片文件数组
 * @param bucket 存储桶名称
 * @param folder 文件夹路径 (可选)
 * @returns 图片URL数组
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
    const filePath = urlParts.slice(urlParts.indexOf(bucket) + 1).join('/')

    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath])

    if (error) {
      throw error
    }
  } catch (error) {
    console.error('图片删除失败:', error)
    throw new Error('图片删除失败')
  }
}
