/**
 * 管理后台 API 层
 * 
 * 安全修复: 所有数据库操作通过 Security Definer RPC 函数执行，
 * 不再在前端使用 Service Role Key。
 * 
 * 管理员通过 session_token 认证，token 存储在 localStorage 中。
 * 
 * [v2 修复] 
 *   - p_filters / p_data 直接传 JS 对象，不再 JSON.stringify（Supabase JS 客户端自动序列化）
 *   - adminUploadImage 添加 Authorization header
 * 
 * [v3 新增]
 *   - adminSSEFetch: 带管理员认证的 SSE 流式请求方法（AI 商品上架等场景）
 */
import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Session Token 管理
// ============================================================
const SESSION_TOKEN_KEY = 'admin_session_token'

export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY)
}

export function setSessionToken(token: string): void {
  localStorage.setItem(SESSION_TOKEN_KEY, token)
}

export function clearSessionToken(): void {
  localStorage.removeItem(SESSION_TOKEN_KEY)
}

function requireSessionToken(): string {
  const token = getSessionToken()
  if (!token) {
    throw new Error('ADMIN_AUTH_REQUIRED: 请先登录')
  }
  return token
}

// ============================================================
// 管理员认证
// ============================================================

export async function adminLogin(
  supabase: SupabaseClient,
  username: string,
  passwordHash: string
): Promise<{ session_token: string; admin: any }> {
  const { data, error } = await supabase.rpc('admin_login', {
    p_username: username,
    p_password_hash: passwordHash,
  })
  if (error) {
    // 解析 RPC 错误消息
    const msg = error.message || '登录失败'
    if (msg.includes('LOGIN_LOCKED:')) {
      throw new Error(msg.split('LOGIN_LOCKED:')[1].trim())
    }
    if (msg.includes('LOGIN_FAILED:')) {
      throw new Error(msg.split('LOGIN_FAILED:')[1].trim())
    }
    throw new Error(msg)
  }
  const result = typeof data === 'string' ? JSON.parse(data) : data
  setSessionToken(result.session_token)
  return result
}

export async function adminLogout(supabase: SupabaseClient): Promise<void> {
  const token = getSessionToken()
  if (token) {
    try {
      await supabase.rpc('admin_logout', { p_session_token: token })
    } catch {
      // 登出失败不影响本地清理
    }
  }
  clearSessionToken()
  localStorage.removeItem('admin_user')
}

export async function adminGetPermissions(
  supabase: SupabaseClient
): Promise<{ role: string; permissions: string[] }> {
  const token = requireSessionToken()
  const { data, error } = await supabase.rpc('admin_get_permissions', {
    p_session_token: token,
  })
  if (error) throw new Error(error.message)
  const result = typeof data === 'string' ? JSON.parse(data) : data
  return result
}

// ============================================================
// 通用数据查询
// ============================================================

export interface QueryFilter {
  col: string
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is_null' | 'is_not_null' | 'in'
  val?: string
}

export async function adminQuery<T = any>(
  supabase: SupabaseClient,
  table: string,
  options: {
    select?: string
    filters?: QueryFilter[]
    orderBy?: string
    orderAsc?: boolean
    limit?: number
    offset?: number
    orFilters?: string
  } = {}
): Promise<T[]> {
  const token = requireSessionToken()
  const { data, error } = await supabase.rpc('admin_query', {
    p_session_token: token,
    p_table: table,
    p_select: options.select || '*',
    p_filters: options.filters || [],  // [修复 A1] 直接传对象
    p_order_by: options.orderBy || null,
    p_order_asc: options.orderAsc ?? false,
    p_limit: options.limit ?? null,
    p_offset: options.offset ?? null,
    p_or_filters: options.orFilters || null,
    p_head: false,
  })
  if (error) {
    if (error.message?.includes('ADMIN_AUTH_FAILED')) {
      clearSessionToken()
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login'
      throw new Error('会话已过期，请重新登录')
    }
    throw new Error(error.message)
  }
  const result = typeof data === 'string' ? JSON.parse(data) : data
  return result || []
}

export async function adminCount(
  supabase: SupabaseClient,
  table: string,
  filters: QueryFilter[] = [],
  orFilters?: string
): Promise<number> {
  const token = requireSessionToken()
  const { data, error } = await supabase.rpc('admin_count', {
    p_session_token: token,
    p_table: table,
    p_filters: filters,  // [修复 A1] 直接传对象
    p_or_filters: orFilters || null,
  })
  if (error) {
    if (error.message?.includes('ADMIN_AUTH_FAILED')) {
      clearSessionToken()
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login'
      throw new Error('会话已过期，请重新登录')
    }
    throw new Error(error.message)
  }
  const result = typeof data === 'string' ? JSON.parse(data) : data
  return result?.count ?? 0
}

// ============================================================
// 通用数据写入
// ============================================================

export async function adminInsert<T = any>(
  supabase: SupabaseClient,
  table: string,
  data_obj: Record<string, any>
): Promise<T> {
  const token = requireSessionToken()
  const { data, error } = await supabase.rpc('admin_mutate', {
    p_session_token: token,
    p_action: 'insert',
    p_table: table,
    p_data: data_obj,  // [修复 A2] 直接传对象
    p_filters: [],
  })
  if (error) {
    if (error.message?.includes('ADMIN_AUTH_FAILED')) {
      clearSessionToken()
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login'
    }
    throw new Error(error.message)
  }
  const result = typeof data === 'string' ? JSON.parse(data) : data
  return result
}

export async function adminUpdate<T = any>(
  supabase: SupabaseClient,
  table: string,
  data_obj: Record<string, any>,
  filters: QueryFilter[]
): Promise<T> {
  const token = requireSessionToken()
  const { data, error } = await supabase.rpc('admin_mutate', {
    p_session_token: token,
    p_action: 'update',
    p_table: table,
    p_data: data_obj,  // [修复 A2] 直接传对象
    p_filters: filters,
  })
  if (error) {
    if (error.message?.includes('ADMIN_AUTH_FAILED')) {
      clearSessionToken()
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login'
    }
    throw new Error(error.message)
  }
  const result = typeof data === 'string' ? JSON.parse(data) : data
  return result
}

export async function adminDelete(
  supabase: SupabaseClient,
  table: string,
  filters: QueryFilter[]
): Promise<any> {
  const token = requireSessionToken()
  const { data, error } = await supabase.rpc('admin_mutate', {
    p_session_token: token,
    p_action: 'delete',
    p_table: table,
    p_filters: filters,  // [修复 A1] 直接传对象
  })
  if (error) {
    if (error.message?.includes('ADMIN_AUTH_FAILED')) {
      clearSessionToken()
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login'
    }
    throw new Error(error.message)
  }
  return data
}

// ============================================================
// 已有 RPC 函数的透传调用（自动注入 session token）
// ============================================================

export async function adminRpc<T = any>(
  supabase: SupabaseClient,
  funcName: string,
  params: Record<string, any> = {}
): Promise<T> {
  const token = requireSessionToken()
  const { data, error } = await supabase.rpc(funcName, {
    ...params,
    p_session_token: token,
  })
  if (error) {
    if (error.message?.includes('ADMIN_AUTH_FAILED')) {
      clearSessionToken()
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login'
    }
    throw new Error(error.message)
  }
  const result = typeof data === 'string' ? JSON.parse(data) : data
  return result
}

// ============================================================
// SSE 流式请求（AI 商品上架等场景）
// [v3 新增]
// ============================================================

/**
 * 发起带管理员认证的 SSE 请求
 * 
 * 用于 AI 商品上架等需要流式响应的场景。
 * 自动注入 session token、Supabase 网关认证 headers，
 * 并统一处理 ADMIN_AUTH_FAILED 错误（自动登出跳转）。
 *
 * @param url Edge Function 完整 URL
 * @param body 请求体
 * @param onEvent SSE 事件回调（每收到一个 data: 行触发一次）
 * @param onError 错误回调
 * @returns AbortController（调用方可用于取消请求）
 */
export function adminSSEFetch(
  url: string,
  body: Record<string, any>,
  onEvent: (data: any) => void,
  onError: (error: Error) => void
): AbortController {
  const controller = new AbortController()
  const sessionToken = getSessionToken()

  if (!sessionToken) {
    // 异步触发错误回调，避免调用方在同步上下文中无法捕获
    Promise.resolve().then(() => onError(new Error('ADMIN_AUTH_REQUIRED: 请先登录')))
    return controller
  }

  const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || ''

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-session-token': sessionToken,
      'Authorization': `Bearer ${anonKey}`,  // Supabase 网关必需
      'apikey': anonKey,                      // 备用认证 header
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text()
        if (text.includes('ADMIN_AUTH_FAILED')) {
          // 与现有 adminQuery 等方法的登出逻辑保持一致
          clearSessionToken()
          localStorage.removeItem('admin_user')
          window.location.href = '/admin/login'
          return
        }
        throw new Error(`HTTP ${response.status}: ${text}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              onEvent(data)
            } catch {
              // 忽略非 JSON 行（如 SSE 注释行 `: heartbeat`）
            }
          }
        }
      }
    })
    .catch((error) => {
      if (error.name !== 'AbortError') {
        onError(error)
      }
    })

  return controller
}

// ============================================================
// Storage 上传（通过 Edge Function）
// [修复 A3] 添加 Authorization header
// ============================================================

export async function adminUploadImage(
  supabaseUrl: string,
  file: File,
  bucket: string = 'lottery-images',
  folder?: string
): Promise<string> {
  const token = requireSessionToken()
  const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || ''

  const formData = new FormData()
  formData.append('file', file)
  formData.append('bucket', bucket)
  if (folder) formData.append('folder', folder)

  const response = await fetch(`${supabaseUrl}/functions/v1/admin-upload-image`, {
    method: 'POST',
    headers: {
      'x-admin-session-token': token,
      'Authorization': `Bearer ${anonKey}`,  // [修复 A3] Supabase 网关需要此 header
      'apikey': anonKey,                      // [修复 A3] 备用认证 header
    },
    body: formData,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '上传失败' }))
    throw new Error(err.error || '图片上传失败')
  }

  const result = await response.json()
  return result.url
}
