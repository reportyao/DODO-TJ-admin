import React, { useState, useEffect } from 'react';
import { FileText, Download, Eye, Calendar, RefreshCw } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import toast from 'react-hot-toast';

interface LotteryResult {
  id: string;
  lottery_id: string;
  winner_id: string | null;
  winner_ticket_number: number;
  draw_time: string;
  algorithm_data: {
    algorithm?: string;
    formula?: string;
    timestamp_sum?: number;
    total_entries?: number;
    winning_index?: number;
    winning_number?: string;
    timestamp_details?: any[];
  } | null;
  created_at: string;
  lottery?: {
    title: string;
    title_i18n: any;
  };
  winner?: {
    phone_number: string;

  };
}

export default function DrawLogsPage() {
  const { supabase } = useSupabase();
  const [results, setResults] = useState<LotteryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<LotteryResult | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    loadResults();
  }, [currentPage]);

  const loadResults = async () => {
    setLoading(true);
    try {
      // 从 lottery_results 表查询开奖记录
      const { data: resultsData, error, count } = await supabase
        .from('lottery_results')
        .select('*', { count: 'exact' })
        .order('draw_time', { ascending: false })
        .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

      if (error) {throw error;}
      if (!resultsData || resultsData.length === 0) {
        setResults([]);
        setTotalCount(0);
        return;
      }

      // 手动查询关联数据
      const lotteryIds = [...new Set(resultsData.map(r => r.lottery_id))];
      const userIds = [...new Set(resultsData.map(r => r.winner_id).filter(Boolean))];

      const { data: lotteries } = await supabase
        .from('lotteries')
        .select('id, title, title_i18n')
        .in('id', lotteryIds);

      let users: any[] = [];
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, phone_number')
          .in('id', userIds);
        users = usersData || [];
      }

      // 组装数据
      const data = resultsData.map(result => ({
        ...result,
        lottery: lotteries?.find(l => l.id === result.lottery_id),
        winner: users?.find(u => u.id === result.winner_id),
      }));

      setResults(data || []);
      setTotalCount(count || 0);
    } catch (error: any) {
      console.error('加载开奖记录失败:', error);
      toast.error('加载失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const getLotteryTitle = (result: LotteryResult): string => {
    if (!result.lottery) {return result.lottery_id;}
    
    // 优先使用 title_i18n 中的中文
    if (result.lottery.title_i18n?.zh) {
      return result.lottery.title_i18n.zh;
    }
    
    // 尝试解析 title 是否为 JSON
    try {
      const parsed = JSON.parse(result.lottery.title);
      if (parsed.zh) {return parsed.zh;}
    } catch {
      // 不是 JSON，直接返回 title
    }
    
    return result.lottery.title || result.lottery_id;
  };

  const downloadVerificationData = (result: LotteryResult) => {
    const verificationData = {
      lottery_id: result.lottery_id,
      lottery_title: getLotteryTitle(result),
      draw_time: result.draw_time,
      winner_ticket_number: result.winner_ticket_number,
      winner_id: result.winner_id,
      algorithm_data: result.algorithm_data,
    };

    const blob = new Blob([JSON.stringify(verificationData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `draw_verification_${result.id}.json`;
    link.click();
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-7 h-7" />
            开奖记录
          </h1>
          <p className="text-gray-600 mt-1">查看所有积分商城活动的开奖历史和验证数据</p>
        </div>
        <button
          onClick={loadResults}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 数据表格 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">开奖时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">活动名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">算法</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">中奖号码</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">中奖用户</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(results || []).map((result) => (
                <tr key={result.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <div>
                        <div className="text-sm text-gray-900">{new Date(result.draw_time).toLocaleDateString('zh-CN')}</div>
                        <div className="text-xs text-gray-500">{new Date(result.draw_time).toLocaleTimeString('zh-CN')}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900 max-w-[200px] truncate" title={getLotteryTitle(result)}>
                      {getLotteryTitle(result)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {result.algorithm_data?.algorithm || 'timestamp_sum'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-lg font-bold text-blue-600">
                      #{String(result.winner_ticket_number).padStart(7, '0')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {result.winner ? (
                      <div>
                        <div className="text-sm font-medium text-gray-900">{result.winner.phone_number || '-'}</div>
                        <div className="text-xs text-gray-500">ID: {result.winner.id?.substring(0, 8) || '-'}</div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedResult(result);
                          setShowDetailModal(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        title="查看详情"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => downloadVerificationData(result)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded"
                        title="下载验证数据"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
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
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 详情模态框 */}
      {showDetailModal && selectedResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold">开奖验证详情</h2>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <h3 className="font-semibold mb-2">基本信息</h3>
                <div className="bg-gray-50 p-4 rounded space-y-2 text-sm">
                  <p><span className="font-medium">活动名称:</span> {getLotteryTitle(selectedResult)}</p>
                  <p><span className="font-medium">开奖时间:</span> {new Date(selectedResult.draw_time).toLocaleString('zh-CN')}</p>
                  <p><span className="font-medium">算法:</span> {selectedResult.algorithm_data?.algorithm || 'timestamp_sum'}</p>
                  <p><span className="font-medium">中奖号码:</span> <span className="text-lg font-bold text-blue-600">#{String(selectedResult.winner_ticket_number).padStart(7, '0')}</span></p>
                  {selectedResult.winner && (
                    <p><span className="font-medium">中奖用户:</span> {selectedResult.winner.phone_number}</p>
                  )}
                </div>
              </div>

              {selectedResult.algorithm_data && (
                <>
                  <div>
                    <h3 className="font-semibold mb-2">算法计算过程</h3>
                    <div className="bg-gray-50 p-4 rounded space-y-2 text-sm">
                      {selectedResult.algorithm_data.formula && (
                        <p><span className="font-medium">计算公式:</span> {selectedResult.algorithm_data.formula}</p>
                      )}
                      {selectedResult.algorithm_data.timestamp_sum && (
                        <p><span className="font-medium">时间戳总和:</span> {selectedResult.algorithm_data.timestamp_sum}</p>
                      )}
                      {selectedResult.algorithm_data.total_entries && (
                        <p><span className="font-medium">参与记录数:</span> {selectedResult.algorithm_data.total_entries}</p>
                      )}
                      {selectedResult.algorithm_data.winning_index !== undefined && (
                        <p><span className="font-medium">中奖索引:</span> {selectedResult.algorithm_data.winning_index}</p>
                      )}
                    </div>
                  </div>

                  {selectedResult.algorithm_data.timestamp_details && selectedResult.algorithm_data.timestamp_details.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2">参与记录详情 (共 {selectedResult.algorithm_data.timestamp_details.length} 条)</h3>
                      <div className="bg-gray-50 p-4 rounded overflow-x-auto max-h-60">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-1 px-2">序号</th>
                              <th className="text-left py-1 px-2">参与码</th>
                              <th className="text-left py-1 px-2">时间戳</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedResult.algorithm_data.timestamp_details.map((detail, index) => (
                              <tr key={detail.entry_id} className={index === selectedResult.algorithm_data?.winning_index ? 'bg-green-100' : ''}>
                                <td className="py-1 px-2">{index}</td>
                                <td className="py-1 px-2 font-mono">{detail.numbers}</td>
                                <td className="py-1 px-2">{detail.timestamp}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <h3 className="font-semibold mb-2">原始数据</h3>
                <pre className="bg-gray-50 p-4 rounded text-xs overflow-x-auto max-h-60">
                  {JSON.stringify(selectedResult.algorithm_data, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center py-8 text-gray-500">
          加载中...
        </div>
      )}

      {!loading && results.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>暂无开奖记录</p>
        </div>
      )}
    </div>
  );
}
