import { describe, it, expect, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// 模拟 @supabase/supabase-js 的 createClient 函数
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    // 模拟 Supabase 客户端的结构
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => ({
            data: { id: 1, name: 'Test User' },
            error: null,
          })),
          data: [{ id: 1, name: 'Test Item' }],
          error: null,
        })),
      })),
    })),
    auth: {
      getSession: vi.fn(() => ({
        data: { session: { user: { id: 'test-user-id' } } },
        error: null,
      })),
      signInWithPassword: vi.fn(() => ({
        data: { user: { id: 'test-user-id' } },
        error: null,
      })),
      signOut: vi.fn(() => ({
        error: null,
      })),
    },
    rpc: vi.fn(() => ({
      data: { result: 'success' },
      error: null,
    })),
  })),
}))

describe('Supabase Client Integration Test', () => {
  it('应该使用正确的环境变量初始化 Supabase 客户端', () => {
    expect(createClient).toHaveBeenCalledWith(
      'https://qcrcgpwlfouqslokwbzl.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93eWl0eHd4bXh3YmtxZ3pmZmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0MjM4NTMsImV4cCI6MjA3Nzk5OTg1M30.xsdiUmVfN9Cwa7jkusYubs4ZI34ZpYSdD_nsAB_X2w0'
    )
  })

  it('应该有一个可用的 auth 对象', async () => {
    const { data, error } = await supabase.auth.getSession()
    expect(error).toBeNull()
    expect(data.session).toBeDefined()
    expect(data.session.user.id).toBe('test-user-id')
  })

  it('应该能够执行基本的查询', async () => {
    const { data, error } = await supabase.from('test_table').select('*').eq('id', 1)
    expect(error).toBeNull()
    expect(data).toEqual([{ id: 1, name: 'Test Item' }])
  })

  it('应该能够调用 rpc 函数', async () => {
    const { data, error } = await supabase.rpc('test_function')
    expect(error).toBeNull()
    expect(data).toEqual({ result: 'success' })
  })
})
