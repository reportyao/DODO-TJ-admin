/**
 * 全局 Supabase 客户端（供非 React 组件使用，如 Service 层、工具函数）
 *
 * 此文件使用模块级单例，与 SupabaseContext 共享同一个 storageKey，
 * 避免 "Multiple GoTrueClient instances" 警告。
 * React 组件应优先通过 useSupabase() hook 获取客户端。
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || ''
const supabaseServiceRoleKey = (import.meta as any).env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || ''

// 模块级单例：确保整个应用只有一个 GoTrueClient 实例
let _instance: SupabaseClient | null = null

function getInstance(): SupabaseClient {
  if (!_instance) {
    _instance = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
        // 与 SupabaseContext 使用相同的 storageKey，避免多实例冲突
        storageKey: 'admin-supabase-auth'
      }
    })
  }
  return _instance
}

export const supabase = getInstance()
