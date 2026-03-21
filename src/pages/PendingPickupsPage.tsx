import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
  GiftIcon,
  UserIcon,
  MapPinIcon,
  ClockIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

// 统一的待核销奖品接口
interface PendingPickup {
  id: string;
  type: 'lottery' | 'group_buy' | 'full_purchase';
  prize_name: string;
  prize_image: string;
  prize_value: number;
  pickup_code: string | null;
  pickup_status: string;
  expires_at: string | null;
  claimed_at: string | null;
  created_at: string;
  user: {
    id: string;
    phone_number: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
  pickup_point: {
    id: string;
    name: string;
    name_i18n: { zh?: string; ru?: string; tg?: string } | null;
    address: string;
    address_i18n: { zh?: string; ru?: string; tg?: string } | null;
    contact_phone: string | null;
  } | null;
  // 抽奖特有
  lottery?: {
    id: string;
    title: string;
    title_i18n: { zh?: string; ru?: string; tg?: string } | null;
  } | null;
  // 拼团特有
  product?: {
    id: string;
    title: { zh?: string; ru?: string; tg?: string } | null;
  } | null;
}

type FilterStatus = 'all' | 'PENDING_CLAIM' | 'PENDING_PICKUP' | 'EXPIRED';
type FilterType = 'all' | 'lottery' | 'group_buy' | 'full_purchase';

export default function PendingPickupsPage() {
  const { admin } = useAdminAuth();
  const [pickups, setPickups] = useState<PendingPickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPickup, setSelectedPickup] = useState<PendingPickup | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // 加载待核销数据
  const loadPickups = async () => {
    setLoading(true);
    try {
      const allPickups: PendingPickup[] = [];

      // 1. 加载积分商城中奖记录
      const { data: prizes, error: prizesError } = await supabase
        .from('prizes')
        .select(`
          id,
          prize_name,
          prize_image,
          prize_value,
          pickup_code,
          pickup_status,
          expires_at,
          claimed_at,
          created_at,
          user_id,
          lottery_id,
          pickup_point_id
        `)
        .in('pickup_status', ['PENDING_CLAIM', 'PENDING_PICKUP', 'EXPIRED'])
        .order('created_at', { ascending: false });

      if (prizesError) {
        console.error('加载积分商城奖品失败:', prizesError);
      } else if (prizes) {
        // 获取关联数据
        for (const prize of prizes) {
          // 获取用户信息
          let user = null;
          if (prize.user_id) {
            const { data: userData } = await supabase
              .from('users')
              .select('id, phone_number, first_name, last_name, avatar_url')
              .eq('id', prize.user_id)
              .single();
            user = userData;
          }

          // 获取抽奖信息
          let lottery = null;
          if (prize.lottery_id) {
            const { data: lotteryData } = await supabase
              .from('lotteries')
              .select('id, title, title_i18n')
              .eq('id', prize.lottery_id)
              .single();
            lottery = lotteryData;
          }

          // 获取自提点信息
          let pickupPoint = null;
          if (prize.pickup_point_id) {
            const { data: pointData } = await supabase
              .from('pickup_points')
              .select('id, name, name_i18n, address, address_i18n, contact_phone')
              .eq('id', prize.pickup_point_id)
              .single();
            pickupPoint = pointData;
          }

          allPickups.push({
            id: prize.id,
            type: 'lottery',
            prize_name: prize.prize_name || lottery?.title || '积分商城奖品',
            prize_image: prize.prize_image || '',
            prize_value: prize.prize_value || 0,
            pickup_code: prize.pickup_code,
            pickup_status: prize.pickup_status || 'PENDING_CLAIM',
            expires_at: prize.expires_at,
            claimed_at: prize.claimed_at,
            created_at: prize.created_at,
            user,
            pickup_point: pickupPoint,
            lottery,
          });
        }
      }

      // 2. 加载拼团中奖记录
      const { data: groupBuyResults, error: groupBuyError } = await supabase
        .from('group_buy_results')
        .select(`
          id,
          winner_id,
          product_id,
          pickup_code,
          pickup_status,
          expires_at,
          claimed_at,
          created_at,
          pickup_point_id
        `)
        .in('pickup_status', ['PENDING_CLAIM', 'PENDING_PICKUP', 'EXPIRED'])
        .order('created_at', { ascending: false });

      if (groupBuyError) {
        console.error('加载拼团中奖记录失败:', groupBuyError);
      } else if (groupBuyResults) {
        for (const result of groupBuyResults) {
          // 获取用户信息（通过phone_number）
          let user = null;
          if (result.winner_id) {
            const { data: userData } = await supabase
              .from('users')
              .select('id, phone_number, first_name, last_name, avatar_url')
              .eq('phone_number', result.winner_id)
              .single();
            user = userData;
          }

          // 获取商品信息
          let product = null;
          if (result.product_id) {
            const { data: productData } = await supabase
              .from('group_buy_products')
              .select('id, title, image_url, original_price')
              .eq('id', result.product_id)
              .single();
            product = productData;
          }

          // 获取自提点信息
          let pickupPoint = null;
          if (result.pickup_point_id) {
            const { data: pointData } = await supabase
              .from('pickup_points')
              .select('id, name, name_i18n, address, address_i18n, contact_phone')
              .eq('id', result.pickup_point_id)
              .single();
            pickupPoint = pointData;
          }

          allPickups.push({
            id: result.id,
            type: 'group_buy',
            prize_name: getLocalizedText(product?.title) || '拼团商品',
            prize_image: product?.image_url || '',
            prize_value: product?.original_price || 0,
            pickup_code: result.pickup_code,
            pickup_status: result.pickup_status || 'PENDING_CLAIM',
            expires_at: result.expires_at,
            claimed_at: result.claimed_at,
            created_at: result.created_at,
            user,
            pickup_point: pickupPoint,
            product,
          });
        }
      }

      // 3. 加载全款购买记录
      const { data: fullPurchaseOrders, error: fullPurchaseError } = await supabase
        .from('full_purchase_orders')
        .select(`
          id,
          order_number,
          user_id,
          lottery_id,
          pickup_code,
          pickup_status,
          expires_at,
          claimed_at,
          created_at,
          pickup_point_id,
          metadata
        `)
        .in('pickup_status', ['PENDING_CLAIM', 'PENDING_PICKUP', 'EXPIRED'])
        .order('created_at', { ascending: false });

      if (fullPurchaseError) {
        console.error('加载全款购买记录失败:', fullPurchaseError);
      } else if (fullPurchaseOrders) {
        for (const order of fullPurchaseOrders) {
          // 获取用户信息
          let user = null;
          if (order.user_id) {
            const { data: userData } = await supabase
              .from('users')
              .select('id, phone_number, first_name, last_name, avatar_url')
              .eq('id', order.user_id)
              .single();
            user = userData;
          }

          // 获取抽奖信息
          let lottery = null;
          if (order.lottery_id) {
            const { data: lotteryData } = await supabase
              .from('lotteries')
              .select('id, title, title_i18n, image_url, original_price')
              .eq('id', order.lottery_id)
              .single();
            lottery = lotteryData;
          }

          // 获取自提点信息
          let pickupPoint = null;
          if (order.pickup_point_id) {
            const { data: pointData } = await supabase
              .from('pickup_points')
              .select('id, name, name_i18n, address, address_i18n, contact_phone')
              .eq('id', order.pickup_point_id)
              .single();
            pickupPoint = pointData;
          }

          // 从 metadata 中获取商品信息
          const metadata = order.metadata || {};
          const productTitle = metadata.product_title || getLocalizedText(lottery?.title_i18n) || lottery?.title || '全款购买商品';
          const productImage = metadata.product_image || lottery?.image_url || '';
          const productPrice = lottery?.original_price || 0;

          allPickups.push({
            id: order.id,
            type: 'full_purchase',
            prize_name: productTitle,
            prize_image: productImage,
            prize_value: productPrice,
            pickup_code: order.pickup_code,
            pickup_status: order.pickup_status || 'PENDING_CLAIM',
            expires_at: order.expires_at,
            claimed_at: order.claimed_at,
            created_at: order.created_at,
            user,
            pickup_point: pickupPoint,
            lottery,
          });
        }
      }

      // 按创建时间排序
      allPickups.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setPickups(allPickups);
    } catch (error) {
      console.error('加载数据失败:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPickups();
  }, []);

  // 获取本地化文本
  const getLocalizedText = (text: any): string => {
    if (!text) {return '';}
    if (typeof text === 'string') {return text;}
    return text.zh || text.ru || text.tg || '';
  };

  // 过滤数据
  const filteredPickups = pickups.filter((pickup) => {
    // 状态过滤
    if (filterStatus !== 'all' && pickup.pickup_status !== filterStatus) {
      return false;
    }
    // 类型过滤
    if (filterType !== 'all' && pickup.type !== filterType) {
      return false;
    }
    // 搜索过滤
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchName = pickup.prize_name.toLowerCase().includes(search);
      const matchCode = pickup.pickup_code?.toLowerCase().includes(search);
      const matchUser = pickup.user?.phone_number?.toLowerCase().includes(search) ||
        pickup.user?.first_name?.toLowerCase().includes(search) ||
        pickup.user?.phone_number?.includes(search);
      return matchName || matchCode || matchUser;
    }
    return true;
  });

  // 获取状态标签
  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { text: string; color: string }> = {
      'PENDING_CLAIM': { text: '待确认领取', color: 'bg-yellow-100 text-yellow-800' },
      'PENDING_PICKUP': { text: '待提货', color: 'bg-blue-100 text-blue-800' },
      'EXPIRED': { text: '已过期', color: 'bg-red-100 text-red-800' },
      'PICKED_UP': { text: '已提货', color: 'bg-green-100 text-green-800' },
    };
    const badge = statusMap[status] || { text: status, color: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  // 获取类型标签
  const getTypeBadge = (type: string) => {
    const typeMap: Record<string, { text: string; color: string }> = {
      'lottery': { text: '积分商城', color: 'bg-purple-100 text-purple-800' },
      'group_buy': { text: '拼团', color: 'bg-pink-100 text-pink-800' },
      'full_purchase': { text: '全款购买', color: 'bg-indigo-100 text-indigo-800' },
    };
    const badge = typeMap[type] || { text: type, color: 'bg-gray-100 text-gray-800' };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  // 格式化日期
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) {return '-';}
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 计算剩余天数
  const getRemainingDays = (expiresAt: string | null) => {
    if (!expiresAt) {return null;}
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  // 复制提货码
  const copyPickupCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('提货码已复制');
  };

  // 打开核销模态框
  const openVerifyModal = (pickup: PendingPickup) => {
    const allowedStatuses = ['PENDING_CLAIM', 'PENDING_PICKUP', 'PENDING', 'READY_FOR_PICKUP'];
    if (!allowedStatuses.includes(pickup.pickup_status)) {
      toast.error('只能核销待提货状态的奖品');
      return;
    }
    setSelectedPickup(pickup);
    setShowVerifyModal(true);
  };

  // 执行核销
  const handleVerify = async () => {
    if (!selectedPickup) {return;}
    if (!admin) {
      toast.error('未登录，请重新登录');
      return;
    }
    
    setVerifying(true);
    try {
      let tableName = 'prizes';
      if (selectedPickup.type === 'group_buy') {
        tableName = 'group_buy_results';
      } else if (selectedPickup.type === 'full_purchase') {
        tableName = 'full_purchase_orders';
      }
      
      const nowIso = new Date().toISOString();
      const updateData: any = {
        pickup_status: 'PICKED_UP',
        logistics_status: 'PICKED_UP',
        picked_up_at: nowIso,
        picked_up_by: admin.id,
      };
      // full_purchase_orders 额外更新 claimed_at
      if (selectedPickup.type === 'full_purchase') {
        updateData.claimed_at = nowIso;
      }

      // 使用原子性条件更新防止重复核销（TOCTOU 修复）
      const { data: updatedRows, error: updateError } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', selectedPickup.id)
        .in('pickup_status', ['PENDING_CLAIM', 'PENDING_PICKUP', 'PENDING', 'READY_FOR_PICKUP'])
        .select('id');

      if (updateError) {throw updateError;}

      if (!updatedRows || updatedRows.length === 0) {
        toast.error('核销失败：该提货码已被核销或状态已变更，请刷新后重试');
        setShowVerifyModal(false);
        setSelectedPickup(null);
        loadPickups();
        return;
      }

      toast.success('核销成功！');
      setShowVerifyModal(false);
      setSelectedPickup(null);
      loadPickups();
    } catch (error: any) {
      console.error('核销失败:', error);
      toast.error(error.message || '核销失败');
    } finally {
      setVerifying(false);
    }
  };

  // 统计数据
  const stats = {
    total: pickups.length,
    pendingClaim: pickups.filter(p => p.pickup_status === 'PENDING_CLAIM').length,
    pendingPickup: pickups.filter(p => p.pickup_status === 'PENDING_PICKUP').length,
    expired: pickups.filter(p => p.pickup_status === 'EXPIRED').length,
    lottery: pickups.filter(p => p.type === 'lottery').length,
    groupBuy: pickups.filter(p => p.type === 'group_buy').length,
    fullPurchase: pickups.filter(p => p.type === 'full_purchase').length,
  };

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">待核销列表</h1>
          <p className="text-gray-500 mt-1">查看和管理所有待核销的奖品</p>
        </div>
        <button
          onClick={loadPickups}
          disabled={loading}
          className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
        >
          <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          <span>刷新</span>
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">总计</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">待确认领取</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.pendingClaim}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">待提货</div>
          <div className="text-2xl font-bold text-blue-600">{stats.pendingPickup}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">已过期</div>
          <div className="text-2xl font-bold text-red-600">{stats.expired}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">积分商城</div>
          <div className="text-2xl font-bold text-purple-600">{stats.lottery}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">拼团</div>
          <div className="text-2xl font-bold text-pink-600">{stats.groupBuy}</div>
        </div>
      </div>

      {/* 过滤器 */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* 搜索框 */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索奖品名称、提货码、用户..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* 状态过滤 */}
          <div className="flex items-center space-x-2">
            <FunnelIcon className="w-5 h-5 text-gray-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="all">全部状态</option>
              <option value="PENDING_CLAIM">待确认领取</option>
              <option value="PENDING_PICKUP">待提货</option>
              <option value="EXPIRED">已过期</option>
            </select>
          </div>

          {/* 类型过滤 */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="all">全部类型</option>
            <option value="lottery">积分商城</option>
            <option value="group_buy">拼团</option>
          </select>
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mx-auto"></div>
          <p className="mt-4 text-gray-500">加载中...</p>
        </div>
      ) : filteredPickups.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-lg shadow">
          <GiftIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">暂无待核销记录</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  奖品信息
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  用户
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  提货码
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  自提点
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  有效期
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPickups.map((pickup) => {
                const remainingDays = getRemainingDays(pickup.expires_at);
                return (
                  <tr key={`${pickup.type}-${pickup.id}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        {pickup.prize_image ? (
                          <img
                            src={pickup.prize_image}
                            alt={pickup.prize_name}
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                            <GiftIcon className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900 max-w-[200px] truncate">
                            {pickup.prize_name}
                          </div>
                          <div className="flex items-center space-x-2 mt-1">
                            {getTypeBadge(pickup.type)}
                            <span className="text-sm text-gray-500">¥{pickup.prize_value}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {pickup.user ? (
                        <div className="flex items-center space-x-2">
                          {pickup.user.avatar_url ? (
                            <img
                              src={pickup.user.avatar_url}
                              alt=""
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                              <UserIcon className="w-4 h-4 text-gray-400" />
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {pickup.user.first_name || pickup.user.phone_number || '未知用户'}
                            </div>
                            <div className="text-xs text-gray-500">
                              ID: {pickup.user.phone_number}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {pickup.pickup_code ? (
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-lg font-bold text-purple-600">
                            {pickup.pickup_code}
                          </span>
                          <button
                            onClick={() => copyPickupCode(pickup.pickup_code!)}
                            className="p-1 hover:bg-gray-100 rounded"
                            title="复制"
                          >
                            <ClipboardDocumentIcon className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400">未生成</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {pickup.pickup_point ? (
                        <div className="flex items-center space-x-1">
                          <MapPinIcon className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-900">
                            {getLocalizedText(pickup.pickup_point.name_i18n) || pickup.pickup_point.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">未选择</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(pickup.pickup_status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {pickup.expires_at ? (
                        <div>
                          <div className="text-sm text-gray-900">
                            {formatDate(pickup.expires_at).split(' ')[0]}
                          </div>
                          {remainingDays !== null && (
                            <div className={`text-xs ${remainingDays <= 3 ? 'text-red-500' : remainingDays <= 7 ? 'text-yellow-500' : 'text-gray-500'}`}>
                              {remainingDays > 0 ? `剩余 ${remainingDays} 天` : '已过期'}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {pickup.pickup_status === 'PENDING_PICKUP' && (
                        <button
                          onClick={() => openVerifyModal(pickup)}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition"
                        >
                          <CheckCircleIcon className="w-4 h-4" />
                          <span>核销</span>
                        </button>
                      )}
                      {pickup.pickup_status === 'PENDING_CLAIM' && (
                        <span className="text-sm text-gray-400">等待用户确认</span>
                      )}
                      {pickup.pickup_status === 'EXPIRED' && (
                        <span className="text-sm text-red-500">已过期</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 核销确认模态框 */}
      {showVerifyModal && selectedPickup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold">确认核销</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center space-x-4">
                {selectedPickup.prize_image ? (
                  <img
                    src={selectedPickup.prize_image}
                    alt={selectedPickup.prize_name}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center">
                    <GiftIcon className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                <div>
                  <div className="font-bold text-gray-900">{selectedPickup.prize_name}</div>
                  <div className="text-sm text-gray-500">¥{selectedPickup.prize_value}</div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">提货码</span>
                  <span className="font-mono font-bold text-purple-600">{selectedPickup.pickup_code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">用户</span>
                  <span>{selectedPickup.user?.first_name || selectedPickup.user?.phone_number || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">自提点</span>
                  <span>{selectedPickup.pickup_point ? getLocalizedText(selectedPickup.pickup_point.name_i18n) || selectedPickup.pickup_point.name : '-'}</span>
                </div>
              </div>

              <div className="bg-yellow-50 rounded-lg p-4 text-sm text-yellow-800">
                <p>确认核销后，该奖品状态将变为"已提货"，此操作不可撤销。</p>
              </div>
            </div>
            <div className="p-6 border-t flex space-x-3">
              <button
                onClick={() => {
                  setShowVerifyModal(false);
                  setSelectedPickup(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                取消
              </button>
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                {verifying ? '核销中...' : '确认核销'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
