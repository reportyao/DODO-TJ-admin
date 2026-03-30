import React, { useState } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
  GiftIcon,
  MapPinIcon,
  ClockIcon,
  QrCodeIcon,
} from '@heroicons/react/24/outline';

interface PrizeInfo {
  id: string;
  prize_name: string;
  prize_image: string;
  prize_value: number;
  pickup_code: string;
  pickup_status: string;
  expires_at: string;
  claimed_at: string;
  source_type: 'lottery' | 'group_buy' | 'full_purchase';
  user: {
    id: string;
    phone_number: string;
    first_name: string;
    last_name: string;
    avatar_url: string;
  } | null;
  lottery: {
    title: string;
    title_i18n: any;
  } | null;
  pickup_point: {
    id: string;
    name: string;
    name_i18n: any;
    address: string;
    address_i18n: any;
  } | null;
}

// 获取本地化文本
const getLocalizedText = (text: any): string => {
  if (!text) {return '';}
  if (typeof text === 'string') {return text;}
  return text.zh || text.ru || text.tg || '';
};

const PickupVerificationPage: React.FC = () => {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();
  const [pickupCode, setPickupCode] = useState('');
  const [prizeInfo, setPrizeInfo] = useState<PrizeInfo | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // 搜索提货码
  const handleSearch = async () => {
    if (!pickupCode || pickupCode.length < 6) {
      toast.error('请输入有效的提货码');
      return;
    }

    setIsSearching(true);
    setPrizeInfo(null);

    try {
      console.log('Searching for pickup code:', pickupCode);

      // 1. 首先查询 prizes 表（积分商城）
      const { data: prizes, error: prizeError } = await supabase
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
          user_id,
          lottery_id,
          pickup_point_id
        `)
        .eq('pickup_code', pickupCode);

      if (!prizeError && prizes && prizes.length > 0) {
        const prize = prizes[0];
        console.log('Found in prizes:', prize);
        
        // 获取用户信息
        let userInfo = null;
        if (prize.user_id) {
          const { data: userData } = await supabase
            .from('users')
            .select('id, phone_number, first_name, last_name, avatar_url')
            .eq('id', prize.user_id)
            .maybeSingle();
          userInfo = userData;
        }

        // 获取抽奖信息
        let lotteryInfo = null;
        if (prize.lottery_id) {
          const { data: lotteryData } = await supabase
            .from('lotteries')
            .select('title, title_i18n, image_url, original_price')
            .eq('id', prize.lottery_id)
            .maybeSingle();
          lotteryInfo = lotteryData;
        }

        // 获取自提点信息
        let pickupPointInfo = null;
        if (prize.pickup_point_id) {
          const { data: pointData } = await supabase
            .from('pickup_points')
            .select('id, name, name_i18n, address, address_i18n')
            .eq('id', prize.pickup_point_id)
            .maybeSingle();
          pickupPointInfo = pointData;
        }

        setPrizeInfo({
          id: prize.id,
          prize_name: prize.prize_name || getLocalizedText(lotteryInfo?.title_i18n) || lotteryInfo?.title || '积分商城奖品',
          prize_image: prize.prize_image || lotteryInfo?.image_url || '',
          prize_value: prize.prize_value || lotteryInfo?.original_price || 0,
          pickup_code: prize.pickup_code,
          pickup_status: prize.pickup_status || 'PENDING_CLAIM',
          expires_at: prize.expires_at,
          claimed_at: prize.claimed_at,
          source_type: 'lottery',
          user: userInfo,
          lottery: lotteryInfo,
          pickup_point: pickupPointInfo,
        });
        return;
      }

      // 2. 尝试查询 group_buy_results 表（拼团）
      const { data: groupBuyResults, error: groupBuyError } = await supabase
        .from('group_buy_results')
        .select(`
          id,
          pickup_code,
          pickup_status,
          logistics_status,
          expires_at,
          claimed_at,
          winner_id,
          product_id,
          session_id,
          pickup_point_id
        `)
        .eq('pickup_code', pickupCode);

      if (!groupBuyError && groupBuyResults && groupBuyResults.length > 0) {
        const groupBuyPrize = groupBuyResults[0];
        console.log('Found in group_buy_results:', groupBuyPrize);

        // 获取商品信息
        let productInfo = null;
        if (groupBuyPrize.product_id) {
          const { data: productData } = await supabase
            .from('group_buy_products')
            .select('name, title, image_url, original_price, group_price')
            .eq('id', groupBuyPrize.product_id)
            .maybeSingle();
          productInfo = productData;
        }

        // 获取用户信息
        let userInfo = null;
        if (groupBuyPrize.winner_id) {
          const { data: userData } = await supabase
            .from('users')
            .select('id, phone_number, first_name, last_name, avatar_url')
            .eq('id', groupBuyPrize.winner_id)
            .maybeSingle();
          userInfo = userData;
        }

        // 获取自提点信息
        let pickupPointInfo = null;
        if (groupBuyPrize.pickup_point_id) {
          const { data: pointData } = await supabase
            .from('pickup_points')
            .select('id, name, name_i18n, address, address_i18n')
            .eq('id', groupBuyPrize.pickup_point_id)
            .maybeSingle();
          pickupPointInfo = pointData;
        }

        setPrizeInfo({
          id: groupBuyPrize.id,
          prize_name: productInfo?.name || getLocalizedText(productInfo?.title) || '拼团商品',
          prize_image: productInfo?.image_url || '',
          prize_value: productInfo?.group_price || productInfo?.original_price || 0,
          pickup_code: groupBuyPrize.pickup_code,
          pickup_status: groupBuyPrize.pickup_status || groupBuyPrize.logistics_status || 'PENDING_CLAIM',
          expires_at: groupBuyPrize.expires_at,
          claimed_at: groupBuyPrize.claimed_at,
          source_type: 'group_buy',
          user: userInfo,
          lottery: { title: '拼团商品', title_i18n: { zh: '拼团商品', ru: 'Групповая покупка', tg: 'Ҳаридҳои гурӯҳӣ' } },
          pickup_point: pickupPointInfo,
        });
        return;
      }

      // 3. 尝试查询 full_purchase_orders 表（全款购买）
      const { data: fullPurchaseOrders, error: fullPurchaseError } = await supabase
        .from('full_purchase_orders')
        .select(`
          id,
          order_number,
          pickup_code,
          pickup_status,
          logistics_status,
          expires_at,
          claimed_at,
          user_id,
          lottery_id,
          pickup_point_id,
          metadata
        `)
        .eq('pickup_code', pickupCode);

      if (!fullPurchaseError && fullPurchaseOrders && fullPurchaseOrders.length > 0) {
        const fullPurchaseOrder = fullPurchaseOrders[0];
        console.log('Found in full_purchase_orders:', fullPurchaseOrder);

        // 获取用户信息
        let userInfo = null;
        if (fullPurchaseOrder.user_id) {
          const { data: userData } = await supabase
            .from('users')
            .select('id, phone_number, first_name, last_name, avatar_url')
            .eq('id', fullPurchaseOrder.user_id)
            .maybeSingle();
          userInfo = userData;
        }

        // 获取抽奖信息
        let lotteryInfo = null;
        if (fullPurchaseOrder.lottery_id) {
          const { data: lotteryData } = await supabase
            .from('lotteries')
            .select('title, title_i18n, image_url, original_price')
            .eq('id', fullPurchaseOrder.lottery_id)
            .maybeSingle();
          lotteryInfo = lotteryData;
        }

        // 获取自提点信息
        let pickupPointInfo = null;
        if (fullPurchaseOrder.pickup_point_id) {
          const { data: pointData } = await supabase
            .from('pickup_points')
            .select('id, name, name_i18n, address, address_i18n')
            .eq('id', fullPurchaseOrder.pickup_point_id)
            .maybeSingle();
          pickupPointInfo = pointData;
        }

        // 从 metadata 中获取商品信息
        const metadata = fullPurchaseOrder.metadata || {};
        const productTitle = metadata.product_title || getLocalizedText(lotteryInfo?.title_i18n) || lotteryInfo?.title || '全款购买商品';
        const productImage = metadata.product_image || lotteryInfo?.image_url || '';
        const productPrice = lotteryInfo?.original_price || 0;

        setPrizeInfo({
          id: fullPurchaseOrder.id,
          prize_name: productTitle,
          prize_image: productImage,
          prize_value: productPrice,
          pickup_code: fullPurchaseOrder.pickup_code,
          pickup_status: fullPurchaseOrder.pickup_status || fullPurchaseOrder.logistics_status || 'PENDING_CLAIM',
          expires_at: fullPurchaseOrder.expires_at,
          claimed_at: fullPurchaseOrder.claimed_at,
          source_type: 'full_purchase',
          user: userInfo,
          lottery: lotteryInfo,
          pickup_point: pickupPointInfo,
        });
        return;
      }

      toast.error('未找到该提货码对应的奖品');

    } catch (error: any) {
      console.error('Search error:', error);
      toast.error('查询失败，请重试');
    } finally {
      setIsSearching(false);
    }
  };

  // 确认核销
  const handleVerify = async () => {
    if (!prizeInfo) {return;}

    // 检查状态 - 允许多种待提货状态
    // 【BUG修复】允许 null/undefined 状态的核销（历史数据兼容）
    const allowedStatuses = ['PENDING_PICKUP', 'PENDING', 'READY_FOR_PICKUP', 'PENDING_CLAIM'];
    if (prizeInfo.pickup_status && !allowedStatuses.includes(prizeInfo.pickup_status)) {
      toast.error('该奖品状态不允许核销: ' + prizeInfo.pickup_status);
      return;
    }

    // 检查是否过期
    if (prizeInfo.expires_at) {
      const expiresAt = new Date(prizeInfo.expires_at);
      const now = new Date();
      if (expiresAt < now) {
        toast.error('该提货码已过期，请联系用户延期');
        return;
      }
    }

    setIsVerifying(true);

    try {
      if (!admin) {throw new Error('未登录');}
      const adminId = admin.id;

      // 根据来源类型确定表名
      let tableName = 'prizes';
      if (prizeInfo.source_type === 'group_buy') {
        tableName = 'group_buy_results';
      } else if (prizeInfo.source_type === 'full_purchase') {
        tableName = 'full_purchase_orders';
      }
      
      // 所有表都更新相同的字段
      const nowIso = new Date().toISOString();
      const updateData: any = {
        pickup_status: 'PICKED_UP',
        logistics_status: 'PICKED_UP',  // 同时更新logistics_status
        picked_up_at: nowIso,
        picked_up_by: adminId,
      };
      // 【R18修复】full_purchase_orders 有 claimed_at 字段，核销时同步更新
      if (prizeInfo.source_type === 'full_purchase') {
        updateData.claimed_at = nowIso;
      }
      
      // 使用原子性条件更新防止重复核销（TOCTOU 修复）
      // 只有当 pickup_status 仍为待核销状态时才更新，防止并发重复核销
      // 【BUG修复】兼容 pickup_status 为 null 的历史数据（update-batch-status 未同步设置 pickup_status）
      const { data: updatedRows, error: updateError } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', prizeInfo.id)
        .or('pickup_status.in.(PENDING_CLAIM,PENDING_PICKUP,PENDING,READY_FOR_PICKUP),pickup_status.is.null')
        .select('id');

      if (updateError) {throw updateError;}

      // 检查是否真的更新了记录（若为 0 行则说明已被其他管理员核销）
      if (!updatedRows || updatedRows.length === 0) {
        toast.error('核销失败：该提货码已被核销或状态已变更，请刷新后重试');
        setPickupCode('');
        setPrizeInfo(null);
        return;
      }

      // 写入核销日志（补充：原来缺少此步骤）
      try {
        await supabase.from('pickup_logs').insert({
          prize_id: prizeInfo.id,
          pickup_code: prizeInfo.pickup_code,
          pickup_point_id: prizeInfo.pickup_point?.id || null,
          operator_id: adminId,
          operation_type: 'ADMIN_VERIFY',
          order_type: prizeInfo.source_type,
          source: 'admin',
          notes: '管理后台核销',
        });
      } catch (logErr) {
        console.warn('[PickupVerification] 写入核销日志失败（不影响核销结果）:', logErr);
      }

      toast.success('核销成功！');
      setPickupCode('');
      setPrizeInfo(null);
    } catch (error: any) {
      console.error('Verify error:', error);
      toast.error(error.message || '核销失败，请重试');
    } finally {
      setIsVerifying(false);
    }
  };

  // 取消操作
  const handleCancel = () => {
    setPickupCode('');
    setPrizeInfo(null);
  };

  // 计算剩余天数
  const getRemainingDays = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">自提核销</h1>
          <p className="text-gray-600">扫描或输入用户的提货码进行核销</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">提货码</label>
              <div className="relative">
                <input
                  type="text"
                  value={pickupCode}
                  onChange={(e) => setPickupCode(e.target.value.toUpperCase())}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="请输入6位提货码"
                  className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg font-mono"
                  maxLength={6}
                />
                <QrCodeIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>
            <div className="pt-7">
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="px-8 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 focus:ring-4 focus:ring-purple-200 transition-all disabled:opacity-50 flex items-center"
              >
                {isSearching ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                ) : (
                  <MagnifyingGlassIcon className="w-5 h-5 mr-2" />
                )}
                查询
              </button>
            </div>
          </div>
        </div>

        {prizeInfo && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-50 rounded-lg">
                  <GiftIcon className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">奖品信息</h2>
                  <p className="text-sm text-gray-500">
                    来源: {prizeInfo.source_type === 'group_buy' ? '拼团' : prizeInfo.source_type === 'full_purchase' ? '全款购买' : '积分商城'}
                  </p>
                </div>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                (prizeInfo.pickup_status === 'PENDING_PICKUP' || prizeInfo.pickup_status === 'PENDING' || prizeInfo.pickup_status === 'READY_FOR_PICKUP') ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-600'
              }`}>
                {(prizeInfo.pickup_status === 'PENDING_PICKUP' || prizeInfo.pickup_status === 'PENDING' || prizeInfo.pickup_status === 'READY_FOR_PICKUP') ? '待提货' : prizeInfo.pickup_status}
              </div>
            </div>

            <div className="p-6">
              <div className="flex space-x-6">
                <div className="w-32 h-32 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                  {prizeInfo.prize_image ? (
                    <img src={prizeInfo.prize_image} alt={prizeInfo.prize_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <GiftIcon className="w-12 h-12" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{prizeInfo.prize_name}</h3>
                    <p className="text-2xl font-bold text-purple-600 mt-1">
                      {prizeInfo.prize_value} <span className="text-sm font-normal text-gray-500">TJS</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2 text-gray-600">
                      <UserIcon className="w-4 h-4" />
                      <span className="text-sm">
                        用户: {prizeInfo.user?.first_name || ''} {prizeInfo.user?.last_name || ''} 
                        {prizeInfo.user?.phone_number ? ` (${prizeInfo.user.phone_number})` : ''}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-gray-600">
                      <MapPinIcon className="w-4 h-4" />
                      <span className="text-sm">自提点: {getLocalizedText(prizeInfo.pickup_point?.name_i18n) || prizeInfo.pickup_point?.name || '未设置'}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-gray-600">
                      <ClockIcon className="w-4 h-4" />
                      <span className="text-sm">
                        有效期至: {prizeInfo.expires_at ? new Date(prizeInfo.expires_at).toLocaleString() : '永久有效'}
                        {prizeInfo.expires_at && (
                          <span className={`ml-2 font-medium ${getRemainingDays(prizeInfo.expires_at) <= 3 ? 'text-red-500' : 'text-green-500'}`}>
                            (剩余 {getRemainingDays(prizeInfo.expires_at)} 天)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex space-x-4">
                <button
                  onClick={handleVerify}
                  disabled={isVerifying || !['PENDING_PICKUP', 'PENDING', 'READY_FOR_PICKUP', 'PENDING_CLAIM'].includes(prizeInfo.pickup_status)}
                  className="flex-1 py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 focus:ring-4 focus:ring-green-200 transition-all disabled:opacity-50 flex items-center justify-center"
                >
                  {isVerifying ? (
                    <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  ) : (
                    <CheckCircleIcon className="w-6 h-6 mr-2" />
                  )}
                  确认核销
                </button>
                <button
                  onClick={handleCancel}
                  className="px-8 py-4 bg-gray-100 text-gray-600 rounded-xl font-bold text-lg hover:bg-gray-200 transition-all flex items-center justify-center"
                >
                  <XCircleIcon className="w-6 h-6 mr-2" />
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PickupVerificationPage;
