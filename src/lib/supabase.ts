/**
 * 全局 Supabase 客户端（供非 React 组件使用，如 Service 层、工具函数）
 *
 * 安全修复: 仅使用 Anon Key，不再暴露 Service Role Key。
 * 所有需要提权的操作通过 Security Definer RPC 函数执行。
 * React 组件应优先通过 useSupabase() hook 获取客户端。
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseProxy } from './supabaseProxy'

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || ''

// 模块级单例：确保整个应用只有一个 GoTrueClient 实例
let _rawInstance: SupabaseClient | null = null
let _proxyInstance: SupabaseClient | null = null

function getRawInstance(): SupabaseClient {
  if (!_rawInstance) {
    _rawInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
        storageKey: 'admin-supabase-auth'
      }
    })
  }
  return _rawInstance
}

function getProxyInstance(): SupabaseClient {
  if (!_proxyInstance) {
    _proxyInstance = createSupabaseProxy(getRawInstance())
  }
  return _proxyInstance
}

// 导出代理客户端，所有 .from() 调用自动转发到 RPC
export const supabase = getProxyInstance()
