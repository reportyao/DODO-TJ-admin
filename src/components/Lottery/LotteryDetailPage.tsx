import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Tables } from '@/types/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import { ArrowLeft, Users, Ticket, Trophy, TrendingUp } from 'lucide-react';

// 使用 lottery_entries 表的数据结构
interface EntryWithUser {
  id: string;
  user_id: string;
  lottery_id: string;
  numbers: string; // 7位数开奖码
  is_winning: boolean;
  created_at: string;
  user?: {
    phone_number: string;
  };
}

interface LotteryDetail extends Tables<'lotteries'> {
  winning_user?: {
    phone_number: string;
  };
}

const getLocalizedText = (jsonb: any, language: string = 'zh', fallbackLanguage: string = 'en'): string => {
  if (!jsonb || typeof jsonb !== 'object') {return '';}
  if (jsonb[language]) {return jsonb[language];}
  if (jsonb[fallbackLanguage]) {return jsonb[fallbackLanguage];}
  const firstValue = Object.values(jsonb).find(value => typeof value === 'string' && value.trim() !== '');
  return firstValue as string || '';
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'ACTIVE':
      return 'bg-green-100 text-green-800';
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800';
    case 'COMPLETED':
      return 'bg-blue-100 text-blue-800';
    case 'SOLD_OUT':
      return 'bg-purple-100 text-purple-800';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

// 解析 numbers 字段（可能是jsonb字符串或数字）
const parseTicketNumber = (numbers: any): number => {
  if (typeof numbers === 'string') {
    // 如果是带引号的字符串，去掉引号
    return parseInt(numbers.replace(/"/g, '')) || 0;
  }
  return Number(numbers) || 0;
};

// 格式化7位数开奖码显示
const formatTicketNumber = (num: number): string => {
  return String(num).padStart(7, '0');
};

export const LotteryDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { supabase } = useSupabase();
  const navigate = useNavigate();
  const [lottery, setLottery] = useState<LotteryDetail | null>(null);
  const [entries, setEntries] = useState<EntryWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [entriesPage, setEntriesPage] = useState(1);
  const [entriesHasMore, setEntriesHasMore] = useState(true);
  const ENTRIES_LIMIT = 20;

  useEffect(() => {
    if (id) {
      fetchLotteryDetail();
      fetchEntries();
    }
  }, [id, entriesPage]);

  const fetchLotteryDetail = async () => {
    try {
      setIsLoading(true);
      
      // 获取商城详情
      const { data: lotteryData, error: lotteryError } = await supabase
        .from('lotteries')
        .select('*')
        .eq('id', id)
        .single();

      if (lotteryError) {throw lotteryError;}

      // 如果有中奖用户，获取用户信息
      if (lotteryData.winning_user_id) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('phone_number')
          .eq('id', lotteryData.winning_user_id)
          .single();

        if (!userError && userData) {
          setLottery({
            ...lotteryData,
            winning_user: userData
          });
        } else {
          setLottery(lotteryData);
        }
      } else {
        setLottery(lotteryData);
      }
    } catch (error: any) {
      toast.error(`加载商城详情失败: ${error.message}`);
      console.error('Error loading lottery detail:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEntries = async () => {
    try {
      const from = (entriesPage - 1) * ENTRIES_LIMIT;
      const to = from + ENTRIES_LIMIT - 1;

      // 从 lottery_entries 表获取参与记录
      const { data: entriesData, error: entriesError } = await supabase
        .from('lottery_entries')
        .select('*')
        .eq('lottery_id', id)
        .order('created_at', { ascending: true })
        .range(from, to);

      if (entriesError) {throw entriesError;}

      // 获取用户信息
      const userIds = [...new Set(entriesData?.map(e => e.user_id) || [])];
      let usersMap: Record<string, { phone_number: string | null }> = {};
      
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, phone_number')
          .in('id', userIds);
        
        if (usersData) {
          usersMap = usersData.reduce((acc, user) => {
            acc[user.id] = { phone_number: user.phone_number };
            return acc;
          }, {} as Record<string, { phone_number: string | null }>);
        }
      }

      // 合并用户信息
      const entriesWithUser = (entriesData || []).map(entry => ({
        ...entry,
        numbers: entry.numbers as string,
        user: usersMap[entry.user_id]
      }));

      setEntries(entriesWithUser);
      setEntriesHasMore((entriesData || []).length === ENTRIES_LIMIT);
    } catch (error: any) {
      toast.error(`加载参与记录失败: ${error.message}`);
      console.error('Error loading entries:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-lg">加载中...</div>
        </div>
      </div>
    );
  }

  if (!lottery) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-lg text-red-600">商城不存在</div>
          <Button onClick={() => navigate('/lotteries')} className="mt-4">
            返回列表
          </Button>
        </div>
      </div>
    );
  }

  const progress = lottery.total_tickets > 0 
    ? ((lottery.sold_tickets || 0) / lottery.total_tickets * 100).toFixed(2)
    : '0.00';

  // 按用户分组统计票数
  const userEntriesMap = new Map<string, { username: string; count: number; tickets: number[] }>();
  entries.forEach(entry => {
    const userId = entry.user_id;
    const username = entry.user?.phone_number || '未知用户';
    const ticketNumber = parseTicketNumber(entry.numbers);
    
    if (!userEntriesMap.has(userId)) {
      userEntriesMap.set(userId, {
        username,
        count: 0,
        tickets: []
      });
    }
    
    const userInfo = userEntriesMap.get(userId)!;
    userInfo.count++;
    userInfo.tickets.push(ticketNumber);
  });

  const userStats = Array.from(userEntriesMap.entries()).map(([userId, info]) => ({
    userId,
    ...info
  })).sort((a, b) => b.count - a.count);

  // 获取中奖号码
  const winningTicketNumber = lottery.winning_numbers?.[0] 
    ? parseTicketNumber(lottery.winning_numbers[0])
    : lottery.winning_ticket_number;

  return (
    <div className="space-y-6">
      {/* 返回按钮 */}
      <Button variant="outline" onClick={() => navigate('/lotteries')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        返回列表
      </Button>

      {/* 基本信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">商城详情 - 期号 {lottery.period}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-start space-x-4">
              {lottery.image_url && (
                <img 
                  src={lottery.image_url} 
                  alt={getLocalizedText(lottery.title_i18n)}
                  className="w-24 h-24 object-cover rounded-lg"
                />
              )}
              <div>
                <div className="text-sm text-gray-500">商品名称</div>
                <div className="font-medium">{getLocalizedText(lottery.title_i18n)}</div>
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">状态</div>
              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(lottery.status)}`}>
                {lottery.status}
              </span>
            </div>
            <div>
              <div className="text-sm text-gray-500">票价</div>
              <div className="font-medium">TJS {lottery.ticket_price}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">销售进度</div>
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="font-medium">{lottery.sold_tickets || 0} / {lottery.total_tickets}</span>
                <span className="text-sm text-gray-500">({progress}%)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 中奖信息 */}
      {lottery.status === 'COMPLETED' && winningTicketNumber && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Trophy className="mr-2 h-5 w-5 text-yellow-500" />
              中奖信息
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-500">中奖票号</div>
                <div className="text-2xl font-bold text-yellow-600">#{formatTicketNumber(winningTicketNumber)}</div>
              </div>
              {lottery.winning_user && (
                <div>
                  <div className="text-sm text-gray-500">中奖用户</div>
                  <div className="font-medium">
                    {lottery.winning_user.phone_number}
                  </div>
                </div>
              )}
              {lottery.draw_time && (
                <div>
                  <div className="text-sm text-gray-500">开奖时间</div>
                  <div className="font-medium">{formatDateTime(lottery.draw_time)}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 参与用户统计 */}
      {userStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="mr-2 h-5 w-5" />
              参与用户统计 (共 {userStats.length} 人)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>排名</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>购买票数</TableHead>
                  <TableHead>票号范围</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userStats.map((user, index) => (
                  <TableRow key={user.userId}>
                    <TableCell className="font-medium">#{index + 1}</TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{user.count} 张</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {user.tickets.length > 3
                        ? `#${formatTicketNumber(Math.min(...user.tickets))} - #${formatTicketNumber(Math.max(...user.tickets))}`
                        : user.tickets.map(t => `#${formatTicketNumber(t)}`).join(', ')
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 所有参与记录列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Ticket className="mr-2 h-5 w-5" />
            参与记录列表 (共 {lottery.sold_tickets || 0} 张)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-10 text-gray-500">暂无参与记录</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>票号</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>购买时间</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const ticketNumber = parseTicketNumber(entry.numbers);
                    const isWinning = winningTicketNumber && ticketNumber === winningTicketNumber;
                    
                    return (
                      <TableRow 
                        key={entry.id}
                        className={isWinning ? 'bg-yellow-50' : ''}
                      >
                        <TableCell className="font-medium">
                          #{formatTicketNumber(ticketNumber)}
                          {isWinning && (
                            <Trophy className="inline ml-2 h-4 w-4 text-yellow-500" />
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.user?.phone_number || '未知用户'}
                        </TableCell>
                        <TableCell>{formatDateTime(entry.created_at)}</TableCell>
                        <TableCell>
                          {isWinning ? (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                              中奖
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                              未中奖
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* 分页 */}
              <div className="flex justify-center space-x-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEntriesPage(p => Math.max(1, p - 1))}
                  disabled={entriesPage === 1}
                >
                  上一页
                </Button>
                <span className="px-4 py-2 text-sm text-gray-600">第 {entriesPage} 页</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEntriesPage(p => p + 1)}
                  disabled={!entriesHasMore}
                >
                  下一页
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LotteryDetailPage;
