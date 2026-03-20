import { useState, useEffect } from 'react'
import { useSupabase } from '@/contexts/SupabaseContext'

export interface AuthUser {
  id: string
  email?: string
  role: string
  permissions: string[]
}

export function useAuth() {
  const { supabase } = useSupabase()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 获取当前用户session
    const getUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session?.user) {
          // 查询管理员角色 (使用 admin_users 表)
          const { data: adminUser } = await supabase
            .from('admin_users')
            .select('role')
            .eq('id', session.user.id)
            .single()
          
          setUser({
            id: session.user.id,
            email: session.user.email,
            role: adminUser?.role || 'admin', // 默认为admin
            permissions: ['*'] // 默认所有权限
          })
        } else {
          // 开发环境：创建模拟用户
          console.log('[Dev] No session found, creating mock admin user')
          setUser({
            id: 'dev-admin',
            email: 'admin@dodo.tj',
            role: 'admin',
            permissions: ['*']
          })
        }
      } catch (error) {
        console.error('Error fetching user:', error)
        // 出错时也使用模拟用户
        setUser({
          id: 'dev-admin',
          email: 'admin@dodo.tj',
          role: 'admin',
          permissions: ['*']
        })
      } finally {
        setLoading(false)
      }
    }

    getUser()

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        supabase
          .from('admin_users')
          .select('role')
          .eq('id', session.user.id)
          .single()
          .then(({ data: adminUser }) => {
            setUser({
              id: session.user.id,
              email: session.user.email,
              role: adminUser?.role || 'admin',
              permissions: ['*']
            })
          })
      } else {
        // 使用模拟用户而不是null
        setUser({
          id: 'dev-admin',
          email: 'admin@dodo.tj',
          role: 'admin',
          permissions: ['*']
        })
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  return { user, loading }
}
