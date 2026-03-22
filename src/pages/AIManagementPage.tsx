import { useState, useEffect } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import toast from 'react-hot-toast';

interface AIStats {
  total_questions: number;
  total_users: number;
  today_questions: number;
  today_users: number;
}

interface AILog {
  id: string;
  user_id: string;
  username?: string;
  question: string;
  answer: string | null;
  is_blocked: boolean;
  response_time: number | null;
  created_at: string;
}

interface DailyStats {
  date: string;
  question_count: number;
  user_count: number;
}

export default function AIManagementPage() {
  const { supabase } = useSupabase();
  const [stats, setStats] = useState<AIStats | null>(null);
  const [logs, setLogs] = useState<AILog[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedUser, setSelectedUser] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [selectedDate, selectedUser]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadStats(),
        loadLogs(),
        loadDailyStats()
      ]);
    } catch (error) {
      console.error('Failed to load AI management data:', error);
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    // 【A37修复】使用 count: 'exact' + head: true 避免全量拉取数据
    // 总提问数
    const { count: totalQuestions, error: totalError } = await supabase
      .from('ai_chat_history')
      .select('id', { count: 'exact', head: true });
    if (totalError) {throw totalError;}

    // 总用户数：通过数据库级 COUNT(DISTINCT) 获取准确数据，避免前端 limit(10000) 导致的统计失真
    const { data: userCountData, error: userError } = await supabase
      .rpc('count_distinct_ai_users');
    // 如果 RPC 不存在，回退到分页查询方式（取前5000条去重）
    let totalUsers = 0;
    if (userError) {
      const { data: fallback } = await supabase
        .from('ai_chat_history')
        .select('user_id')
        .limit(5000);
      totalUsers = new Set(fallback?.map((l: any) => l.user_id)).size;
    } else {
      totalUsers = userCountData || 0;
    }

    // 今日统计
    const today = new Date().toISOString().split('T')[0];
    const { count: todayQuestions, error: todayError } = await supabase
      .from('ai_chat_history')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`);
    if (todayError) {throw todayError;}

    // 今日用户数
    const { data: todayUserData, error: todayUserError } = await supabase
      .from('ai_chat_history')
      .select('user_id')
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`);
    if (todayUserError) {throw todayUserError;}
    const todayUsers = new Set(todayUserData?.map(log => log.user_id)).size;

    setStats({
      total_questions: totalQuestions || 0,
      total_users: totalUsers,
      today_questions: todayQuestions || 0,
      today_users: todayUsers
    });
  };

  const loadLogs = async () => {
    // 使用 ai_chat_history 表，字段名为 user_message 和 ai_response
    let query = supabase
      .from('ai_chat_history')
      .select(`
        id,
        user_id,
        user_message,
        ai_response,
        is_blocked,
        response_time,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    // 按日期筛选
    if (selectedDate) {
      query = query
        .gte('created_at', `${selectedDate}T00:00:00`)
        .lt('created_at', `${selectedDate}T23:59:59`);
    }

    // 按用户筛选
    if (selectedUser) {
      query = query.eq('user_id', selectedUser);
    }

    const { data, error } = await query;

    if (error) {throw error;}

    // 获取用户名
    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(log => log.user_id))];
      const { data: userData } = await supabase
        .from('users')
        .select('id, display_name, first_name, phone_number')
        .in('id', userIds);

      const userMap = new Map(userData?.map(u => [u.id, u.display_name || u.phone_number || u.first_name || u.id]) || []);

      // 映射字段名
      const logsWithUsername = data.map(log => ({
        id: log.id,
        user_id: log.user_id,
        question: log.user_message,
        answer: log.ai_response,
        is_blocked: log.is_blocked,
        response_time: log.response_time,
        created_at: log.created_at,
        username: userMap.get(log.user_id) || log.user_id
      }));

      setLogs(logsWithUsername);
    } else {
      setLogs([]);
    }
  };

  const loadDailyStats = async () => {
    // 获取最近30天的统计 - 使用 ai_chat_history 表
    const { data, error } = await supabase
      .from('ai_chat_history')
      .select('created_at, user_id')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (error) {throw error;}

    // 按日期分组统计
    const statsMap = new Map<string, { users: Set<string>; count: number }>();

    data?.forEach(log => {
      const date = log.created_at.split('T')[0];
      if (!statsMap.has(date)) {
        statsMap.set(date, { users: new Set(), count: 0 });
      }
      const stat = statsMap.get(date)!;
      stat.users.add(log.user_id);
      stat.count++;
    });

    const dailyStatsArray = Array.from(statsMap.entries())
      .map(([date, stat]) => ({
        date,
        question_count: stat.count,
        user_count: stat.users.size
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    setDailyStats(dailyStatsArray);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">AI管理</h1>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          刷新数据
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-gray-500 text-sm">总提问次数</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">
            {stats?.total_questions || 0}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-gray-500 text-sm">总用户数</div>
          <div className="text-3xl font-bold text-green-600 mt-2">
            {stats?.total_users || 0}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-gray-500 text-sm">今日提问次数</div>
          <div className="text-3xl font-bold text-purple-600 mt-2">
            {stats?.today_questions || 0}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-gray-500 text-sm">今日用户数</div>
          <div className="text-3xl font-bold text-orange-600 mt-2">
            {stats?.today_users || 0}
          </div>
        </div>
      </div>

      {/* 每日统计表格 */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold">每日统计（最近30天）</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">日期</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">提问次数</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">用户数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {dailyStats.map((stat) => (
                <tr key={stat.date} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {stat.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {stat.question_count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {stat.user_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 筛选器 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择日期
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              用户ID（可选）
            </label>
            <input
              type="text"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              placeholder="输入用户ID筛选"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* 聊天记录列表 */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold">聊天记录（最近100条）</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">时间</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">用户</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">问题</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">回答</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">响应时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(log.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="font-medium">{log.username}</div>
                    <div className="text-gray-500 text-xs">{log.user_id}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                    {log.question}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                    {log.answer || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {log.is_blocked ? (
                      <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">已拦截</span>
                    ) : (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">正常</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.response_time ? `${(log.response_time / 1000).toFixed(1)}s` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
