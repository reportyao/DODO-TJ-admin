import { useState, useEffect } from 'react';
import { Eye, TrendingUp, DollarSign, Package, Search, Ban, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import toast from 'react-hot-toast';

interface Resale {
  id: string;
  ticket_id: string;
  seller_id: string;
  buyer_id: string | null;
  lottery_id: string;
  resale_price: number;
  original_price: number;
  status: string;
  created_at: string;
  updated_at: string;
  sold_at: string | null;
  seller?: { phone_number: string; first_name: string };
  buyer?: { phone_number: string; first_name: string };
  lotteries?: { title: string; title_i18n?: { zh?: string }; image_url: string };
  entry?: { numbers: string };
}

const PAGE_SIZE = 20;

const STATUS_MAP: Record<string, string> = {
  on_sale: 'ACTIVE',
  sold: 'SOLD',
  cancelled: 'CANCELLED',
};

export default function ResaleManagementPage() {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();
  const [resales, setResales] = useState<Resale[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'on_sale' | 'sold' | 'cancelled'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, onSale: 0, sold: 0, totalRevenue: 0, avgDiscount: 0 });
  const [cancelTarget, setCancelTarget] = useState<Resale | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchResales();
  }, [filter, currentPage]);

  // 使用数据库端聚合获取统计数据，避免全量加载
  const fetchStats = async () => {
    try {
      const [totalRes, onSaleRes, soldRes, revenueRes] = await Promise.all([
        supabase.from('resales').select('id', { count: 'exact', head: true }),
        supabase.from('resales').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
        supabase.from('resales').select('id', { count: 'exact', head: true }).eq('status', 'SOLD'),
        supabase.from('resales').select('resale_price').eq('status', 'SOLD').limit(10000),
      ]);
      const totalRevenue = (revenueRes.data || []).reduce((s, r) => s + (r.resale_price || 0), 0);
      setStats({
        total: totalRes.count || 0,
        onSale: onSaleRes.count || 0,
        sold: soldRes.count || 0,
        totalRevenue,
        avgDiscount: 0,
      });
    } catch (err: any) {
      console.error('fetchStats error:', err);
    }
  };

  const fetchResales = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * PAGE_SIZE;
      let query = supabase
        .from('resales')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (filter !== 'all') {
        query = query.eq('status', STATUS_MAP[filter] || filter.toUpperCase());
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const resaleData = data || [];
      setTotalCount(count || 0);

      if (resaleData.length > 0) {
        const sellerIds = [...new Set(resaleData.map(r => r.seller_id).filter(Boolean))];
        const buyerIds = [...new Set(resaleData.map(r => r.buyer_id).filter(Boolean))];
        const lotteryIds = [...new Set(resaleData.map(r => r.lottery_id).filter(Boolean))];
        const ticketIds = [...new Set(resaleData.map(r => r.ticket_id).filter(Boolean))];

        const [sellersRes, buyersRes, lotteriesRes, entriesRes] = await Promise.all([
          supabase.from('users').select('id, phone_number, first_name').in('id', sellerIds),
          buyerIds.length > 0 ? supabase.from('users').select('id, phone_number, first_name').in('id', buyerIds) : { data: [] },
          supabase.from('lotteries').select('id, title, title_i18n, image_url').in('id', lotteryIds),
          supabase.from('lottery_entries').select('id, numbers').in('id', ticketIds),
        ]);

        resaleData.forEach((resale: any) => {
          resale.seller = sellersRes.data?.find(s => s.id === resale.seller_id);
          resale.buyer = buyersRes.data?.find(b => b.id === resale.buyer_id);
          resale.lotteries = lotteriesRes.data?.find(l => l.id === resale.lottery_id);
          resale.entry = entriesRes.data?.find(e => e.id === resale.ticket_id);
        });
      }

      setResales(resaleData);
    } catch (error: any) {
      toast.error('加载转售列表失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForceCancel = async () => {
    if (!cancelTarget || !admin) return;
    setCancelling(true);
    try {
      const { error } = await supabase
        .from('resales')
        .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
        .eq('id', cancelTarget.id)
        .eq('status', 'ACTIVE'); // 原子性条件更新，防止重复操作
      if (error) throw error;
      toast.success('已强制下架该转售');
      setCancelTarget(null);
      fetchResales();
      fetchStats();
    } catch (err: any) {
      toast.error('操作失败: ' + err.message);
    } finally {
      setCancelling(false);
    }
  };

  const filteredResales = resales.filter(resale => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    const title = resale.lotteries?.title_i18n?.zh || resale.lotteries?.title || '';
    return (
      resale.seller?.phone_number?.toLowerCase().includes(s) ||
      resale.buyer?.phone_number?.toLowerCase().includes(s) ||
      title.toLowerCase().includes(s)
    );
  });

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getStatusBadge = (status: string) => {
    const cfg: Record<string, { color: string; text: string }> = {
      ACTIVE: { color: 'bg-green-100 text-green-800', text: '在售' },
      SOLD: { color: 'bg-blue-100 text-blue-800', text: '已售出' },
      CANCELLED: { color: 'bg-gray-100 text-gray-800', text: '已取消' },
    };
    const c = cfg[status] || { color: 'bg-gray-100 text-gray-800', text: status };
    return <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${c.color}`}>{c.text}</span>;
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">转售监控</h1>
          <p className="mt-1 text-sm text-gray-500">查看和监控用户的中奖商品转售情况（用户可直接发布，管理员可强制下架）</p>
        </div>
        <button onClick={() => { fetchResales(); fetchStats(); }} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> 刷新
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '总转售数', value: stats.total, icon: Package, color: 'text-blue-500' },
          { label: '在售中', value: stats.onSale, icon: TrendingUp, color: 'text-green-500' },
          { label: '已售出', value: stats.sold, icon: Eye, color: 'text-blue-500' },
          { label: '总交易额', value: `${stats.totalRevenue.toFixed(2)} TJS`, icon: DollarSign, color: 'text-purple-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
            <Icon className={`w-8 h-8 ${color}`} />
            <div>
              <div className="text-sm text-gray-500">{label}</div>
              <div className="text-xl font-bold text-gray-900">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 筛选和搜索 */}
      <div className="mb-4 flex flex-col sm:flex-row gap-4">
        <div className="flex gap-2 flex-wrap">
          {(['all', 'on_sale', 'sold', 'cancelled'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setCurrentPage(1); }}
              className={`px-4 py-2 rounded-md text-sm ${filter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
            >
              {f === 'all' ? '全部' : f === 'on_sale' ? '在售中' : f === 'sold' ? '已售出' : '已取消'}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="搜索用户手机号或商品名称..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* 转售列表 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-500">加载中...</div>
        ) : filteredResales.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">暂无转售记录</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['商品信息', '卖家', '买家', '价格', '状态', '时间', '操作'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredResales.map(resale => (
                <tr key={resale.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {resale.lotteries?.title_i18n?.zh || resale.lotteries?.title || '未知商品'}
                    </div>
                    <div className="text-xs text-gray-500">票号: {resale.entry?.numbers || resale.ticket_id.slice(0, 8)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{resale.seller?.phone_number || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{resale.buyer?.phone_number || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium">{resale.resale_price} TJS</div>
                    {resale.original_price > 0 && (
                      <div className="text-xs text-gray-500">原价: {resale.original_price} TJS</div>
                    )}
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(resale.status)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(resale.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-4 py-3">
                    {resale.status === 'ACTIVE' && (
                      <button
                        onClick={() => setCancelTarget(resale)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50"
                      >
                        <Ban className="w-3 h-3" /> 强制下架
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-500">共 {totalCount} 条记录，第 {currentPage}/{totalPages} 页</div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 强制下架确认弹窗 */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-2">确认强制下架</h3>
            <p className="text-sm text-gray-600 mb-4">
              确定要强制下架 <strong>{cancelTarget.seller?.phone_number}</strong> 发布的转售商品吗？
              此操作不可撤销，买家将无法购买该商品。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCancelTarget(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleForceCancel}
                disabled={cancelling}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? '处理中...' : '确认下架'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
