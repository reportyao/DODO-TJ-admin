import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSupabase } from './SupabaseContext';
import { sha256 } from '../utils/sha256';
import {
  adminLogin as apiLogin,
  adminLogout as apiLogout,
  adminGetPermissions,
  getSessionToken,
  clearSessionToken,
} from '../lib/adminApi';

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

  // 从localStorage恢复登录状态，并通过RPC验证session有效性
  useEffect(() => {
    const initAuth = async () => {
      const storedAdmin = localStorage.getItem('admin_user');
      const sessionToken = getSessionToken();

      if (storedAdmin && sessionToken) {
        try {
          const adminData = JSON.parse(storedAdmin);
          // 通过 RPC 验证 session 是否仍然有效，并加载最新权限
          const permData = await adminGetPermissions(supabase);
          setAdmin({
            ...adminData,
            role: permData.role,
            permissions: permData.permissions || [],
          });
        } catch (error) {
          console.error('Failed to restore admin session:', error);
          // session 无效，清理本地状态
          localStorage.removeItem('admin_user');
          clearSessionToken();
        }
      }
      setLoading(false);
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
    'inventory.view': ['/inventory-products', '/group-buy-products', '/group-buy-sessions', '/ai-listing'],
    'inventory.edit': ['/inventory-products', '/group-buy-products', '/group-buy-sessions', '/ai-listing'],
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

  // 登录 - 通过 Security Definer RPC 函数执行
  const login = async (username: string, password: string) => {
    try {
      // 对密码做 SHA-256 哈希
      const passwordHash = sha256(password);

      // 调用 RPC 函数进行登录验证
      const result = await apiLogin(supabase, username, passwordHash);

      // 保存管理员信息到 localStorage
      localStorage.setItem('admin_user', JSON.stringify(result.admin));

      // 加载权限
      const permData = await adminGetPermissions(supabase);

      setAdmin({
        ...result.admin,
        permissions: permData.permissions || [],
      });
    } catch (error: any) {
      throw new Error(error.message || '登录失败');
    }
  };

  // 登出 - 通过 RPC 函数使 session 失效
  const logout = () => {
    apiLogout(supabase);
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
