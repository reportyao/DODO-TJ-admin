import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { toast } from 'react-hot-toast';
import {
  AlertTriangle,
  RefreshCw,
  Bell,
  DollarSign,
  Clock,
  CheckCircle,
  Eye,
  Users,
  Filter,
  ExternalLink,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface DepositAlert {
  id: string;
  user_id: string;
  order_number: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_proof_images: string[];
  payment_reference: string;
  payer_name: string;
  payer_account: string;
  status: string;
  created_at: string;
  // Enriched fields
  user_name: string;
  phone_number: string;
  referral_code: string;
  referred_by_name: string;
  is_promoter_referred: boolean;
  promoter_name: string;
  alert_type: AlertType;
  alert_reason: string;
  wait_minutes: number;
}

type AlertType = 'pending_long' | 'large_amount' | 'rapid_succession' | 'promoter_referred' | 'normal_pending';

interface AlertConfig {
  pending_threshold_minutes: number;
  large_amount_threshold: number;
  rapid_succession_minutes: number;
  rapid_succession_count: number;
}

type FilterTab = 'all' | 'urgent' | 'promoter';

// ============================================================
// Constants
// ============================================================

const DEFAULT_CONFIG: AlertConfig = {
  pending_threshold_minutes: 30,
  large_amount_threshold: 200,
  rapid_succession_minutes: 10,
  rapid_succession_count: 3,
};

// ============================================================
// Main Component
// ============================================================

export default function DepositAlertsPage() {
  const { supabase } = useSupabase();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<DepositAlert[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [config, setConfig] = useState<AlertConfig>(DEFAULT_CONFIG);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<DepositAlert | null>(null);

  // ============================================================
  // Data Fetching
  // ============================================================

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch pending deposit requests (only PENDING status - monitoring focus)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: deposits, error: depError } = await supabase
        .from('deposit_requests')
        .select('*')
        .eq('status', 'PENDING')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: true }); // Oldest first (most urgent)

      if (depError) throw depError;

      if (!deposits || deposits.length === 0) {
        setAlerts([]);
        setLoading(false);
        return;
      }

      // 2. Fetch user info
      const userIds = [...new Set(deposits.map(d => d.user_id))];
      const { data: usersData } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone_number, referral_code, referred_by_id')
        .in('id', userIds);

      const usersMap: Record<string, any> = {};
      usersData?.forEach(u => { usersMap[u.id] = u; });

      // 3. Fetch promoter profiles to identify promoter-referred users
      const { data: promoterProfiles } = await supabase
        .from('promoter_profiles')
        .select('user_id')
        .eq('promoter_status', 'active');

      const promoterUserIds = new Set(promoterProfiles?.map(p => p.user_id) || []);

      // 4. Fetch promoter user names
      let promoterNamesMap: Record<string, string> = {};
      if (promoterUserIds.size > 0) {
        const { data: promoterUsers } = await supabase
          .from('users')
          .select('id, first_name, last_name, phone_number')
          .in('id', Array.from(promoterUserIds));
        if (promoterUsers) {
          promoterNamesMap = Object.fromEntries(promoterUsers.map(u => [
            u.id,
            u.phone_number || [u.first_name, u.last_name].filter(Boolean).join(' ') || 'N/A'
          ]));
        }
      }

      // 5. Build alerts with classification
      const now = new Date();
      const enrichedAlerts: DepositAlert[] = deposits.map(dep => {
        const user = usersMap[dep.user_id];
        const userName = user?.phone_number || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'N/A';
        const referredById = user?.referred_by_id;
        const isPromoterReferred = referredById ? promoterUserIds.has(referredById) : false;
        const promoterName = referredById && isPromoterReferred ? promoterNamesMap[referredById] || '' : '';

        const referredByUser = referredById ? usersMap[referredById] : null;
        const referredByName = referredByUser
          ? (referredByUser.phone_number || [referredByUser.first_name, referredByUser.last_name].filter(Boolean).join(' ') || '')
          : '';

        const createdAt = new Date(dep.created_at);
        const waitMinutes = Math.round((now.getTime() - createdAt.getTime()) / 60000);

        // Classify alert type (priority order: timeout > large > rapid > promoter > normal)
        let alertType: AlertType = 'normal_pending';
        let alertReason = '待审核';

        if (waitMinutes >= config.pending_threshold_minutes) {
          alertType = 'pending_long';
          alertReason = `等待超过 ${waitMinutes} 分钟`;
        } else if (dep.amount >= config.large_amount_threshold) {
          alertType = 'large_amount';
          alertReason = `大额充值 ${dep.amount} ${dep.currency}`;
        } else if (isPromoterReferred) {
          alertType = 'promoter_referred';
          alertReason = `地推用户 (推荐人: ${promoterName})`;
        }

        return {
          ...dep,
          user_name: userName,
          phone_number: user?.phone_number || '',
          referral_code: user?.referral_code || '',
          referred_by_name: referredByName,
          is_promoter_referred: isPromoterReferred,
          promoter_name: promoterName,
          alert_type: alertType,
          alert_reason: alertReason,
          wait_minutes: waitMinutes,
        };
      });

      // Check for rapid succession
      const userDepositCounts: Record<string, number> = {};
      const recentWindow = new Date(now.getTime() - config.rapid_succession_minutes * 60000);
      deposits.forEach(dep => {
        if (new Date(dep.created_at) >= recentWindow) {
          userDepositCounts[dep.user_id] = (userDepositCounts[dep.user_id] || 0) + 1;
        }
      });

      enrichedAlerts.forEach(alert => {
        if (
          (userDepositCounts[alert.user_id] || 0) >= config.rapid_succession_count &&
          alert.alert_type === 'normal_pending'
        ) {
          alert.alert_type = 'rapid_succession';
          alert.alert_reason = `${config.rapid_succession_minutes}分钟内提交${userDepositCounts[alert.user_id]}笔`;
        }
      });

      setAlerts(enrichedAlerts);
    } catch (err: any) {
      console.error('Failed to fetch deposit alerts:', err);
      toast.error('加载充值告警失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, config]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Auto refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // ============================================================
  // Filtering
  // ============================================================

  const filteredAlerts = alerts.filter(a => {
    switch (filterTab) {
      case 'urgent':
        return a.alert_type === 'pending_long' || a.alert_type === 'large_amount' || a.alert_type === 'rapid_succession';
      case 'promoter':
        return a.is_promoter_referred;
      case 'all':
      default:
        return true;
    }
  });

  // ============================================================
  // Stats
  // ============================================================

  const pendingCount = alerts.length;
  const urgentCount = alerts.filter(a => a.alert_type === 'pending_long' || a.alert_type === 'large_amount' || a.alert_type === 'rapid_succession').length;
  const promoterPendingCount = alerts.filter(a => a.is_promoter_referred).length;
  const totalPendingAmount = alerts.reduce((s, a) => s + a.amount, 0);

  // ============================================================
  // Helper functions
  // ============================================================

  const getAlertBadge = (type: AlertType) => {
    switch (type) {
      case 'pending_long':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">超时</span>;
      case 'large_amount':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">大额</span>;
      case 'rapid_succession':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">频繁</span>;
      case 'promoter_referred':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">地推</span>;
      case 'normal_pending':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">待审</span>;
    }
  };

  const formatWaitTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}小时${mins > 0 ? mins + '分' : ''}`;
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-7 h-7" />
            充值监控告警
          </h1>
          <p className="text-gray-600 mt-1">
            实时监控待审充值状态，识别异常和地推相关充值 ·
            <a href="/admin/deposit-review" className="text-blue-600 hover:underline ml-1">
              前往充值审核页面处理 <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowConfigDialog(true)}>
            <Filter className="w-4 h-4 mr-1" /> 告警配置
          </Button>
          <Button size="sm" onClick={fetchAlerts} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3 border-l-4 border-yellow-400">
          <Clock className="w-8 h-8 text-yellow-500" />
          <div>
            <p className="text-xs text-gray-500">待审核</p>
            <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3 border-l-4 border-red-400">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <div>
            <p className="text-xs text-gray-500">紧急告警</p>
            <p className="text-2xl font-bold text-red-600">{urgentCount}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3 border-l-4 border-blue-400">
          <Users className="w-8 h-8 text-blue-500" />
          <div>
            <p className="text-xs text-gray-500">地推用户待审</p>
            <p className="text-2xl font-bold text-blue-600">{promoterPendingCount}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3 border-l-4 border-green-400">
          <DollarSign className="w-8 h-8 text-green-500" />
          <div>
            <p className="text-xs text-gray-500">待审金额</p>
            <p className="text-2xl font-bold text-gray-900">TJS {totalPendingAmount.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { key: 'all' as FilterTab, label: '全部待审', count: pendingCount },
          { key: 'urgent' as FilterTab, label: '紧急告警', count: urgentCount },
          { key: 'promoter' as FilterTab, label: '地推用户', count: promoterPendingCount },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilterTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filterTab === tab.key
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
              filterTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-600'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Alerts Table - Monitoring Only, No Review Actions */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>告警</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>支付方式</TableHead>
                  <TableHead>推荐人</TableHead>
                  <TableHead>凭证</TableHead>
                  <TableHead>等待时间</TableHead>
                  <TableHead>原因</TableHead>
                  <TableHead>提交时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAlerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-gray-500">
                      <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>{filterTab === 'all' ? '暂无待审核充值' : '暂无匹配记录'}</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAlerts.map(alert => (
                    <TableRow
                      key={alert.id}
                      className={
                        alert.alert_type === 'pending_long' ? 'bg-red-50' :
                        alert.alert_type === 'large_amount' ? 'bg-orange-50' :
                        alert.alert_type === 'rapid_succession' ? 'bg-purple-50' :
                        alert.is_promoter_referred ? 'bg-blue-50' : ''
                      }
                    >
                      <TableCell>{getAlertBadge(alert.alert_type)}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{alert.user_name}</div>
                        <div className="text-xs text-gray-500">{alert.phone_number}</div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {alert.amount} {alert.currency}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{alert.payment_method}</TableCell>
                      <TableCell>
                        {alert.is_promoter_referred ? (
                          <div>
                            <div className="text-sm font-medium text-blue-600">{alert.promoter_name}</div>
                            <div className="text-xs text-gray-500">地推人员</div>
                          </div>
                        ) : alert.referred_by_name ? (
                          <div className="text-sm text-gray-600">{alert.referred_by_name}</div>
                        ) : (
                          <span className="text-gray-400 text-sm">--</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {alert.payment_proof_images && alert.payment_proof_images.length > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setSelectedAlert(alert); setShowImageDialog(true); }}
                          >
                            <Eye className="w-3 h-3 mr-1" /> {alert.payment_proof_images.length}张
                          </Button>
                        ) : (
                          <span className="text-gray-400 text-sm">无</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm font-medium ${alert.wait_minutes >= config.pending_threshold_minutes ? 'text-red-600' : 'text-gray-600'}`}>
                          {formatWaitTime(alert.wait_minutes)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 max-w-xs">{alert.alert_reason}</TableCell>
                      <TableCell className="text-sm text-gray-500">{formatDateTime(alert.created_at)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tip: Go to review page */}
      {filteredAlerts.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-blue-800">
              有 <strong>{pendingCount}</strong> 笔充值待审核，请前往充值审核页面处理
            </span>
          </div>
          <a
            href="/admin/deposit-review"
            className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            前往审核 <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      )}

      {/* Image Preview Dialog */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>充值凭证预览</DialogTitle>
            <DialogDescription>
              用户: {selectedAlert?.user_name} | 金额: {selectedAlert?.amount} {selectedAlert?.currency}
              {selectedAlert?.is_promoter_referred && ` | 地推: ${selectedAlert?.promoter_name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Payment info */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">付款信息</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">付款人姓名:</span>
                  <span className="ml-2 font-medium">{selectedAlert?.payer_name || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-600">付款账号:</span>
                  <span className="ml-2 font-medium">{selectedAlert?.payer_account || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-600">支付参考:</span>
                  <span className="ml-2 font-medium">{selectedAlert?.payment_reference || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-600">支付方式:</span>
                  <span className="ml-2 font-medium">{selectedAlert?.payment_method || '-'}</span>
                </div>
              </div>
            </div>

            {/* Images */}
            <div>
              <h3 className="font-semibold mb-2">凭证图片</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedAlert?.payment_proof_images?.map((imageUrl, index) => (
                  <div key={index} className="border rounded-lg overflow-hidden">
                    <img
                      src={imageUrl}
                      alt={`凭证 ${index + 1}`}
                      className="w-full h-auto object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3E图片加载失败%3C/text%3E%3C/svg%3E';
                      }}
                    />
                    <div className="p-2 bg-gray-50 text-xs text-gray-600">
                      <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        在新窗口打开
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <a
                href="/admin/deposit-review"
                className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                前往审核页面处理 <ExternalLink className="w-4 h-4" />
              </a>
              <Button variant="outline" onClick={() => setShowImageDialog(false)}>关闭</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Config Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>告警配置</DialogTitle>
            <DialogDescription>设置告警触发条件的阈值</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                超时告警阈值 (分钟)
              </label>
              <input
                type="number"
                min="5"
                value={config.pending_threshold_minutes}
                onChange={(e) => setConfig(prev => ({ ...prev, pending_threshold_minutes: parseInt(e.target.value) || 30 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">充值待审核超过此时间将标记为超时告警</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                大额告警阈值 (TJS)
              </label>
              <input
                type="number"
                min="0"
                value={config.large_amount_threshold}
                onChange={(e) => setConfig(prev => ({ ...prev, large_amount_threshold: parseFloat(e.target.value) || 200 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">充值金额超过此值将标记为大额告警</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  频繁充值窗口 (分钟)
                </label>
                <input
                  type="number"
                  min="1"
                  value={config.rapid_succession_minutes}
                  onChange={(e) => setConfig(prev => ({ ...prev, rapid_succession_minutes: parseInt(e.target.value) || 10 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  频繁充值次数
                </label>
                <input
                  type="number"
                  min="2"
                  value={config.rapid_succession_count}
                  onChange={(e) => setConfig(prev => ({ ...prev, rapid_succession_count: parseInt(e.target.value) || 3 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">同一用户在窗口时间内提交超过指定次数的充值将标记为频繁告警</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowConfigDialog(false)}>关闭</Button>
              <Button onClick={() => { setShowConfigDialog(false); fetchAlerts(); }}>应用并刷新</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
