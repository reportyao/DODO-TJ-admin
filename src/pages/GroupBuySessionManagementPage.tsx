import React, { useState, useEffect } from 'react';
import { Users, Clock, Trophy, RefreshCw } from 'lucide-react';
import { useSupabase } from '@/contexts/SupabaseContext';
import toast from 'react-hot-toast';

interface GroupBuySession {
  id: string;
  session_code: string;
  product_id: string;
  current_participants: number;
  max_participants: number;
  status: string;
  created_at: string;
  expires_at: string;
  winner_id: string | null;
  product: {
    title: { zh: string; ru: string; tg: string } | null;
    name: string | null;
    name_i18n: { zh: string; ru: string; tg: string } | null;
    image_url: string | null;
    image_urls: string[] | null;
    group_price: number;
  } | null;
  orders: Array<{
    id: string;
    user_id: string;
    amount: number;
    created_at: string;
    user: {
      id: string;
      first_name: string | null;
      last_name: string | null;
    } | null;
  }>;
}

// 获取产品标题（兼容多种字段）
const getProductTitle = (product: GroupBuySession['product']): string => {
  if (!product) {return '未知商品';}
  // 优先使用 title.zh，然后是 name_i18n.zh，最后是 name
  if (product.title?.zh) {return product.title.zh;}
  if (product.name_i18n?.zh) {return product.name_i18n.zh;}
  if (product.name) {return product.name;}
  return '未知商品';
};

// 获取产品图片（兼容多种字段）
const getProductImage = (product: GroupBuySession['product']): string => {
  if (!product) {return '';}
  // 优先使用 image_url，然后是 image_urls[0]
  if (product.image_url) {return product.image_url;}
  if (product.image_urls && product.image_urls.length > 0) {return product.image_urls[0];}
  return '';
};

// 获取用户显示名称
const getUserDisplayName = (user: { phone_number: string | null; first_name: string | null; last_name: string | null } | null | undefined, userId: string): string => {
  if (!user) {return `用户 ${userId.slice(0, 8)}...`;}
  // 优先使用 phone_number，然后是 first_name + last_name
  if (user.phone_number) {return user.phone_number;}
  if (user.first_name || user.last_name) {
    return `${user.first_name || ''} ${user.last_name || ''}`.trim();
  }
  return `用户 ${userId.slice(0, 8)}...`;
};

export default function GroupBuySessionManagementPage() {
  const { supabase } = useSupabase();
  const [sessions, setSessions] = useState<GroupBuySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'success' | 'timeout'>('active');
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    success: 0,
    timeout: 0,
  });

  useEffect(() => {
    fetchSessions();
    fetchStats();
  }, [filter]);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('group_buy_sessions')
        .select(`
          *,
          product:group_buy_products!product_id(title, name, name_i18n, image_url, image_urls, group_price),
          orders:group_buy_orders!session_id(id, user_id, amount, created_at, user:users!user_id(id, phone_number, first_name, last_name))
        `)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter.toUpperCase());
      }

      const { data, error } = await query;

      if (error) {throw error;}
      setSessions(data || []);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      toast.error('获取拼团会话失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase
        .from('group_buy_sessions')
        .select('status');

      if (error) {throw error;}

      const stats = {
        total: data.length,
        active: data.filter((s) => s.status === 'ACTIVE').length,
        success: data.filter((s) => s.status === 'SUCCESS').length,
        timeout: data.filter((s) => s.status === 'TIMEOUT').length,
      };

      setStats(stats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      ACTIVE: { label: '进行中', className: 'bg-green-100 text-green-700' },
      SUCCESS: { label: '已完成', className: 'bg-blue-100 text-blue-700' },
      TIMEOUT: { label: '已超时', className: 'bg-gray-100 text-gray-700' },
    };

    const config = statusMap[status] || { label: status, className: 'bg-gray-100 text-gray-700' };

    return (
      <span className={`px-2 py-1 rounded text-xs font-bold ${config.className}`}>
        {config.label}
      </span>
    );
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) {return '已过期';}

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}小时${minutes}分钟`;
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">拼团会话管理</h1>
        <button
          onClick={() => {
            fetchSessions();
            fetchStats();
          }}
          className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
        >
          <RefreshCw className="w-5 h-5" />
          刷新
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">总会话数</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-green-50 rounded-lg shadow p-4">
          <div className="text-sm text-green-600 mb-1">进行中</div>
          <div className="text-2xl font-bold text-green-700">{stats.active}</div>
        </div>
        <div className="bg-blue-50 rounded-lg shadow p-4">
          <div className="text-sm text-blue-600 mb-1">已完成</div>
          <div className="text-2xl font-bold text-blue-700">{stats.success}</div>
        </div>
        <div className="bg-gray-50 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-1">已超时</div>
          <div className="text-2xl font-bold text-gray-700">{stats.timeout}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'all', label: '全部' },
          { key: 'active', label: '进行中' },
          { key: 'success', label: '已完成' },
          { key: 'timeout', label: '已超时' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === tab.key
                ? 'bg-orange-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sessions List */}
      {loading ? (
        <div className="text-center py-12">加载中...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">暂无拼团会话</div>
      ) : (
        <div className="space-y-4">
          {(sessions || []).map((session) => {
            const productTitle = getProductTitle(session.product);
            const productImage = getProductImage(session.product);
            // 使用订单的实际金额作为人均价格
            const pricePerPerson = session.orders && session.orders.length > 0 
              ? session.orders[0].amount 
              : (session.product?.group_price || 0);
            
            return (
              <div key={session.id} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex gap-4">
                  {/* Product Image */}
                  {productImage ? (
                    <img
                      src={productImage}
                      alt={productTitle}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400">
                      无图片
                    </div>
                  )}

                  {/* Session Info */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-bold text-lg">{productTitle}</h3>
                        <p className="text-sm text-gray-600">会话编号: {session.session_code || session.id.slice(0, 8)}</p>
                      </div>
                      {getStatusBadge(session.status)}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <div className="text-xs text-gray-600 mb-1">参与人数</div>
                        <div className="flex items-center gap-1 font-bold">
                          <Users className="w-4 h-4" />
                          {session.current_participants}/{session.max_participants || session.current_participants}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">人均价格</div>
                        <div className="font-bold text-orange-600">
                          ₽{pricePerPerson}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">创建时间</div>
                        <div className="text-sm">
                          {new Date(session.created_at).toLocaleString('zh-CN')}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">剩余时间</div>
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="w-4 h-4" />
                          {getTimeRemaining(session.expires_at)}
                        </div>
                      </div>
                    </div>

                    {/* Participants */}
                    {session.orders && session.orders.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-gray-700 mb-2">参与者:</div>
                        <div className="flex flex-wrap gap-2">
                          {(session.orders || []).map((order, index) => (
                            <div
                              key={order.id}
                              className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                                session.winner_id === order.user_id
                                  ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-400'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {session.winner_id === order.user_id && (
                                <Trophy className="w-4 h-4" />
                              )}
                              <span className="font-medium">{index + 1}.</span>
                              <span>{getUserDisplayName(order.user, order.user_id)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
