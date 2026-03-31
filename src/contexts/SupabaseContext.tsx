import React, { createContext, useContext, useMemo } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { DB } from '@/types/supabase'
import { createSupabaseProxy } from '@/lib/supabaseProxy'

// 安全修复: 仅使用 Anon Key，不再在前端暴露 Service Role Key
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and Anon Key must be provided in environment variables.')
}

interface SupabaseContextType {
  supabase: SupabaseClient<DB>
  supabaseAuth: SupabaseClient<DB>
}

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined)

// 创建单例客户端，避免多次实例化
let supabaseInstance: SupabaseClient<DB> | null = null

// 原始客户端（仅用于 RPC 调用）
let rawInstance: SupabaseClient<DB> | null = null

function getRawClient(): SupabaseClient<DB> {
  if (!rawInstance) {
    rawInstance = createClient<DB>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
        storageKey: 'admin-supabase-auth'
      },
      global: {
        headers: {
          'Prefer': 'return=representation'
        }
      },
      db: {
        schema: 'public'
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
  }
  return rawInstance
}

// 代理客户端（拦截所有 .from() 调用，转发到 RPC）
function getSupabaseClient(): SupabaseClient<DB> {
  if (!supabaseInstance) {
    const raw = getRawClient()
    supabaseInstance = createSupabaseProxy(raw) as SupabaseClient<DB>
  }
  return supabaseInstance
}

export const SupabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const clients = useMemo(() => {
    const supabaseClient = getSupabaseClient()
    return {
      supabase: supabaseClient,
      supabaseAuth: supabaseClient
    }
  }, [])

  return (
    <SupabaseContext.Provider value={clients}>
      {children}
    </SupabaseContext.Provider>
  )
}

export const useSupabase = (): SupabaseContextType => {
  const context = useContext(SupabaseContext)
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider')
  }
  return context
}
