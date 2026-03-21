import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Tables } from '@/types/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';

type UserProfile = Tables<'users'> & {
  referred_by_user?: Tables<'users'>;
};

interface ReferralStats {
  level1_count: number;
  level2_count: number;
  total_commission: number;
}

export const UserDetailsPage: React.FC = () => {
  const { supabase } = useSupabase();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [referralStats, setReferralStats] = useState<ReferralStats>({
    level1_count: 0,
    level2_count: 0,
    total_commission: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    if (!id) {return;}
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {throw error;}

      // 手动查询邀请人信息
      let referredByUser = null;
      if (data?.referred_by_id) {
        const { data: referrer } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.referred_by_id)
          .single();
        referredByUser = referrer;
      }

      setUser({ ...data, referred_by_user: referredByUser } as UserProfile);
      
      // 查询邀请统计
      await fetchReferralStats(id);
    } catch (error) {
      toast.error(`加载用户详情失败: ${error.message}`);
      console.error('Error loading user:', error);
    } finally {
      setIsLoading(false);
    }
  }, [id, supabase]);

  const fetchReferralStats = async (userId: string) => {
    try {
      // 查询一级邀请人数
      const { data: level1Users, error: level1Error } = await supabase
        .from('users')
        .select('id')
        .eq('referred_by_id', userId);

      if (level1Error) {throw level1Error;}

      // 查询二级邀请人数
      let level2Count = 0;
      if (level1Users && level1Users.length > 0) {
        const level1Ids = level1Users.map(u => u.id);
        const { data: level2Users, error: level2Error } = await supabase
          .from('users')
          .select('id')
          .in('referred_by_id', level1Ids);

        if (!level2Error && level2Users) {
          level2Count = level2Users.length;
        }
      }

      // 查询累计佣金
      const { data: commissions, error: commissionError } = await supabase
        .from('commissions')
        .select('amount')
        .eq('user_id', userId);

      let totalCommission = 0;
      if (!commissionError && commissions) {
        totalCommission = commissions.reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);
      }

      setReferralStats({
        level1_count: level1Users?.length || 0,
        level2_count: level2Count,
        total_commission: totalCommission
      });
    } catch (error) {
      console.error('Error loading referral stats:', error);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  if (isLoading) {
    return <div className="text-center py-10">加载中...</div>;
  }

  if (!user) {
    return <div className="text-center py-10 text-red-500">用户未找到</div>;
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>用户详情: {user.phone_number || ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || '未知用户'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>用户 ID</Label>
            <Input value={user.id} readOnly />
          </div>
          <div className="space-y-2">
            <Label>手机号</Label>
            <Input value={user.phone_number} readOnly />
          </div>
          <div className="space-y-2">
            <Label>显示名</Label>
            <Input value={(user as any).display_name || user.first_name || '暂无'} readOnly />
          </div>
          <div className="space-y-2">
            <Label>姓名</Label>
            <Input value={`${user.first_name || ''} ${user.last_name || ''}`.trim() || '暂无'} readOnly />
          </div>
          <div className="space-y-2">
            <Label>邀请人</Label>
            <Input value={user.referred_by_user?.phone_number || '无'} readOnly />
          </div>
          <div className="space-y-2">
            <Label>邀请码</Label>
            <Input value={user.referral_code || '暂无'} readOnly />
          </div>
          <div className="space-y-2">
            <Label>注册时间</Label>
            <Input value={formatDateTime(user.created_at)} readOnly />
          </div>
          <div className="space-y-2">
            <Label>最后登录时间</Label>
            <Input value={user.last_login_at ? formatDateTime(user.last_login_at) : '暂无'} readOnly />
          </div>
        </div>

        
        <div className="pt-4 border-t">
          <h3 className="text-xl font-semibold mb-4">邀请层级</h3>
          <div className="grid grid-cols-3 gap-4">
            <StatCard title="一级邀请人数" value={referralStats.level1_count} />
            <StatCard title="二级邀请人数" value={referralStats.level2_count} />
            <StatCard title="累计佣金 (TJS)" value={referralStats.total_commission.toFixed(2)} />
          </div>
          <Button variant="outline" className="mt-4" onClick={() => navigate(`/admin/referral-management?search=${user.phone_number}`)}>
            查看邀请列表
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// StatCard组件定义
const StatCard: React.FC<{ title: string; value: string | number }> = ({ title, value }) => (
  <Card>
    <CardContent className="pt-6">
      <div className="text-2xl font-bold">{value}</div>
      <p className="text-xs text-muted-foreground">{title}</p>
    </CardContent>
  </Card>
);
