import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSupabase } from '../contexts/SupabaseContext';
import {
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon,
  FunnelIcon,
  ArrowPathIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  GlobeAltIcon,
  ClockIcon,
  UserIcon,
  CodeBracketIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// 错误日志类型
interface ErrorLog {
  id: string;
  error_type: string;
  error_message: string;
  error_stack?: string;
  user_id?: string;
  phone_number?: string;
  page_url?: string;
  page_route?: string;
  component_name?: string;
  action_type?: string;
  action_data?: Record<string, unknown>;
  user_actions?: Array<{ type: string; target?: string; timestamp: number }>;
  user_agent?: string;
  device_type?: string;
  device_model?: string;
  os_name?: string;
  os_version?: string;
  browser_name?: string;
  browser_version?: string;
  screen_width?: number;
  screen_height?: number;
  network_type?: string;
  app_version?: string;
  is_pwa?: boolean;
  platform_type?: string;
  ip_address?: string;
  country?: string;
  city?: string;
  api_endpoint?: string;
  api_method?: string;
  api_status_code?: number;
  api_response_body?: string;
  status: string;
  resolved_at?: string;
  resolved_by?: string;
  admin_note?: string;
  created_at: string;
  updated_at: string;
}

// 状态颜色映射
const statusColors: Record<string, string> = {
  NEW: 'bg-red-100 text-red-800',
  REVIEWING: 'bg-yellow-100 text-yellow-800',
  RESOLVED: 'bg-green-100 text-green-800',
  IGNORED: 'bg-gray-100 text-gray-800',
};

// 错误类型颜色映射
const errorTypeColors: Record<string, string> = {
  JS_ERROR: 'bg-red-500',
  API_ERROR: 'bg-orange-500',
  NETWORK_ERROR: 'bg-yellow-500',
  UNHANDLED_REJECTION: 'bg-purple-500',
};

// 设备图标映射
const deviceIcons: Record<string, React.ReactNode> = {
  mobile: <DevicePhoneMobileIcon className="w-4 h-4" />,
  tablet: <DeviceTabletIcon className="w-4 h-4" />,
  desktop: <ComputerDesktopIcon className="w-4 h-4" />,
};

const ErrorLogsPage: React.FC = () => {
  const { t } = useTranslation();
  const { supabase } = useSupabase();
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  // 全量统计数据（独立于已加载的 logs 数组，避免分页导致的统计失真）
  const [globalStats, setGlobalStats] = useState({ total: 0, new: 0, reviewing: 0, resolved: 0 });
  
  // 筛选条件
  const [filters, setFilters] = useState({
    status: '',
    errorType: '',
    dateRange: '7d',
  });
  
  // 分页
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 20;

  // 加载全量统计（不受分页影响）
  const loadGlobalStats = useCallback(async () => {
    try {
      const now = new Date();
      let startDate: Date | null = null;
      if (filters.dateRange) {
        switch (filters.dateRange) {
          case '1d': startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
          case '7d': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
          case '30d': startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
        }
      }

      const buildQuery = (status?: string) => {
        let q = supabase.from('error_logs').select('id', { count: 'exact', head: true });
        if (status) q = q.eq('status', status);
        if (filters.errorType) q = q.eq('error_type', filters.errorType);
        if (startDate) q = q.gte('created_at', startDate.toISOString());
        return q;
      };

      const [total, newCount, reviewing, resolved] = await Promise.all([
        buildQuery(),
        buildQuery('NEW'),
        buildQuery('REVIEWING'),
        buildQuery('RESOLVED'),
      ]);

      setGlobalStats({
        total: total.count || 0,
        new: newCount.count || 0,
        reviewing: reviewing.count || 0,
        resolved: resolved.count || 0,
      });
    } catch (err) {
      console.error('加载全量统计失败:', err);
    }
  }, [supabase, filters]);

  // 加载错误日志
  const loadLogs = useCallback(async (reset = false) => {
    try {
      setLoading(true);
      const currentPage = reset ? 0 : page;
      
      let query = supabase
        .from('error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      // 应用筛选条件
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.errorType) {
        query = query.eq('error_type', filters.errorType);
      }
      if (filters.dateRange) {
        const now = new Date();
        let startDate: Date;
        switch (filters.dateRange) {
          case '1d':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = new Date(0);
        }
        query = query.gte('created_at', startDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      if (reset) {
        setLogs(data || []);
        setPage(0);
      } else {
        setLogs(prev => [...prev, ...(data || [])]);
      }
      setHasMore((data?.length || 0) === PAGE_SIZE);
    } catch (error) {
      console.error('加载错误日志失败:', error);
      toast.error('加载错误日志失败');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    loadLogs(true);
    loadGlobalStats();
  }, [filters]);

  // page变化时加载更多数据（非reset）
  useEffect(() => {
    if (page > 0) {
      loadLogs(false);
    }
  }, [page]);

  // 更新日志状态
  const updateLogStatus = async (logId: string, newStatus: string, note?: string) => {
    try {
      const updateData: Partial<ErrorLog> = {
        status: newStatus,
        admin_note: note,
      };
      
      if (newStatus === 'RESOLVED') {
        updateData.resolved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('error_logs')
        .update(updateData)
        .eq('id', logId);

      if (error) throw error;

      setLogs(prev => prev.map(log => 
        log.id === logId ? { ...log, ...updateData } : log
      ));
      
      if (selectedLog?.id === logId) {
        setSelectedLog(prev => prev ? { ...prev, ...updateData } : null);
      }

      toast.success('状态更新成功');
    } catch (error) {
      console.error('更新状态失败:', error);
      toast.error('更新状态失败');
    }
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // 统计信息
  const stats = {
    total: logs.length,
    new: logs.filter(l => l.status === 'NEW').length,
    reviewing: logs.filter(l => l.status === 'REVIEWING').length,
    resolved: logs.filter(l => l.status === 'RESOLVED').length,
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ExclamationTriangleIcon className="w-7 h-7 text-red-500" />
          错误监控
        </h1>
        <p className="text-gray-500 mt-1">监控和管理前端错误日志</p>
      </div>

      {/* 统计卡片 - 数据来自全量查询，不受分页影响 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">总错误数</div>
          <div className="text-2xl font-bold text-gray-900">{globalStats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">待处理</div>
          <div className="text-2xl font-bold text-red-600">{globalStats.new}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">处理中</div>
          <div className="text-2xl font-bold text-yellow-600">{globalStats.reviewing}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">已解决</div>
          <div className="text-2xl font-bold text-green-600">{globalStats.resolved}</div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <FunnelIcon className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-600">筛选:</span>
          </div>
          
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">全部状态</option>
            <option value="NEW">待处理</option>
            <option value="REVIEWING">处理中</option>
            <option value="RESOLVED">已解决</option>
            <option value="IGNORED">已忽略</option>
          </select>

          <select
            value={filters.errorType}
            onChange={(e) => setFilters(prev => ({ ...prev, errorType: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">全部类型</option>
            <option value="JS_ERROR">JS错误</option>
            <option value="API_ERROR">API错误</option>
            <option value="NETWORK_ERROR">网络错误</option>
            <option value="UNHANDLED_REJECTION">未处理Promise</option>
          </select>

          <select
            value={filters.dateRange}
            onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="1d">最近1天</option>
            <option value="7d">最近7天</option>
            <option value="30d">最近30天</option>
            <option value="">全部时间</option>
          </select>

          <button
            onClick={() => loadLogs(true)}
            className="flex items-center gap-1 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600"
          >
            <ArrowPathIcon className="w-4 h-4" />
            刷新
          </button>
        </div>
      </div>

      {/* 错误日志列表 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">错误信息</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">页面</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">设备</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">用户</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">时间</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto mb-2" />
                  加载中...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  暂无错误日志
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={`inline-block w-2 h-2 rounded-full ${errorTypeColors[log.error_type] || 'bg-gray-500'}`} />
                    <span className="ml-2 text-xs text-gray-600">{log.error_type === 'JS_ERROR' ? 'JS错误' : log.error_type === 'API_ERROR' ? 'API错误' : log.error_type === 'NETWORK_ERROR' ? '网络错误' : log.error_type === 'UNHANDLED_REJECTION' ? '未处理异常' : log.error_type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-xs truncate text-sm text-gray-900" title={log.error_message}>
                      {log.error_message}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-600 truncate max-w-[150px]" title={log.page_route}>
                      {log.page_route || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      {deviceIcons[log.device_type || 'desktop']}
                      <span>{log.device_model || log.os_name || '-'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-600">
                      {log.phone_number ? log.phone_number : (log.user_id?.substring(0, 8) || '-')}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-600">{formatTime(log.created_at)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[log.status]}`}>
                      {log.status === 'NEW' && '待处理'}
                      {log.status === 'REVIEWING' && '处理中'}
                      {log.status === 'RESOLVED' && '已解决'}
                      {log.status === 'IGNORED' && '已忽略'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setSelectedLog(log); setShowDetail(true); }}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="查看详情"
                      >
                        <EyeIcon className="w-4 h-4" />
                      </button>
                      {log.status === 'NEW' && (
                        <>
                          <button
                            onClick={() => updateLogStatus(log.id, 'REVIEWING')}
                            className="p-1 text-yellow-600 hover:bg-yellow-50 rounded"
                            title="标记为处理中"
                          >
                            <ClockIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateLogStatus(log.id, 'RESOLVED')}
                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                            title="标记为已解决"
                          >
                            <CheckCircleIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateLogStatus(log.id, 'IGNORED')}
                            className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                            title="忽略"
                          >
                            <XCircleIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* 加载更多 */}
        {hasMore && logs.length > 0 && (
          <div className="p-4 text-center">
            <button
              onClick={() => { const nextPage = page + 1; setPage(nextPage); }}
              disabled={loading}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              {loading ? '加载中...' : '加载更多'}
            </button>
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      {showDetail && selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">错误详情</h2>
              <button
                onClick={() => setShowDetail(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* 基本信息 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">错误信息</h3>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${errorTypeColors[selectedLog.error_type]}`} />
                    <span className="font-medium text-red-800">{selectedLog.error_type === 'JS_ERROR' ? 'JS错误' : selectedLog.error_type === 'API_ERROR' ? 'API错误' : selectedLog.error_type === 'NETWORK_ERROR' ? '网络错误' : selectedLog.error_type === 'UNHANDLED_REJECTION' ? '未处理异常' : selectedLog.error_type}</span>
                    <span className={`ml-auto px-2 py-1 text-xs font-medium rounded-full ${statusColors[selectedLog.status]}`}>
                      {selectedLog.status === 'NEW' ? '待处理' : selectedLog.status === 'REVIEWING' ? '处理中' : selectedLog.status === 'RESOLVED' ? '已解决' : selectedLog.status === 'IGNORED' ? '已忽略' : selectedLog.status}
                    </span>
                  </div>
                  <p className="text-red-900 font-mono text-sm break-all">{selectedLog.error_message}</p>
                </div>
              </div>

              {/* 堆栈跟踪 */}
              {selectedLog.error_stack && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1">
                    <CodeBracketIcon className="w-4 h-4" />
                    堆栈跟踪
                  </h3>
                  <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">
                    {selectedLog.error_stack}
                  </pre>
                </div>
              )}

              {/* 页面上下文 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1">
                  <GlobeAltIcon className="w-4 h-4" />
                  页面上下文
                </h3>
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                  <div>
                    <div className="text-xs text-gray-500">页面URL</div>
                    <div className="text-sm text-gray-900 break-all">{selectedLog.page_url || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">路由</div>
                    <div className="text-sm text-gray-900">{selectedLog.page_route || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">组件</div>
                    <div className="text-sm text-gray-900">{selectedLog.component_name || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">应用版本</div>
                    <div className="text-sm text-gray-900">{selectedLog.app_version || '-'}</div>
                  </div>
                </div>
              </div>

              {/* 用户信息 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1">
                  <UserIcon className="w-4 h-4" />
                  用户信息
                </h3>
                <div className="grid grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
                  <div>
                    <div className="text-xs text-gray-500">用户ID</div>
                    <div className="text-sm text-gray-900 font-mono">{selectedLog.user_id || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">手机号</div>
                    <div className="text-sm text-gray-900">{selectedLog.phone_number || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">平台类型</div>
                    <div className="text-sm text-gray-900">{selectedLog.platform_type || (selectedLog.is_pwa ? 'PWA' : '浏览器')}</div>
                  </div>
                </div>
              </div>

              {/* 设备信息 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1">
                  {deviceIcons[selectedLog.device_type || 'desktop']}
                  设备信息
                </h3>
                <div className="grid grid-cols-4 gap-4 bg-gray-50 p-4 rounded-lg">
                  <div>
                    <div className="text-xs text-gray-500">设备类型</div>
                    <div className="text-sm text-gray-900">{selectedLog.device_type || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">设备型号</div>
                    <div className="text-sm text-gray-900">{selectedLog.device_model || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">操作系统</div>
                    <div className="text-sm text-gray-900">{selectedLog.os_name} {selectedLog.os_version}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">浏览器</div>
                    <div className="text-sm text-gray-900">{selectedLog.browser_name} {selectedLog.browser_version}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">屏幕尺寸</div>
                    <div className="text-sm text-gray-900">{selectedLog.screen_width}x{selectedLog.screen_height}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">网络类型</div>
                    <div className="text-sm text-gray-900">{selectedLog.network_type || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">运行环境</div>
                    <div className="text-sm text-gray-900">{selectedLog.platform_type || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">PWA 模式</div>
                    <div className="text-sm text-gray-900">{selectedLog.is_pwa ? '是' : '否'}</div>
                  </div>
                </div>
              </div>

              {/* API错误信息 */}
              {selectedLog.api_endpoint && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">API错误信息</h3>
                  <div className="grid grid-cols-3 gap-4 bg-orange-50 p-4 rounded-lg">
                    <div>
                      <div className="text-xs text-gray-500">端点</div>
                      <div className="text-sm text-gray-900 break-all">{selectedLog.api_endpoint}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">方法</div>
                      <div className="text-sm text-gray-900">{selectedLog.api_method}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">状态码</div>
                      <div className="text-sm text-gray-900">{selectedLog.api_status_code}</div>
                    </div>
                  </div>
                  {selectedLog.api_response_body && (
                    <pre className="mt-2 bg-gray-900 text-gray-300 p-4 rounded-lg text-xs overflow-x-auto">
                      {selectedLog.api_response_body}
                    </pre>
                  )}
                </div>
              )}

              {/* 用户操作历史 */}
              {selectedLog.user_actions && selectedLog.user_actions.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">用户操作历史（最近20条）</h3>
                  <div className="bg-gray-50 p-4 rounded-lg max-h-40 overflow-y-auto">
                    {selectedLog.user_actions.map((action, index) => (
                      <div key={index} className="flex items-center gap-2 text-xs text-gray-600 py-1">
                        <span className="text-gray-400">{new Date(action.timestamp).toLocaleTimeString()}</span>
                        <span className="font-medium">{action.type}</span>
                        <span className="text-gray-500 truncate">{action.target}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 时间信息 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1">
                  <ClockIcon className="w-4 h-4" />
                  时间信息
                </h3>
                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                  <div>
                    <div className="text-xs text-gray-500">发生时间</div>
                    <div className="text-sm text-gray-900">{formatTime(selectedLog.created_at)}</div>
                  </div>
                  {selectedLog.resolved_at && (
                    <div>
                      <div className="text-xs text-gray-500">解决时间</div>
                      <div className="text-sm text-gray-900">{formatTime(selectedLog.resolved_at)}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* 管理员备注 */}
              {selectedLog.admin_note && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">管理员备注</h3>
                  <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-900">
                    {selectedLog.admin_note}
                  </div>
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center justify-end gap-2 p-4 border-t bg-gray-50">
              {selectedLog.status === 'NEW' && (
                <>
                  <button
                    onClick={() => { updateLogStatus(selectedLog.id, 'REVIEWING'); }}
                    className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                  >
                    标记为处理中
                  </button>
                  <button
                    onClick={() => { updateLogStatus(selectedLog.id, 'RESOLVED'); }}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                  >
                    标记为已解决
                  </button>
                  <button
                    onClick={() => { updateLogStatus(selectedLog.id, 'IGNORED'); }}
                    className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                  >
                    忽略
                  </button>
                </>
              )}
              <button
                onClick={() => setShowDetail(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorLogsPage;
