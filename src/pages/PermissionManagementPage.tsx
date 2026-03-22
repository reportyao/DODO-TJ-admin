import React, { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { useSupabase } from '../contexts/SupabaseContext';
import { toast } from 'react-hot-toast';

// ─── 所有可用权限（与 AdminAuthContext.PERMISSION_TO_PATH_MAP 保持一致）────────

const ALL_PERMISSIONS = [
  // 用户管理
  { id: 'users.view', name: '查看用户', category: '用户管理' },
  { id: 'users.edit', name: '编辑用户', category: '用户管理' },
  { id: 'users.delete', name: '删除用户', category: '用户管理' },

  // 积分商城管理
  { id: 'lotteries.view', name: '查看积分商城', category: '积分商城管理' },
  { id: 'lotteries.create', name: '创建积分商城', category: '积分商城管理' },
  { id: 'lotteries.edit', name: '编辑积分商城', category: '积分商城管理' },
  { id: 'lotteries.delete', name: '删除积分商城', category: '积分商城管理' },
  { id: 'lotteries.draw', name: '执行开奖', category: '积分商城管理' },

  // 订单管理
  { id: 'orders.view', name: '查看订单', category: '订单管理' },
  { id: 'orders.edit', name: '编辑订单', category: '订单管理' },
  { id: 'orders.cancel', name: '取消订单', category: '订单管理' },

  // 财务管理
  { id: 'finance.view', name: '查看财务', category: '财务管理' },
  { id: 'finance.deposit.review', name: '审核充值', category: '财务管理' },
  { id: 'finance.withdrawal.review', name: '审核提现', category: '财务管理' },
  { id: 'finance.commission.view', name: '查看佣金', category: '财务管理' },
  { id: 'finance.commission.edit', name: '编辑佣金配置', category: '财务管理' },

  // 物流管理
  { id: 'shipping.view', name: '查看物流', category: '物流管理' },
  { id: 'shipping.edit', name: '编辑物流', category: '物流管理' },

  // 晒单管理
  { id: 'showoff.view', name: '查看晒单', category: '晒单管理' },
  { id: 'showoff.review', name: '审核晒单', category: '晒单管理' },
  { id: 'showoff.delete', name: '删除晒单', category: '晒单管理' },

  // 系统配置
  { id: 'config.payment', name: '支付配置', category: '系统配置' },
  { id: 'config.algorithm', name: '算法配置', category: '系统配置' },
  { id: 'config.banner', name: 'Banner管理', category: '系统配置' },

  // 推广员管理
  { id: 'promoter.view', name: '查看推广员', category: '推广员管理' },
  { id: 'promoter.edit', name: '编辑推广员', category: '推广员管理' },

  // 邀请/返佣管理
  { id: 'referral.view', name: '查看邀请关系', category: '邀请/返佣管理' },
  { id: 'referral.edit', name: '编辑邀请关系', category: '邀请/返佣管理' },

  // 商品库存管理
  { id: 'inventory.view', name: '查看商品库存', category: '商品库存管理' },
  { id: 'inventory.edit', name: '编辑商品库存', category: '商品库存管理' },

  // 管理员管理
  { id: 'admin.view', name: '查看管理员', category: '管理员管理' },
  { id: 'admin.create', name: '创建管理员', category: '管理员管理' },
  { id: 'admin.edit', name: '编辑管理员', category: '管理员管理' },
  { id: 'admin.delete', name: '删除管理员', category: '管理员管理' },

  // 审计日志
  { id: 'audit.view', name: '查看审计日志', category: '审计日志' },

  // AI 管理
  { id: 'ai.manage', name: 'AI管理', category: 'AI管理' },

  // 权限管理
  { id: 'permission.manage', name: '权限管理', category: '权限管理' },
];

// ─── 各角色的默认权限（仅作为数据库无记录时的兜底） ─────────────────────────

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ALL_PERMISSIONS.map(p => p.id),
  admin: [
    'users.view', 'users.edit',
    'lotteries.view', 'lotteries.create', 'lotteries.edit', 'lotteries.draw',
    'orders.view', 'orders.edit',
    'finance.view', 'finance.deposit.review', 'finance.withdrawal.review',
    'finance.commission.view',
    'shipping.view', 'shipping.edit',
    'showoff.view', 'showoff.review',
    'promoter.view', 'promoter.edit',
    'referral.view',
    'inventory.view', 'inventory.edit',
    'audit.view',
  ],
  operator: [
    'users.view',
    'lotteries.view',
    'orders.view', 'orders.edit',
    'shipping.view', 'shipping.edit',
    'showoff.view', 'showoff.review',
    'promoter.view',
  ],
  finance: [
    'users.view',
    'finance.view', 'finance.deposit.review', 'finance.withdrawal.review',
    'finance.commission.view',
    'orders.view',
    'promoter.view',
    'referral.view',
  ],
  viewer: [
    'users.view',
    'lotteries.view',
    'orders.view',
    'finance.view',
    'shipping.view',
    'showoff.view',
    'promoter.view',
    'referral.view',
    'inventory.view',
    'audit.view',
  ],
};

const ROLES = [
  { value: 'super_admin', label: '超级管理员', description: '拥有所有权限，可管理其他管理员' },
  { value: 'admin', label: '管理员', description: '可管理用户、积分商城、订单、财务等核心功能' },
  { value: 'operator', label: '运营人员', description: '可管理订单、物流、晒单等日常运营工作' },
  { value: 'finance', label: '财务人员', description: '可审核充值提现、查看财务数据' },
  { value: 'viewer', label: '只读用户', description: '只能查看数据，无编辑权限' },
];

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export default function PermissionManagementPage() {
  const { admin: currentAdmin } = useAdminAuth();
  const { supabase } = useSupabase();

  const [selectedRole, setSelectedRole] = useState<string>('admin');
  const [customPermissions, setCustomPermissions] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // 记录当前角色的数据库权限数量（用于显示）
  const [dbPermCount, setDbPermCount] = useState<number | null>(null);

  // ─── 切换角色时从数据库回显权限（修复：不再使用本地常量初始化）────────────

  const loadRolePermissions = useCallback(async (role: string) => {
    setIsLoading(true);
    setDbPermCount(null);
    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permissions')
        .eq('role', role)
        .maybeSingle();

      if (error) throw error;

      if (data?.permissions) {
        // 数据库有记录，使用数据库中的权限
        setCustomPermissions(new Set(data.permissions as string[]));
        setDbPermCount((data.permissions as string[]).length);
      } else {
        // 数据库无记录，使用默认权限作为兜底
        const defaults = DEFAULT_ROLE_PERMISSIONS[role] || [];
        setCustomPermissions(new Set(defaults));
        setDbPermCount(null); // null 表示尚未保存到数据库
      }
    } catch (err: any) {
      console.error('加载权限失败:', err);
      toast.error('加载权限失败: ' + (err?.message || '未知错误'));
      // 失败时回退到默认权限
      const defaults = DEFAULT_ROLE_PERMISSIONS[role] || [];
      setCustomPermissions(new Set(defaults));
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadRolePermissions(selectedRole);
  }, [selectedRole, loadRolePermissions]);

  // ─── 切换单个权限 ─────────────────────────────────────────────────────────

  const handlePermissionToggle = (permissionId: string) => {
    const newPermissions = new Set(customPermissions);
    if (newPermissions.has(permissionId)) {
      newPermissions.delete(permissionId);
    } else {
      newPermissions.add(permissionId);
    }
    setCustomPermissions(newPermissions);
  };

  // ─── 保存权限到数据库（upsert） ───────────────────────────────────────────

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const permissionsArray = Array.from(customPermissions);

      // 使用 upsert 避免先查再写的竞态条件
      const { error } = await supabase
        .from('role_permissions')
        .upsert(
          {
            role: selectedRole,
            permissions: permissionsArray,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'role' }
        );

      if (error) throw error;

      setDbPermCount(permissionsArray.length);
      toast.success('权限配置已保存');
    } catch (error: any) {
      console.error('保存失败:', error);
      toast.error('保存失败: ' + (error?.message || '未知错误'));
    } finally {
      setIsSaving(false);
    }
  };

  // ─── 按分类分组权限 ───────────────────────────────────────────────────────

  const permissionsByCategory = ALL_PERMISSIONS.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = [];
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, typeof ALL_PERMISSIONS>);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">权限管理</h1>
        <p className="text-gray-600">配置不同角色的权限，控制管理员可访问的功能</p>
      </div>

      {/* 角色选择 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">选择角色</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ROLES.map(role => (
            <div
              key={role.value}
              onClick={() => setSelectedRole(role.value)}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                selectedRole === role.value
                  ? 'border-indigo-600 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{role.label}</h3>
                {selectedRole === role.value && (
                  <span className="text-indigo-600">✓</span>
                )}
              </div>
              <p className="text-sm text-gray-600">{role.description}</p>
              <p className="text-xs text-gray-500 mt-2">
                {DEFAULT_ROLE_PERMISSIONS[role.value]?.length || 0} 项默认权限
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 权限列表 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg font-semibold">
              {ROLES.find(r => r.value === selectedRole)?.label} 的权限
            </h2>
            {isLoading ? (
              <p className="text-sm text-gray-400 mt-0.5">加载中...</p>
            ) : dbPermCount !== null ? (
              <p className="text-sm text-green-600 mt-0.5">
                ✓ 已从数据库加载（{dbPermCount} 项）
              </p>
            ) : (
              <p className="text-sm text-yellow-600 mt-0.5">
                ⚠ 使用默认配置（尚未保存到数据库）
              </p>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading || selectedRole === 'super_admin'}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSaving ? '保存中...' : '保存配置'}
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">
            加载权限配置中...
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(permissionsByCategory).map(([category, permissions]) => (
              <div key={category} className="border-b pb-4 last:border-b-0">
                <h3 className="font-semibold text-gray-700 mb-3">{category}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {permissions.map(permission => (
                    <label
                      key={permission.id}
                      className="flex items-center space-x-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={customPermissions.has(permission.id)}
                        onChange={() => handlePermissionToggle(permission.id)}
                        className="w-4 h-4 text-indigo-600 rounded"
                        disabled={selectedRole === 'super_admin'}
                      />
                      <span className="text-sm">{permission.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedRole === 'super_admin' && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              ⚠️ 超级管理员拥有所有权限，无法修改
            </p>
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-blue-900 mb-2">权限说明</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>查看权限</strong>：可以浏览和查看数据</li>
            <li>• <strong>编辑权限</strong>：可以修改现有数据</li>
            <li>• <strong>创建权限</strong>：可以创建新数据</li>
            <li>• <strong>删除权限</strong>：可以删除数据</li>
            <li>• <strong>审核权限</strong>：可以审核和批准操作</li>
            <li>• 保存后，对应角色的管理员需重新登录才能生效</li>
          </ul>
        </div>
      </div>

      {/* 权限统计 */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">总权限数</p>
          <p className="text-2xl font-bold text-gray-900">{ALL_PERMISSIONS.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">已启用权限</p>
          <p className="text-2xl font-bold text-indigo-600">{customPermissions.size}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">权限类别</p>
          <p className="text-2xl font-bold text-gray-900">{Object.keys(permissionsByCategory).length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">覆盖率</p>
          <p className="text-2xl font-bold text-green-600">
            {Math.round((customPermissions.size / ALL_PERMISSIONS.length) * 100)}%
          </p>
        </div>
      </div>
    </div>
  );
}
