import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, DollarSign, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import toast from 'react-hot-toast';

interface CommissionRecord {
  id: string;
  user_id: string;
  beneficiary_id: string;
  source_user_id: string;
  from_user_id: string;
  level: number;
  rate: number;
  amount: number;
  related_order_id: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  settled_at: string | null;
  user?: {
    id: string;
    display_name: string;
    first_name: string;
    phone_number: string;
  };
  from_user?: {
    id: string;
    display_name: string;
    first_name: string;
    phone_number: string;
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
      // 先查询佣金记录
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

      if (error) {throw error;}

      // 获取所有相关的用户ID（使用 beneficiary_id 和 source_user_id）
      const userIds = new Set<string>();
      commissionsData?.forEach(c => {
        if (c.beneficiary_id) {userIds.add(c.beneficiary_id);}
        if (c.source_user_id) {userIds.add(c.source_user_id);}
        if (c.user_id) {userIds.add(c.user_id);}
        if (c.from_user_id) {userIds.add(c.from_user_id);}
      });

      // 查询用户信息 - 使用正确的字段名
      const { data: usersData } = await supabase
        .from('users')
        .select('id, display_name, first_name, phone_number')
        .in('id', Array.from(userIds));

      // 组装数据
      const recordsWithUsers = commissionsData?.map(commission => ({
        ...commission,
        // user 是受益人（beneficiary_id 或 user_id）
        user: usersData?.find(u => u.id === commission.beneficiary_id || u.id === commission.user_id) || null,
        // from_user 是来源用户（source_user_id 或 from_user_id）
        from_user: usersData?.find(u => u.id === commission.source_user_id || u.id === commission.from_user_id) || null
      })) || [];

      setRecords(recordsWithUsers);
      setTotalCount(count || 0);
    } catch (error: any) {
      console.error('加载返利记录失败:', error);
      toast.error('加载失败: ' + (error instanceof Error ? error.message : '未知错误'));
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
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('id')
        .or(`display_name.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,phone_number.ilike.%${searchTerm}%`);

      if (userError) {throw userError;}

      const userIds = users?.map(u => u.id) || [];

      const { data, error } = await supabase
        .from('commissions')
        .select('*')
        .or(`beneficiary_id.in.(${userIds.join(',')}),user_id.in.(${userIds.join(',')})`)
        .order('created_at', { ascending: false });

      if (error) {throw error;}

      // 获取用户信息
      const allUserIds = new Set<string>();
      data?.forEach(c => {
        if (c.beneficiary_id) {allUserIds.add(c.beneficiary_id);}
        if (c.source_user_id) {allUserIds.add(c.source_user_id);}
        if (c.user_id) {allUserIds.add(c.user_id);}
        if (c.from_user_id) {allUserIds.add(c.from_user_id);}
      });

      const { data: usersData } = await supabase
        .from('users')
        .select('id, display_name, first_name, phone_number')
        .in('id', Array.from(allUserIds));

      const recordsWithUsers = data?.map(commission => ({
        ...commission,
        user: usersData?.find(u => u.id === commission.beneficiary_id || u.id === commission.user_id) || null,
        from_user: usersData?.find(u => u.id === commission.source_user_id || u.id === commission.from_user_id) || null
      })) || [];

      setRecords(recordsWithUsers);
    } catch (error: any) {
      console.error('搜索失败:', error);
      toast.error('搜索失败: ' + (error instanceof Error ? error.message : '未知错误'));
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
    if (!confirmed) {return;}

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('bulk-payout-commissions', {
        body: { commission_ids: Array.from(selectedRecords) }
      });

      if (error) {throw error;}

      toast.success(`成功发放 ${data.success_count} 条返利，失败 ${data.fail_count} 条`);
      setSelectedRecords(new Set());
      await loadRecords();
    } catch (error: any) {
      console.error('批量发放失败:', error);
      toast.error('批量发放失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  // 获取用户显示名称
  const getUserDisplayName = (user: CommissionRecord['user']) => {
    if (!user) {return '-';}
    return user.display_name || user.first_name || user.phone_number || '-';
  };

  const exportData = () => {
    const csvData = records.map(r => ({
      返利ID: r.id,
      用户ID: r.beneficiary_id || r.user_id || '',
      用户名: getUserDisplayName(r.user),
      用户手机: r.user?.phone_number || '',
      邀请人ID: r.source_user_id || r.from_user_id || '',
      邀请人: getUserDisplayName(r.from_user),
      邀请人手机: r.from_user?.phone_number || '',
      层级: r.level,
      比例: `${(r.rate * 100).toFixed(2)}%`,
      金额: r.amount,
      状态: getStatusText(r.status),
      创建时间: new Date(r.created_at).toLocaleString('zh-CN'),
      发放时间: r.settled_at ? new Date(r.settled_at).toLocaleString('zh-CN') : (r.paid_at ? new Date(r.paid_at).toLocaleString('zh-CN') : '')
    }));

    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => headers.map(h => (row as any)[h]).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `commission_records_${Date.now()}.csv`;
    link.click();
  };

  const toggleSelectAll = () => {
    if (selectedRecords.size === records.filter(r => r.status === 'pending').length) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(records.filter(r => r.status === 'pending').map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedRecords);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRecords(newSelected);
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: '待发放',
      paid: '已发放',
      settled: '已结算',
      cancelled: '已取消'
    };
    return statusMap[status] || status;
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { icon: any; text: string; color: string }> = {
      pending: { icon: Clock, text: '待发放', color: 'bg-yellow-100 text-yellow-800' },
      paid: { icon: CheckCircle, text: '已发放', color: 'bg-green-100 text-green-800' },
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
        <p className="text-gray-600 mt-1">查看、审核和发放用户返利</p>
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
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">全部状态</option>
            <option value="pending">待发放</option>
            <option value="paid">已发放</option>
            <option value="settled">已结算</option>
            <option value="cancelled">已取消</option>
          </select>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">全部层级</option>
            <option value="1">一级</option>
            <option value="2">二级</option>
            <option value="3">三级</option>
          </select>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            搜索
          </button>
          <button
            onClick={handleBulkPayout}
            disabled={selectedRecords.size === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            批量发放 ({selectedRecords.size})
          </button>
          <button
            onClick={exportData}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            导出数据
          </button>
        </div>
      </div>

      {/* 数据表格 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">用户ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">用户名</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">邀请人ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">邀请人名</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">层级</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">比例</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">金额</th>
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
                    <div className="text-xs text-gray-500 font-mono max-w-[100px] truncate" title={record.beneficiary_id || record.user_id}>
                      {(record.beneficiary_id || record.user_id || '').slice(0, 8)}...
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{getUserDisplayName(record.user)}</div>
                    <div className="text-xs text-gray-500">{record.user?.phone_number || '-'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-gray-500 font-mono max-w-[100px] truncate" title={record.source_user_id || record.from_user_id}>
                      {(record.source_user_id || record.from_user_id || '').slice(0, 8)}...
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{getUserDisplayName(record.from_user)}</div>
                    <div className="text-xs text-gray-500">{record.from_user?.phone_number || '-'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-900">L{record.level}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-900">{((record.rate || 0) * 100).toFixed(2)}%</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900">¥{Number(record.amount).toFixed(2)}</span>
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

      {loading && (
        <div className="text-center py-8 text-gray-500">
          加载中...
        </div>
      )}

      {!loading && records.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>暂无返利记录</p>
        </div>
      )}
    </div>
  );
}
