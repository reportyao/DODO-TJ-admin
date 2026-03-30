import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSupabase } from './SupabaseContext';
import { sha256 } from '../utils/sha256';

interface AdminUser {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  permissions: string[];
}

interface AdminAuthContextType {
  admin: AdminUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (pagePath: string) => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const { supabase } = useSupabase();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 从localStorage恢复登录状态
  // 从localStorage恢复登录状态
  useEffect(() => {
    const initAuth = async () => {
      const storedAdmin = localStorage.getItem('admin_user');
      if (storedAdmin) {
        try {
          const adminData = JSON.parse(storedAdmin);
          await loadAdminPermissions(adminData); // 等待权限加载完成
        } catch (error) {
          console.error('Failed to restore admin session:', error);
          localStorage.removeItem('admin_user');
        }
      }
      setLoading(false); // 在所有异步操作完成后再结束加载状态
    };
    
    initAuth();
  }, []);

  // 权限ID到页面路径的映射
  const PERMISSION_TO_PATH_MAP: Record<string, string[]> = {
    'users.view': ['/users', '/user-management'],
    'users.edit': ['/users', '/user-management'],
    'users.delete': ['/user-management'],
    'lotteries.view': ['/lotteries'],
    'lotteries.create': ['/lotteries/new'],
    'lotteries.edit': ['/lotteries'],
    'lotteries.delete': ['/lotteries'],
    'lotteries.draw': ['/draw-logs'],
    'orders.view': ['/orders', '/order-shipment'],
    'orders.edit': ['/orders', '/order-shipment'],
    'orders.cancel': ['/orders'],
    'finance.view': ['/deposit-review', '/withdrawal-review', '/commission-records', '/deposit-alerts'],
    'finance.deposit.review': ['/deposit-review', '/deposit-alerts'],
    'finance.withdrawal.review': ['/withdrawal-review'],
    'finance.commission.view': ['/commission-records', '/commission-config'],
    'finance.commission.edit': ['/commission-config'],
    'shipping.view': [
      '/shipping-management',
      '/shipment-batches',
      '/batch-arrival-confirm',
      '/batch-statistics',
      '/pickup-verification',
      '/pickup-points',
      '/pickup-stats',
      '/pending-pickups',
      '/pickup-staff',
    ],
    'shipping.edit': [
      '/shipping-management',
      '/shipment-batches',
      '/batch-arrival-confirm',
      '/batch-statistics',
    ],
    'showoff.view': ['/showoff-review', '/showoff-management'],
    'showoff.review': ['/showoff-review', '/showoff-create', '/showoff-management'],
    'showoff.delete': ['/showoff-review', '/showoff-management'],
    'resale.view': ['/resale-management'],
    'resale.edit': ['/resale-management'],
    'config.payment': ['/payment-config'],
    'config.algorithm': ['/algorithm-config'],
    'config.banner': ['/banner-management'],
    // 推广员管理
    'promoter.view': [
      '/promoter-management',
      '/promoter-dashboard',
      '/promoter-deposits',
      '/promoter-reports',
      '/promoter-settlement',
      '/promotion-points',
    ],
    'promoter.edit': [
      '/promoter-management',
      '/promoter-deposits',
      '/promoter-settlement',
    ],
    // 邀请/返佣管理
    'referral.view': ['/referral-management'],
    'referral.edit': ['/referral-management'],
    // 商品库存管理
    'inventory.view': ['/inventory-products', '/group-buy-products', '/group-buy-sessions'],
    'inventory.edit': ['/inventory-products', '/group-buy-products', '/group-buy-sessions'],
    // 系统管理
    'admin.view': ['/admin-management'],
    'admin.create': ['/admin-management'],
    'admin.edit': ['/admin-management'],
    'admin.delete': ['/admin-management'],
    'audit.view': ['/audit-logs', '/error-logs', '/channel-analytics'],
    // AI 管理（超级管理员专属，但映射保留）
    'ai.manage': ['/ai-management'],
    // 权限管理
    'permission.manage': ['/permission-management'],
  };

  // 加载管理员权限
  const loadAdminPermissions = async (adminData: any) => {
    try {
      const { data: rolePermData, error } = await supabase
        .from('role_permissions')
        .select('permissions')
        .eq('role', adminData.role)
        .maybeSingle();

      // maybeSingle() 返回 null 而不是 406 错误，当记录不存在时不抛出异常
      if (error) {throw error;}

      // permissions是JSONB数组，如 ["users.view", "lotteries.view"]
      const permissionIds = rolePermData?.permissions || [];
      
      setAdmin({
        ...adminData,
        permissions: permissionIds
      });
    } catch (error) {
      console.error('Failed to load permissions:', error);
      setAdmin({
        ...adminData,
        permissions: []
      });
    }
  };

  // 登录
  const login = async (username: string, password: string) => {
    const MAX_ATTEMPTS = 5;
    const LOCKOUT_MINUTES = 15;

    try {
      // 查询管理员账户（含密码哈希、失败计数、锁定时间）
      const { data: adminUser, error } = await supabase
        .from('admin_users')
        .select('id, username, display_name, role, status, password_hash, failed_login_attempts, locked_until')
        .eq('username', username)
        .single();

      if (error || !adminUser) {
        throw new Error('用户名或密码错误');
      }

      if (adminUser.status !== 'active') {
        throw new Error('账户已被禁用');
      }

      // 检查账户是否被锁定
      if (adminUser.locked_until && new Date(adminUser.locked_until) > new Date()) {
        const remainingMinutes = Math.ceil(
          (new Date(adminUser.locked_until).getTime() - Date.now()) / 60000
        );
        throw new Error(`账户已被临时锁定，请 ${remainingMinutes} 分钟后再试`);
      }

      // 校验密码：对输入密码做 SHA-256 哈希后与数据库中的哈希比对
      const inputHash = sha256(password);
      if (adminUser.password_hash && inputHash !== adminUser.password_hash) {
        // 密码错误：增加失败计数
        const newAttempts = (adminUser.failed_login_attempts || 0) + 1;
        const updateData: Record<string, unknown> = { failed_login_attempts: newAttempts };

        if (newAttempts >= MAX_ATTEMPTS) {
          // 达到最大失败次数，锁定账户
          updateData.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
          updateData.failed_login_attempts = 0; // 重置计数器
        }

        await supabase.from('admin_users').update(updateData).eq('id', adminUser.id);

        if (newAttempts >= MAX_ATTEMPTS) {
          throw new Error(`密码错误次数过多，账户已被锁定 ${LOCKOUT_MINUTES} 分钟`);
        }
        const remaining = MAX_ATTEMPTS - newAttempts;
        throw new Error(`用户名或密码错误，还剩 ${remaining} 次尝试机会`);
      }

      // 登录成功：重置失败计数和锁定状态
      await supabase
        .from('admin_users')
        .update({
          last_login_at: new Date().toISOString(),
          failed_login_attempts: 0,
          locked_until: null
        })
        .eq('id', adminUser.id);

      // 记录登录日志
      await supabase
        .from('admin_audit_logs')
        .insert({
          admin_id: adminUser.id,
          action: 'login'
        });

      // 保存到localStorage（不保存密码哈希）
      const { password_hash: _, failed_login_attempts: __, locked_until: ___, ...adminUserSafe } = adminUser;
      localStorage.setItem('admin_user', JSON.stringify(adminUserSafe));

      // 加载权限
      await loadAdminPermissions(adminUserSafe);
    } catch (error: any) {
      throw new Error(error.message || '登录失败');
    }
  };

  // 登出
  const logout = () => {
    if (admin) {
      // 记录登出日志
      supabase
        .from('admin_audit_logs')
        .insert({
          admin_id: admin.id,
          action: 'logout'
        });
    }

    localStorage.removeItem('admin_user');
    setAdmin(null);
  };

  // 检查权限
  const hasPermission = (pagePath: string): boolean => {
    if (!admin) {return false;}
    if (admin.role === 'super_admin') {return true;}
    
    // 根目录总是允许访问
    if (pagePath === '/') {return true;}
    
    // 查找哪些权限ID对应这个页面路径
    for (const [permId, paths] of Object.entries(PERMISSION_TO_PATH_MAP)) {
      if (paths.some(p => pagePath.startsWith(p))) {
        if (admin.permissions && admin.permissions.includes(permId)) {
          return true;
        }
      }
    }
    
    return false;
  };

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout, hasPermission }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}
