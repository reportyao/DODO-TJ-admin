/**
 * 批发商管理页面（增强版）
 *
 * 功能：
 * 1. 列表展示已有的 wholesaler_profiles（按状态筛选 + 关键词搜索：手机号 / 姓名 / 公司名）
 * 2. 审核 pending 申请：通过 / 拒绝（拒绝可填写原因）
 * 3. 主动“创建批发商”：模糊搜索 users 表 phone_number，命中后展示头像/姓名/手机号；
 *    选定用户后填写门店地址、联系电话、可选公司名/税号、上传一张或多张门店现场照片，
 *    提交后写入 wholesaler_profiles 并直接 approved。
 * 4. 编辑已存在批发商资料（地址、电话、照片、公司名等）。
 *
 * 依赖：
 * - adminQuery / adminInsert / adminUpdate / adminCount / adminUploadImage
 * - storage bucket: wholesaler-stores（migration 中创建）
 * - 已被加入 admin_query / admin_count / admin_mutate 白名单（含 users / wholesaler_profiles）
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import {
  adminQuery,
  adminUpdate,
  adminInsert,
  adminCount,
  adminUploadImage,
} from '../lib/adminApi';
import toast from 'react-hot-toast';

// ============================================================================
// 类型定义
// ============================================================================
interface WholesalerProfile {
  id: string;
  user_id: string;
  company_name: string | null;
  contact_phone: string | null;
  tax_id: string | null;
  business_address: string | null;
  delivery_address: string | null;
  status: string;
  reject_reason: string | null;
  approved_at: string | null;
  approved_by: string | null;
  notes: string | null;
  store_photos?: string[] | null;
  created_at: string;
  updated_at: string;
}

interface UserInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  telegram_username?: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待审核', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '已通过', color: 'bg-green-100 text-green-800' },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-800' },
};

// 取 import.meta.env，便于上传图片时拼 functions URL
const SUPABASE_URL: string = (import.meta as any).env.VITE_SUPABASE_URL || '';

// ============================================================================
// 子组件：批发商表单弹窗（用于「创建」/「编辑」批发商）
// ============================================================================
interface WholesalerFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialUser?: UserInfo | null;
  initialProfile?: WholesalerProfile | null;
  onClose: () => void;
  onSubmit: (form: {
    user_id: string;
    company_name: string;
    contact_phone: string;
    business_address: string;
    delivery_address: string;
    tax_id: string;
    store_photos: string[];
    notes: string;
  }) => Promise<void>;
}

function WholesalerFormModal(props: WholesalerFormModalProps) {
  const { open, mode, initialUser, initialProfile, onClose, onSubmit } = props;
  const { supabase } = useSupabase();

  // —— 用户搜索状态（仅 create 模式可用）——
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<UserInfo[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(initialUser || null);

  // —— 表单字段 ——
  const [companyName, setCompanyName] = useState(initialProfile?.company_name || '');
  const [contactPhone, setContactPhone] = useState(
    initialProfile?.contact_phone || initialUser?.phone_number || '',
  );
  const [businessAddress, setBusinessAddress] = useState(initialProfile?.business_address || '');
  const [deliveryAddress, setDeliveryAddress] = useState(initialProfile?.delivery_address || '');
  const [taxId, setTaxId] = useState(initialProfile?.tax_id || '');
  const [notes, setNotes] = useState(initialProfile?.notes || '');
  const [storePhotos, setStorePhotos] = useState<string[]>(
    Array.isArray(initialProfile?.store_photos) ? (initialProfile?.store_photos as string[]) : [],
  );
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 当 open 关闭时重置（防止下次打开复用旧数据）
  useEffect(() => {
    if (!open) {
      setKeyword('');
      setCandidates([]);
      setSearching(false);
      setUploading(false);
      setSubmitting(false);
    } else {
      // 打开时同步初始值
      setSelectedUser(initialUser || null);
      setCompanyName(initialProfile?.company_name || '');
      setContactPhone(initialProfile?.contact_phone || initialUser?.phone_number || '');
      setBusinessAddress(initialProfile?.business_address || '');
      setDeliveryAddress(initialProfile?.delivery_address || '');
      setTaxId(initialProfile?.tax_id || '');
      setNotes(initialProfile?.notes || '');
      setStorePhotos(
        Array.isArray(initialProfile?.store_photos)
          ? (initialProfile?.store_photos as string[])
          : [],
      );
    }
  }, [open, initialUser, initialProfile]);

  // —— 模糊搜索手机号（兼容姓名） ——
  // 后端 admin_query 支持 orFilters 透传给 PostgREST，组合 phone_number.ilike.* / first_name.ilike.* / last_name.ilike.*
  // 注：PostgREST .ilike 通配符使用 *
  const handleSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setCandidates([]);
        return;
      }
      try {
        setSearching(true);
        // 转义 PostgREST 通配符；先简单用 ilike，模式 *<keyword>*
        const pattern = `*${trimmed}*`;
        const orFilters = [
          `phone_number.ilike.${pattern}`,
          `first_name.ilike.${pattern}`,
          `last_name.ilike.${pattern}`,
        ].join(',');
        const users = await adminQuery<UserInfo>(supabase, 'users', {
          select: 'id,first_name,last_name,phone_number,avatar_url,telegram_username',
          orFilters,
          limit: 10,
          orderBy: 'created_at',
          orderAsc: false,
        });
        setCandidates(users);
      } catch (err: any) {
        toast.error(`搜索失败：${err.message || err}`);
      } finally {
        setSearching(false);
      }
    },
    [supabase],
  );

  // 输入防抖：用户停止输入 400ms 后触发搜索
  useEffect(() => {
    if (mode !== 'create') return;
    const t = setTimeout(() => handleSearch(keyword), 400);
    return () => clearTimeout(t);
  }, [keyword, mode, handleSearch]);

  // —— 上传门店照片 ——
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (storePhotos.length + files.length > 6) {
      toast.error('最多上传 6 张门店照片');
      return;
    }
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const url = await adminUploadImage(SUPABASE_URL, file, 'wholesaler-stores', 'stores');
        newUrls.push(url);
      }
      setStorePhotos((prev) => [...prev, ...newUrls]);
      toast.success(`已上传 ${newUrls.length} 张图片`);
    } catch (err: any) {
      toast.error(`上传失败：${err.message || err}`);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (idx: number) => {
    setStorePhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // —— 提交校验 ——
  const handleSubmit = async () => {
    const userId = selectedUser?.id || initialUser?.id;
    if (!userId) {
      toast.error('请先选择用户');
      return;
    }
    if (!businessAddress.trim()) {
      toast.error('请填写门店地址');
      return;
    }
    if (!contactPhone.trim()) {
      toast.error('请填写联系电话');
      return;
    }
    if (storePhotos.length === 0) {
      toast.error('至少上传 1 张门店照片');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        user_id: userId,
        company_name: companyName.trim(),
        contact_phone: contactPhone.trim(),
        business_address: businessAddress.trim(),
        delivery_address: deliveryAddress.trim() || businessAddress.trim(),
        tax_id: taxId.trim(),
        notes: notes.trim(),
        store_photos: storePhotos,
      });
      onClose();
    } catch (err: any) {
      toast.error(`保存失败：${err.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  // 显示用户名
  const fullName = (u: UserInfo) =>
    [u.first_name, u.last_name].filter(Boolean).join(' ') || u.telegram_username || '未命名用户';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="px-6 py-4 border-b sticky top-0 bg-white z-10 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {mode === 'create' ? '新建批发商' : '编辑批发商资料'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* 用户选择（仅 create 模式） */}
          {mode === 'create' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                搜索用户（手机号 / 姓名）
              </label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="输入至少 2 个字符开始搜索"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searching && (
                <div className="text-xs text-gray-400 mt-1">正在搜索...</div>
              )}
              {!searching && candidates.length > 0 && (
                <div className="border rounded mt-2 divide-y max-h-60 overflow-y-auto">
                  {candidates.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelectedUser(u);
                        setCandidates([]);
                        setKeyword('');
                        if (!contactPhone) setContactPhone(u.phone_number || '');
                      }}
                      className={`w-full flex items-center gap-3 p-2 hover:bg-blue-50 text-left ${
                        selectedUser?.id === u.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <img
                        src={u.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${u.id}`}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover bg-gray-100"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {fullName(u)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {u.phone_number || '未绑定手机号'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* 已选用户卡片 */}
              {selectedUser && (
                <div className="mt-3 border rounded-lg p-3 bg-blue-50 flex items-center gap-3">
                  <img
                    src={
                      selectedUser.avatar_url ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${selectedUser.id}`
                    }
                    alt=""
                    className="w-10 h-10 rounded-full object-cover bg-white"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{fullName(selectedUser)}</div>
                    <div className="text-xs text-gray-600">
                      {selectedUser.phone_number || '未绑定手机号'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedUser(null)}
                    className="text-xs text-gray-500 hover:text-red-500"
                  >
                    重新选择
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 表单字段 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                门店地址 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="如：杜尚别市 鲁达基大街 25 号"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                联系电话 <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="带国家区号"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">公司/店铺名称</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">收货地址</label>
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="留空则与门店地址相同"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">税号 / 营业执照</label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                门店现场照片 <span className="text-red-500">*</span>
                <span className="text-xs text-gray-400 ml-2">最多 6 张</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {storePhotos.map((url, idx) => (
                  <div key={url + idx} className="relative aspect-square rounded overflow-hidden border">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {storePhotos.length < 6 && (
                  <label className="aspect-square border-2 border-dashed rounded flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:border-blue-500 hover:text-blue-500">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => handleUpload(e.target.files)}
                    />
                    <span className="text-2xl leading-none">+</span>
                    <span className="text-xs mt-1">{uploading ? '上传中...' : '上传照片'}</span>
                  </label>
                )}
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm h-20 resize-none"
                placeholder="管理员内部备注，例如：经销品类、合作渠道等"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t sticky bottom-0 bg-white flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || uploading}
            className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-60"
          >
            {submitting ? '保存中...' : mode === 'create' ? '创建并设为批发商' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 主页面
// ============================================================================
export default function WholesalerManagementPage() {
  const { supabase } = useSupabase();
  const [profiles, setProfiles] = useState<WholesalerProfile[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserInfo>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<WholesalerProfile | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<WholesalerProfile | null>(null);
  const PAGE_SIZE = 20;

  // —— 拉取列表 ——
  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const filters = statusFilter !== 'all'
        ? [{ col: 'status', op: 'eq' as const, val: statusFilter }]
        : [];

      // 先按公司名/联系电话 ilike 搜索
      const orFilters = keyword.trim().length >= 2
        ? [
            `company_name.ilike.*${keyword.trim()}*`,
            `contact_phone.ilike.*${keyword.trim()}*`,
            `business_address.ilike.*${keyword.trim()}*`,
          ].join(',')
        : undefined;

      const [data, count] = await Promise.all([
        adminQuery<WholesalerProfile>(supabase, 'wholesaler_profiles', {
          filters,
          orFilters,
          orderBy: 'created_at',
          orderAsc: false,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        }),
        adminCount(supabase, 'wholesaler_profiles', filters, orFilters),
      ]);

      setProfiles(data);
      setTotalCount(count);

      // 拉取关联用户
      const userIds = data.map((p) => p.user_id).filter(Boolean);
      if (userIds.length > 0) {
        const users = await adminQuery<UserInfo>(supabase, 'users', {
          select: 'id,first_name,last_name,phone_number,avatar_url,telegram_username',
          orFilters: userIds.map((id) => `id.eq.${id}`).join(','),
        });
        const map: Record<string, UserInfo> = {};
        users.forEach((u) => { map[u.id] = u; });
        setUserMap(map);
      } else {
        setUserMap({});
      }
    } catch (err: any) {
      toast.error(`加载失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase, statusFilter, page, keyword]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // —— 操作：审核通过 / 拒绝 ——
  const handleApprove = async (profile: WholesalerProfile) => {
    try {
      await adminUpdate(supabase, 'wholesaler_profiles', {
        status: 'approved',
        approved_at: new Date().toISOString(),
        reject_reason: null,
        updated_at: new Date().toISOString(),
      }, [{ col: 'id', op: 'eq', val: profile.id }]);
      toast.success('已通过审核');
      fetchProfiles();
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    try {
      await adminUpdate(supabase, 'wholesaler_profiles', {
        status: 'rejected',
        approved_at: null,
        reject_reason: rejectReason || '未通过审核',
        updated_at: new Date().toISOString(),
      }, [{ col: 'id', op: 'eq', val: rejectTarget.id }]);
      toast.success('已拒绝');
      setRejectModalOpen(false);
      setRejectTarget(null);
      setRejectReason('');
      fetchProfiles();
    } catch (err: any) {
      toast.error(`操作失败: ${err.message}`);
    }
  };

  const openRejectModal = (profile: WholesalerProfile) => {
    setRejectTarget(profile);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  // —— 操作：创建批发商 ——
  const handleCreate = async (form: {
    user_id: string;
    company_name: string;
    contact_phone: string;
    business_address: string;
    delivery_address: string;
    tax_id: string;
    store_photos: string[];
    notes: string;
  }) => {
    // 检查是否已存在批发商资料；如果存在则改为更新
    const existing = await adminQuery<WholesalerProfile>(supabase, 'wholesaler_profiles', {
      filters: [{ col: 'user_id', op: 'eq', val: form.user_id }],
      limit: 1,
    });
    if (existing.length > 0) {
      const cur = existing[0];
      await adminUpdate(supabase, 'wholesaler_profiles', {
        company_name: form.company_name || null,
        contact_phone: form.contact_phone,
        tax_id: form.tax_id || null,
        business_address: form.business_address,
        delivery_address: form.delivery_address,
        store_photos: form.store_photos,
        notes: form.notes || null,
        status: 'approved',
        approved_at: new Date().toISOString(),
        reject_reason: null,
        updated_at: new Date().toISOString(),
      }, [{ col: 'id', op: 'eq', val: cur.id }]);
      toast.success('已更新并设为批发商');
    } else {
      await adminInsert(supabase, 'wholesaler_profiles', {
        user_id: form.user_id,
        company_name: form.company_name || null,
        contact_phone: form.contact_phone,
        tax_id: form.tax_id || null,
        business_address: form.business_address,
        delivery_address: form.delivery_address,
        store_photos: form.store_photos,
        notes: form.notes || null,
        status: 'approved',
        approved_at: new Date().toISOString(),
      });
      toast.success('批发商创建成功');
    }
    fetchProfiles();
  };

  // —— 操作：编辑批发商 ——
  const handleEdit = async (form: {
    user_id: string;
    company_name: string;
    contact_phone: string;
    business_address: string;
    delivery_address: string;
    tax_id: string;
    store_photos: string[];
    notes: string;
  }) => {
    if (!editingProfile) return;
    await adminUpdate(supabase, 'wholesaler_profiles', {
      company_name: form.company_name || null,
      contact_phone: form.contact_phone,
      tax_id: form.tax_id || null,
      business_address: form.business_address,
      delivery_address: form.delivery_address,
      store_photos: form.store_photos,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    }, [{ col: 'id', op: 'eq', val: editingProfile.id }]);
    toast.success('已保存');
    fetchProfiles();
  };

  // —— Helper ——
  const getUserDisplay = (userId: string) => {
    const user = userMap[userId];
    if (!user) return userId.slice(0, 8) + '...';
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
    return name || user.telegram_username || user.phone_number || userId.slice(0, 8);
  };

  const getUserAvatar = (userId: string) => {
    const user = userMap[userId];
    return user?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${userId}`;
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // —— 状态卡片：单独统计三种状态数量 ——
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      adminCount(supabase, 'wholesaler_profiles', [{ col: 'status', op: 'eq', val: 'pending' }]),
      adminCount(supabase, 'wholesaler_profiles', [{ col: 'status', op: 'eq', val: 'approved' }]),
      adminCount(supabase, 'wholesaler_profiles', [{ col: 'status', op: 'eq', val: 'rejected' }]),
    ])
      .then(([p, a, r]) => {
        if (!cancelled) setStatusCounts({ pending: p, approved: a, rejected: r });
      })
      .catch(() => {/* 忽略统计失败 */});
    return () => { cancelled = true; };
  }, [supabase, profiles.length]);

  // —— 编辑弹窗的初始用户 ——
  const editingUser = useMemo<UserInfo | null>(() => {
    if (!editingProfile) return null;
    return userMap[editingProfile.user_id] || null;
  }, [editingProfile, userMap]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">批发商管理</h1>
          <p className="text-sm text-gray-500 mt-1">审核、创建、维护批发商资料与门店信息</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateOpen(true)}
            className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm"
          >
            + 新建批发商
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-yellow-700">{statusCounts.pending}</div>
          <div className="text-sm text-yellow-600">待审核</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{statusCounts.approved}</div>
          <div className="text-sm text-green-600">已通过</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-700">{statusCounts.rejected}</div>
          <div className="text-sm text-red-600">已拒绝</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">状态:</span>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="border rounded px-3 py-1.5 text-sm"
          >
            <option value="all">全部</option>
            <option value="pending">待审核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已拒绝</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(0); }}
            placeholder="搜索：公司名 / 电话 / 门店地址"
            className="w-full border rounded px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-12 text-gray-500">暂无数据</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">用户</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">公司/门店</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">联系电话</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">门店地址</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">门店照片</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {profiles.map((profile) => {
                const photos = Array.isArray(profile.store_photos) ? profile.store_photos : [];
                const u = userMap[profile.user_id];
                return (
                  <tr key={profile.id} className="hover:bg-gray-50 align-top">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <img
                          src={getUserAvatar(profile.user_id)}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover bg-gray-100"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {getUserDisplay(profile.user_id)}
                          </div>
                          <div className="text-xs text-gray-400">
                            {u?.phone_number || profile.user_id.slice(0, 8)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {profile.company_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {profile.contact_phone || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-[220px] truncate" title={profile.business_address || ''}>
                      {profile.business_address || '-'}
                    </td>
                    <td className="px-6 py-4">
                      {photos.length > 0 ? (
                        <div className="flex -space-x-2">
                          {photos.slice(0, 3).map((url) => (
                            <img
                              key={url}
                              src={url}
                              alt=""
                              className="w-8 h-8 rounded border-2 border-white object-cover bg-gray-100"
                            />
                          ))}
                          {photos.length > 3 && (
                            <div className="w-8 h-8 rounded border-2 border-white bg-gray-100 text-[10px] flex items-center justify-center text-gray-600">
                              +{photos.length - 3}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">未上传</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_MAP[profile.status]?.color || 'bg-gray-100 text-gray-800'}`}>
                        {STATUS_MAP[profile.status]?.label || profile.status}
                      </span>
                      {profile.reject_reason && (
                        <div className="text-xs text-red-500 mt-1">{profile.reject_reason}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-2">
                        {profile.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(profile)}
                              className="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded"
                            >
                              通过
                            </button>
                            <button
                              onClick={() => openRejectModal(profile)}
                              className="px-3 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                            >
                              拒绝
                            </button>
                          </>
                        )}
                        {profile.status === 'rejected' && (
                          <button
                            onClick={() => handleApprove(profile)}
                            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
                          >
                            重新通过
                          </button>
                        )}
                        <button
                          onClick={() => setEditingProfile(profile)}
                          className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
                        >
                          编辑资料
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t flex items-center justify-between">
            <span className="text-sm text-gray-500">
              共 {totalCount} 条，第 {page + 1}/{totalPages} 页
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">拒绝原因</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full border rounded px-3 py-2 h-24 resize-none"
              placeholder="请输入拒绝原因（可选）"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setRejectModalOpen(false); setRejectTarget(null); }}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleRejectConfirm}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded"
              >
                确认拒绝
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <WholesalerFormModal
        open={createOpen}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

      {/* Edit Modal */}
      <WholesalerFormModal
        open={!!editingProfile}
        mode="edit"
        initialUser={editingUser}
        initialProfile={editingProfile}
        onClose={() => setEditingProfile(null)}
        onSubmit={handleEdit}
      />
    </div>
  );
}
