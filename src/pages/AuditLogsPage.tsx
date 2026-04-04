import React, { useEffect, useState, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

interface AdminAuditLog {
  id: string;
  admin_id: string;
  admin_name?: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  details: Record<string, any> | null;
  source: string;
  status: string;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface EdgeFunctionLog {
  id: string;
  function_name: string;
  action: string;
  user_id: string | null;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, any> | null;
  status: string;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

type LogSource = 'all' | 'admin' | 'edge_function';
type LogStatus = 'all' | 'success' | 'failed' | 'error';

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

const formatDuration = (ms: number | null) => {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

// 操作类型的中文映射
const ACTION_LABELS: Record<string, string> = {
  login: '管理员登录',
  logout: '管理员登出',
  APPROVE_DEPOSIT: '审批充值（通过）',
  REJECT_DEPOSIT: '审批充值（拒绝）',
  APPROVE_WITHDRAWAL: '审批提现（通过）',
  REJECT_WITHDRAWAL: '审批提现（拒绝）',
  COMPLETE_WITHDRAWAL: '完成提现',
  APPROVE_SHOWOFF: '审批晒单（通过）',
  REJECT_SHOWOFF: '审批晒单（拒绝）',
  PROMOTER_DEPOSIT: '地推充值',
  approve_deposit: '审批充值（通过）',
  reject_deposit: '审批充值（拒绝）',
  approve_withdrawal: '审批提现（通过）',
  reject_withdrawal: '审批提现（拒绝）',
  approve_showoff: '审批晒单（通过）',
  reject_showoff: '审批晒单（拒绝）',
  promoter_deposit: '地推充值',
  AI_CREATE_PRODUCT: 'AI上架商品',
};

// 操作类型的颜色映射
const ACTION_COLORS: Record<string, string> = {
  login: 'bg-blue-100 text-blue-800',
  logout: 'bg-gray-100 text-gray-700',
  APPROVE_DEPOSIT: 'bg-green-100 text-green-800',
  REJECT_DEPOSIT: 'bg-red-100 text-red-800',
  APPROVE_WITHDRAWAL: 'bg-green-100 text-green-800',
  REJECT_WITHDRAWAL: 'bg-red-100 text-red-800',
  COMPLETE_WITHDRAWAL: 'bg-teal-100 text-teal-800',
  APPROVE_SHOWOFF: 'bg-green-100 text-green-800',
  REJECT_SHOWOFF: 'bg-red-100 text-red-800',
  PROMOTER_DEPOSIT: 'bg-purple-100 text-purple-800',
  approve_deposit: 'bg-green-100 text-green-800',
  reject_deposit: 'bg-red-100 text-red-800',
  approve_withdrawal: 'bg-green-100 text-green-800',
  reject_withdrawal: 'bg-red-100 text-red-800',
  approve_showoff: 'bg-green-100 text-green-800',
  reject_showoff: 'bg-red-100 text-red-800',
  promoter_deposit: 'bg-purple-100 text-purple-800',
  AI_CREATE_PRODUCT: 'bg-violet-100 text-violet-800',
};

// 目标类型的中文映射
const TARGET_TYPE_LABELS: Record<string, string> = {
  deposit_request: '充值申请',
  withdrawal_request: '提现申请',
  showoff: '晒单',
  promoter_deposit: '地推充值',
  user: '用户',
  product: '商品',
  inventory_product: '库存商品',
};

// 来源标签
const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  admin_ui: { label: '管理后台', color: 'bg-indigo-100 text-indigo-700' },
  edge_function: { label: 'Edge Function', color: 'bg-orange-100 text-orange-700' },
  rpc: { label: 'RPC 函数', color: 'bg-yellow-100 text-yellow-700' },
  manual: { label: '手动操作', color: 'bg-gray-100 text-gray-700' },
};

// ─── 统一日志条目类型（合并两张表） ─────────────────────────────────────────────

interface UnifiedLog {
  id: string;
  type: 'admin' | 'edge_function';
  operator: string;        // 操作者（管理员名 or Edge Function 名）
  action: string;
  actionLabel: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, any> | null;
  source: string;
  status: string;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
  raw: AdminAuditLog | EdgeFunctionLog;
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

const AuditLogsPage: React.FC = () => {
  const { supabase } = useSupabase();

  // 数据状态
  const [logs, setLogs] = useState<UnifiedLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // 筛选状态
  const [sourceFilter, setSourceFilter] = useState<LogSource>('all');
  const [statusFilter, setStatusFilter] = useState<LogStatus>('all');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  // 详情弹窗
  const [selectedLog, setSelectedLog] = useState<UnifiedLog | null>(null);

  // 统计数据
  const [stats, setStats] = useState({
    total: 0,
    todayTotal: 0,
    failedTotal: 0,
    adminActions: 0,
    edgeFunctionActions: 0,
  });

  // ─── 加载统计数据 ──────────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();

      const [adminTotal, adminToday, adminFailed, efTotal, efToday, efFailed] = await Promise.all([
        supabase.from('admin_audit_logs').select('id', { count: 'exact', head: true }),
        supabase.from('admin_audit_logs').select('id', { count: 'exact', head: true }).gte('created_at', todayStr),
        supabase.from('admin_audit_logs').select('id', { count: 'exact', head: true }).in('status', ['failed', 'error']),
        supabase.from('edge_function_logs').select('id', { count: 'exact', head: true }),
        supabase.from('edge_function_logs').select('id', { count: 'exact', head: true }).gte('created_at', todayStr),
        supabase.from('edge_function_logs').select('id', { count: 'exact', head: true }).in('status', ['failed', 'error']),
      ]);

      setStats({
        total: (adminTotal.count || 0) + (efTotal.count || 0),
        todayTotal: (adminToday.count || 0) + (efToday.count || 0),
        failedTotal: (adminFailed.count || 0) + (efFailed.count || 0),
        adminActions: adminTotal.count || 0,
        edgeFunctionActions: efTotal.count || 0,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, [supabase]);

  // ─── 加载日志数据 ──────────────────────────────────────────────────────────

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const offset = (currentPage - 1) * PAGE_SIZE;
      const allLogs: UnifiedLog[] = [];

      // 构建 admin_audit_logs 查询
      if (sourceFilter === 'all' || sourceFilter === 'admin') {
        let query = supabase
          .from('admin_audit_logs')
          .select(`
            id, admin_id, action, target_type, target_id,
            old_data, new_data, details, source, status,
            error_message, duration_ms, created_at,
            admin_users!admin_audit_logs_admin_id_fkey(username, display_name)
          `, { count: 'exact' })
          .order('created_at', { ascending: false });

        if (statusFilter !== 'all') query = query.eq('status', statusFilter);
        if (actionFilter) query = query.ilike('action', `%${actionFilter}%`);
        if (dateFrom) query = query.gte('created_at', new Date(dateFrom).toISOString());
        if (dateTo) {
          const end = new Date(dateTo);
          end.setHours(23, 59, 59, 999);
          query = query.lte('created_at', end.toISOString());
        }

        const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
        if (!error && data) {
          data.forEach((row: any) => {
            const adminUser = row.admin_users;
            const operatorName = adminUser?.display_name || adminUser?.username || row.admin_id?.slice(0, 8) || '未知管理员';
            allLogs.push({
              id: row.id,
              type: 'admin',
              operator: operatorName,
              action: row.action,
              actionLabel: ACTION_LABELS[row.action] || row.action,
              targetType: row.target_type,
              targetId: row.target_id,
              details: row.details,
              source: row.source || 'admin_ui',
              status: row.status || 'success',
              errorMessage: row.error_message,
              durationMs: row.duration_ms,
              createdAt: row.created_at,
              raw: row as AdminAuditLog,
            });
          });
        }
      }

      // 构建 edge_function_logs 查询
      if (sourceFilter === 'all' || sourceFilter === 'edge_function') {
        let query = supabase
          .from('edge_function_logs')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false });

        if (statusFilter !== 'all') query = query.eq('status', statusFilter);
        if (actionFilter) query = query.ilike('action', `%${actionFilter}%`);
        if (dateFrom) query = query.gte('created_at', new Date(dateFrom).toISOString());
        if (dateTo) {
          const end = new Date(dateTo);
          end.setHours(23, 59, 59, 999);
          query = query.lte('created_at', end.toISOString());
        }

        const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
        if (!error && data) {
          data.forEach((row: EdgeFunctionLog) => {
            allLogs.push({
              id: row.id,
              type: 'edge_function',
              operator: row.function_name,
              action: row.action,
              actionLabel: ACTION_LABELS[row.action] || row.action,
              targetType: row.target_type,
              targetId: row.target_id,
              details: row.details,
              source: 'edge_function',
              status: row.status || 'success',
              errorMessage: row.error_message,
              durationMs: row.duration_ms,
              createdAt: row.created_at,
              raw: row,
            });
          });
        }
      }

      // 按时间排序（合并后）
      allLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // 关键词过滤（前端过滤）
      const filtered = searchKeyword
        ? allLogs.filter(log =>
            log.operator.toLowerCase().includes(searchKeyword.toLowerCase()) ||
            log.actionLabel.toLowerCase().includes(searchKeyword.toLowerCase()) ||
            log.action.toLowerCase().includes(searchKeyword.toLowerCase()) ||
            (log.targetId || '').toLowerCase().includes(searchKeyword.toLowerCase()) ||
            JSON.stringify(log.details || {}).toLowerCase().includes(searchKeyword.toLowerCase())
          )
        : allLogs;

      setLogs(filtered.slice(0, PAGE_SIZE));
      setTotalCount(filtered.length);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, sourceFilter, statusFilter, actionFilter, dateFrom, dateTo, searchKeyword, currentPage]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sourceFilter, statusFilter, actionFilter, dateFrom, dateTo, searchKeyword]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // ─── 渲染辅助 ─────────────────────────────────────────────────────────────

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">✓ 成功</span>;
      case 'failed':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">✗ 失败</span>;
      case 'error':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">⚠ 错误</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{status}</span>;
    }
  };

  const getActionBadge = (action: string, label: string) => {
    const colorClass = ACTION_COLORS[action] || 'bg-gray-100 text-gray-700';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
        {label}
      </span>
    );
  };

  const getSourceBadge = (source: string) => {
    const { label, color } = SOURCE_LABELS[source] || { label: source, color: 'bg-gray-100 text-gray-700' };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
        {label}
      </span>
    );
  };

  const getTypeBadge = (type: 'admin' | 'edge_function') => {
    if (type === 'admin') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">👨‍💼 管理员</span>;
    }
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">⚡ 系统函数</span>;
  };

  // ─── 详情弹窗 ─────────────────────────────────────────────────────────────

  const renderDetailModal = () => {
    if (!selectedLog) return null;
    const log = selectedLog;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* 头部 */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 rounded-t-xl">
            <div className="flex items-center gap-3">
              <span className="text-lg">📋</span>
              <div>
                <h2 className="text-base font-semibold text-gray-900">操作日志详情</h2>
                <p className="text-xs text-gray-500">{formatDateTime(log.createdAt)}</p>
              </div>
            </div>
            <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
          </div>

          {/* 内容 */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">日志类型</div>
                <div>{getTypeBadge(log.type)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">操作状态</div>
                <div>{getStatusBadge(log.status)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">操作者</div>
                <div className="text-sm font-medium text-gray-900">{log.operator}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">操作类型</div>
                <div>{getActionBadge(log.action, log.actionLabel)}</div>
              </div>
              {log.targetType && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">目标类型</div>
                  <div className="text-sm text-gray-900">{TARGET_TYPE_LABELS[log.targetType] || log.targetType}</div>
                </div>
              )}
              {log.targetId && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">目标 ID</div>
                  <div className="text-sm text-gray-900 font-mono break-all">{log.targetId}</div>
                </div>
              )}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">来源</div>
                <div>{getSourceBadge(log.source)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">耗时</div>
                <div className="text-sm text-gray-900">{formatDuration(log.durationMs)}</div>
              </div>
            </div>

            {/* 操作详情 */}
            {log.details && Object.keys(log.details).length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <span>📝</span> 操作详情
                </h3>
                <div className="bg-blue-50 rounded-lg p-3 space-y-2">
                  {Object.entries(log.details).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2">
                      <span className="text-xs text-blue-600 font-medium min-w-[100px] mt-0.5">
                        {key === 'amount' ? '金额' :
                         key === 'currency' ? '货币' :
                         key === 'username' ? '用户名' :
                         key === 'user_id' ? '用户 ID' :
                         key === 'order_number' ? '订单号' :
                         key === 'payment_method' ? '支付方式' :
                         key === 'payer_name' ? '付款人' :
                         key === 'promoter_id' ? '推广员 ID' :
                         key === 'promoter_name' ? '推广员名' :
                         key === 'bonus_amount' ? '奖励金额' :
                         key === 'action' ? '操作' :
                         key === 'showoff_id' ? '晒单 ID' :
                         key === 'rejection_reason' ? '拒绝原因' :
                         key === 'withdrawal_amount' ? '提现金额' :
                         key === 'fee' ? '手续费' :
                         key === 'net_amount' ? '实际到账' :
                         key}:
                      </span>
                      <span className="text-xs text-blue-900 break-all">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '-')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 错误信息 */}
            {log.errorMessage && (
              <div>
                <h3 className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1">
                  <span>⚠️</span> 错误信息
                </h3>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800 font-mono">{log.errorMessage}</p>
                </div>
              </div>
            )}

            {/* 日志 ID */}
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-400">日志 ID: <span className="font-mono">{log.id}</span></p>
            </div>
          </div>

          {/* 底部 */}
          <div className="px-6 py-3 border-t bg-gray-50 rounded-b-xl flex justify-end">
            <button
              onClick={() => setSelectedLog(null)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── 主渲染 ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            📋 操作审计日志
          </h1>
          <p className="text-sm text-gray-500 mt-1">记录所有管理员操作和系统关键函数的调用历史</p>
        </div>
        <button
          onClick={() => { loadStats(); loadLogs(); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
        >
          🔄 刷新
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">总日志数</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">今日操作</div>
          <div className="text-2xl font-bold text-indigo-600">{stats.todayTotal}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">失败操作</div>
          <div className={`text-2xl font-bold ${stats.failedTotal > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {stats.failedTotal}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">管理员操作</div>
          <div className="text-2xl font-bold text-blue-600">{stats.adminActions}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">系统函数调用</div>
          <div className="text-2xl font-bold text-orange-600">{stats.edgeFunctionActions}</div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 关键词搜索 */}
          <div className="lg:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">关键词搜索</label>
            <input
              type="text"
              placeholder="搜索操作者、操作类型、目标 ID..."
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 日志来源 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">日志来源</label>
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value as LogSource)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">全部来源</option>
              <option value="admin">管理员操作</option>
              <option value="edge_function">系统函数</option>
            </select>
          </div>

          {/* 操作状态 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">操作状态</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as LogStatus)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">全部状态</option>
              <option value="success">成功</option>
              <option value="failed">失败</option>
              <option value="error">错误</option>
            </select>
          </div>

          {/* 开始日期 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">开始日期</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 结束日期 */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">结束日期</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* 快捷筛选按钮 */}
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500 self-center">快捷筛选：</span>
          {[
            { label: '今日', days: 0 },
            { label: '近7天', days: 7 },
            { label: '近30天', days: 30 },
          ].map(({ label, days }) => (
            <button
              key={label}
              onClick={() => {
                const end = new Date();
                const start = new Date();
                start.setDate(start.getDate() - days);
                setDateFrom(start.toISOString().split('T')[0]);
                setDateTo(end.toISOString().split('T')[0]);
              }}
              className="px-3 py-1 text-xs bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 text-gray-600 rounded-full transition-colors"
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => {
              setSourceFilter('all');
              setStatusFilter('all');
              setActionFilter('');
              setDateFrom('');
              setDateTo('');
              setSearchKeyword('');
            }}
            className="px-3 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded-full transition-colors"
          >
            清除筛选
          </button>
          <span className="ml-auto text-xs text-gray-400 self-center">
            共 {totalCount} 条记录
          </span>
        </div>
      </div>

      {/* 日志表格 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">加载中...</p>
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <span className="text-4xl">📭</span>
              <p className="text-sm">暂无操作日志</p>
              {(sourceFilter !== 'all' || statusFilter !== 'all' || searchKeyword) && (
                <p className="text-xs text-gray-400">尝试调整筛选条件</p>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">时间</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">类型</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">操作者</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">操作</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">目标</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">状态</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">耗时</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      log.status === 'failed' || log.status === 'error' ? 'bg-red-50 hover:bg-red-100' : ''
                    }`}
                  >
                    {/* 时间 */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-gray-900 font-medium">
                        {new Date(log.createdAt).toLocaleDateString('zh-CN')}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(log.createdAt).toLocaleTimeString('zh-CN')}
                      </div>
                    </td>

                    {/* 类型 */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getTypeBadge(log.type)}
                    </td>

                    {/* 操作者 */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                          log.type === 'admin' ? 'bg-indigo-500' : 'bg-orange-500'
                        }`}>
                          {log.type === 'admin' ? log.operator.charAt(0).toUpperCase() : '⚡'}
                        </div>
                        <span className="text-sm text-gray-900 font-medium truncate max-w-[120px]" title={log.operator}>
                          {log.operator}
                        </span>
                      </div>
                    </td>

                    {/* 操作 */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getActionBadge(log.action, log.actionLabel)}
                    </td>

                    {/* 目标 */}
                    <td className="px-4 py-3">
                      {log.targetType ? (
                        <div>
                          <div className="text-xs text-gray-500">{TARGET_TYPE_LABELS[log.targetType] || log.targetType}</div>
                          {log.targetId && (
                            <div className="text-xs font-mono text-gray-700 truncate max-w-[140px]" title={log.targetId}>
                              {log.targetId.length > 16 ? `${log.targetId.slice(0, 8)}...` : log.targetId}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>

                    {/* 状态 */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getStatusBadge(log.status)}
                      {log.errorMessage && (
                        <div className="text-xs text-red-600 mt-1 truncate max-w-[120px]" title={log.errorMessage}>
                          {log.errorMessage.slice(0, 30)}...
                        </div>
                      )}
                    </td>

                    {/* 耗时 */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                      {formatDuration(log.durationMs)}
                    </td>

                    {/* 操作按钮 */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
                      >
                        查看详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {!isLoading && logs.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <div className="text-xs text-gray-500">
              显示第 {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} 条，共 {totalCount} 条
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-xs bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← 上一页
              </button>
              <span className="text-xs text-gray-600">第 {currentPage} 页</span>
              <button
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={currentPage * PAGE_SIZE >= totalCount}
                className="px-3 py-1 text-xs bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一页 →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      {renderDetailModal()}
    </div>
  );
};

export default AuditLogsPage;
