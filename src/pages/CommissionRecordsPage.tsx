import React, { useState, useEffect } from 'react';
import { Search, Download, DollarSign, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import toast from 'react-hot-toast';

// 与数据库实际字段一致的接口
interface CommissionRecord {
  id: string;
  user_id: string;           // 受益人（上级）
  from_user_id: string;      // 来源用户（下级购买者）
  level: number;             // 1=一级, 2=二级, 3=三级
  commission_rate: number;   // 佣金比例 0.03
  order_amount: number;      // 触发佣金的订单金额
  commission_amount: number; // 佣金金额
  order_id: string | null;
  status: string;            // 'settled' | 'pending'
  created_at: string;
  updated_at: string;
  // 关联用户信息（前端 join）
  beneficiary?: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    phone_number: string | null;
  };
  from_user?: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    phone_number: string | null;
  };
}

export default function CommissionRecordsPage() {
  const { supabase } = useSupabase();
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    loadRecords();
  }, [currentPage, statusFilter, levelFilter]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('commissions')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (levelFilter !== 'all') {
        query = query.eq('level', parseInt(levelFilter));
      }

      const { data: commissionsData, error, count } = await query;
      if (error) { throw error; }

      // 收集所有需要查询的用户 ID
      const userIds = new Set<string>();
      commissionsData?.forEach(c => {
        if (c.user_id) { userIds.add(c.user_id); }
        if (c.from_user_id) { userIds.add(c.from_user_id); }
      });

      let usersData: any[] = [];
      if (userIds.size > 0) {
        const { data: ud } = await supabase
          .from('users')
          .select('id, display_name, first_name, phone_number')
          .in('id', Array.from(userIds));
        usersData = ud || [];
      }

      const recordsWithUsers = (commissionsData || []).map(commission => ({
        ...commission,
        beneficiary: usersData.find(u => u.id === commission.user_id) || null,
        from_user: usersData.find(u => u.id === commission.from_user_id) || null,
      }));

      setRecords(recordsWithUsers);
      setTotalCount(count || 0);
    } catch (error: any) {
      console.error('加载返利记录失败:', error);
      toast.error('加载失败: ' + (error?.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      loadRecords();
      return;
    }
    setLoading(true);
    try {
      const { data: users } = await supabase
        .from('users')
        .select('id')
        .or(`display_name.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,phone_number.ilike.%${searchTerm}%`);

      const userIds = users?.map(u => u.id) || [];
      if (userIds.length === 0) {
        setRecords([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('commissions')
        .select('*')
        .or(`user_id.in.(${userIds.join(',')}),from_user_id.in.(${userIds.join(',')})`)
        .order('created_at', { ascending: false });

      if (error) { throw error; }

      const allUserIds = new Set<string>();
      data?.forEach(c => {
        if (c.user_id) { allUserIds.add(c.user_id); }
        if (c.from_user_id) { allUserIds.add(c.from_user_id); }
      });

      const { data: usersData } = await supabase
        .from('users')
        .select('id, display_name, first_name, phone_number')
        .in('id', Array.from(allUserIds));

      const recordsWithUsers = (data || []).map(commission => ({
        ...commission,
        beneficiary: usersData?.find(u => u.id === commission.user_id) || null,
        from_user: usersData?.find(u => u.id === commission.from_user_id) || null,
      }));

      setRecords(recordsWithUsers);
      setTotalCount(recordsWithUsers.length);
    } catch (error: any) {
      toast.error('搜索失败: ' + (error?.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPayout = async () => {
    if (selectedRecords.size === 0) {
      toast.error('请先选择要发放的返利记录');
      return;
    }
    const confirmed = confirm(`确定要发放 ${selectedRecords.size} 条返利记录吗？`);
    if (!confirmed) { return; }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('bulk-payout-commissions', {
        body: { commission_ids: Array.from(selectedRecords) }
      });
      if (error) { throw error; }
      toast.success(`成功发放 ${data?.success_count ?? 0} 条返利，失败 ${data?.fail_count ?? 0} 条`);
      setSelectedRecords(new Set());
      await loadRecords();
    } catch (error: any) {
      toast.error('批量发放失败: ' + (error?.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const getUserDisplayName = (user: CommissionRecord['beneficiary']) => {
    if (!user) { return '-'; }
    return user.display_name || user.first_name || user.phone_number || '-';
  };

  const exportData = () => {
    if (records.length === 0) {
      toast.error('没有数据可导出');
      return;
    }
    const csvData = records.map(r => ({
      返利ID: r.id,
      受益人ID: r.user_id,
      受益人: getUserDisplayName(r.beneficiary),
      受益人手机: r.beneficiary?.phone_number || '',
      来源用户ID: r.from_user_id,
      来源用户: getUserDisplayName(r.from_user),
      来源用户手机: r.from_user?.phone_number || '',
      层级: r.level,
      佣金比例: `${(r.commission_rate * 100).toFixed(2)}%`,
      订单金额: r.order_amount,
      佣金金额: r.commission_amount,
      状态: getStatusText(r.status),
      创建时间: new Date(r.created_at).toLocaleString('zh-CN'),
    }));

    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => headers.map(h => `"${(row as any)[h] ?? ''}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `commission_records_${Date.now()}.csv`;
    link.click();
  };

  const toggleSelectAll = () => {
    const pendingIds = records.filter(r => r.status === 'pending').map(r => r.id);
    if (selectedRecords.size === pendingIds.length && pendingIds.length > 0) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(pendingIds));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedRecords);
    if (newSelected.has(id)) { newSelected.delete(id); } else { newSelected.add(id); }
    setSelectedRecords(newSelected);
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: '待发放',
      settled: '已结算',
      cancelled: '已取消'
    };
    return statusMap[status] || status;
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { icon: any; text: string; color: string }> = {
      pending: { icon: Clock, text: '待发放', color: 'bg-yellow-100 text-yellow-800' },
      settled: { icon: CheckCircle, text: '已结算', color: 'bg-blue-100 text-blue-800' },
      cancelled: { icon: XCircle, text: '已取消', color: 'bg-gray-100 text-gray-800' }
    };
    const config = configs[status] || { icon: Clock, text: status, color: 'bg-gray-100 text-gray-800' };
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.text}
      </span>
    );
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <DollarSign className="w-7 h-7" />
          返利记录管理
        </h1>
        <p className="text-gray-600 mt-1">查看、审核和发放用户返利（每次购买自动结算给上级推荐人）</p>
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="md:col-span-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="搜索用户名或手机号..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">全部状态</option>
            <option value="pending">待发放</option>
            <option value="settled">已结算</option>
            <option value="cancelled">已取消</option>
          </select>
          <select
            value={levelFilter}
            onChange={(e) => { setLevelFilter(e.target.value); setCurrentPage(1); }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">全部层级</option>
            <option value="1">一级返利</option>
            <option value="2">二级返利</option>
            <option value="3">三级返利</option>
          </select>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            搜索
          </button>
          <button
            onClick={handleBulkPayout}
            disabled={selectedRecords.size === 0 || loading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            批量发放 ({selectedRecords.size})
          </button>
          <button
            onClick={exportData}
            disabled={records.length === 0}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            导出数据
          </button>
        </div>
      </div>

      {/* 数据表格 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-500">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            加载中...
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p>暂无返利记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedRecords.size > 0 && selectedRecords.size === records.filter(r => r.status === 'pending').length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">受益人</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">来源用户</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">层级</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">订单金额</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">佣金比例</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">佣金金额</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">创建时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {record.status === 'pending' && (
                        <input
                          type="checkbox"
                          checked={selectedRecords.has(record.id)}
                          onChange={() => toggleSelect(record.id)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{getUserDisplayName(record.beneficiary)}</div>
                      <div className="text-xs text-gray-500">{record.beneficiary?.phone_number || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{getUserDisplayName(record.from_user)}</div>
                      <div className="text-xs text-gray-500">{record.from_user?.phone_number || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        record.level === 1 ? 'bg-purple-100 text-purple-800' :
                        record.level === 2 ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        L{record.level}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-900">{Number(record.order_amount).toFixed(2)} TJS</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-900">{((record.commission_rate || 0) * 100).toFixed(2)}%</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-green-700">{Number(record.commission_amount).toFixed(2)} TJS</span>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(record.status)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-900">{new Date(record.created_at).toLocaleDateString('zh-CN')}</div>
                      <div className="text-xs text-gray-500">{new Date(record.created_at).toLocaleTimeString('zh-CN')}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              共 {totalCount} 条记录，第 {currentPage} / {totalPages} 页
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
