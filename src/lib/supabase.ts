// 注意：此文件仅供非 React 组件（如 Service 层）使用
// React 组件应通过 useSupabase() hook 获取 Supabase 客户端
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || ''
const supabaseServiceRoleKey = (import.meta as any).env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || ''
// 使用与 SupabaseContext 相同的 storageKey，避免 Multiple GoTrueClient 警告
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
    storageKey: 'admin-supabase-auth'
  }
})
