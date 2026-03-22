/**
 * PromoterSettlementPage.tsx
 * 地推人员缴款管理页面
 *
 * 功能模块：
 * 1. 按日期查看地推人员的缴款记录
 * 2. 统计概览 - 待缴款/已缴款/有差异的记录数和金额
 * 3. 确认缴款 - 填写实缴金额、选择方式、上传凭证
 * 4. 查看转账凭证图片
 *
 * 数据库表对照（promoter_settlements 表）：
 * - id: UUID
 * - promoter_id: TEXT (关联 users.id)
 * - settlement_date: DATE
 * - total_deposit_amount: NUMERIC(12,2) (系统自动累加)
 * - total_deposit_count: INTEGER (系统自动累加)
 * - settlement_amount: NUMERIC(12,2) (管理员确认时填写)
 * - settlement_method: TEXT ('cash' | 'transfer')
 * - proof_image_url: TEXT (单个 URL)
 * - settlement_status: TEXT ('pending' | 'settled' | 'discrepancy')
 * - confirmed_by: TEXT
 * - confirmed_at: TIMESTAMPTZ
 * - note: TEXT
 *
 * 设计原则：
 * - 使用 RPC 函数获取数据和执行操作，确保安全性
 * - 使用 useAdminAuth 获取管理员信息用于审计
 * - 使用 auditLogger 记录所有关键操作
 * - 与现有管理后台页面保持一致的代码风格
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { ImageUpload } from '../components/ui/ImageUpload';
import { toast } from 'react-hot-toast';
import { auditLog, createAuditTimer } from '../lib/auditLogger';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Clock,
  CheckCircle,
  AlertTriangle,
  Eye,
  Banknote,
  CreditCard,
  FileText,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================
interface PromoterSettlement {
  id: string;
  promoter_id: string;
  settlement_date: string;
  total_deposit_amount: number;
  total_deposit_count: number;
  settlement_amount: number | null;
  settlement_method: string | null;
  proof_image_url: string | null;
  settlement_status: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  // 关联字段
  promoter_name: string;
  promoter_phone_number: string | null;
}

interface SettlementStats {
  total_records: number;
  pending_count: number;
  settled_count: number;
  discrepancy_count: number;
  total_deposit_amount: number;
  total_settled_amount: number;
}

interface SettlementForm {
  amount: string;
  method: 'cash' | 'transfer';
  proof_image_url: string;
  note: string;
}

// ============================================================
// Helpers
// ============================================================
function safeNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '--';
  try {
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * 获取 Asia/Dushanbe 时区的当前日期字符串 (YYYY-MM-DD)
 */
function getDushanbeToday(): string {
  const now = new Date();
  const dushanbeOffset = 5 * 60; // UTC+5
  const localOffset = now.getTimezoneOffset();
  const dushanbeTime = new Date(now.getTime() + (dushanbeOffset + localOffset) * 60000);
  return dushanbeTime.toISOString().split('T')[0];
}

// ============================================================
// Main Component
// ============================================================
export default function PromoterSettlementPage() {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();

  // 日期选择
  const [selectedDate, setSelectedDate] = useState(getDushanbeToday());

  // 数据状态
  const [settlements, setSettlements] = useState<PromoterSettlement[]>([]);
  const [stats, setStats] = useState<SettlementStats>({
    total_records: 0,
    pending_count: 0,
    settled_count: 0,
    discrepancy_count: 0,
    total_deposit_amount: 0,
    total_settled_amount: 0,
  });
  const [loading, setLoading] = useState(true);

  // 确认缴款对话框
  const [settlingItem, setSettlingItem] = useState<PromoterSettlement | null>(null);
  const [settlementForm, setSettlementForm] = useState<SettlementForm>({
    amount: '',
    method: 'cash',
    proof_image_url: '',
    note: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // 凭证查看对话框
  const [viewingProofUrl, setViewingProofUrl] = useState<string | null>(null);

  // ============================================================
  // Data Fetching - 使用 RPC 函数
  // ============================================================
  const fetchSettlements = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_settlement_list', {
        p_settlement_date: selectedDate,
      });

      if (error) throw error;

      const result = data as any;

      // 安全转换金额字段
      const records: PromoterSettlement[] = (result.records || []).map((s: any) => ({
        ...s,
        total_deposit_amount: safeNumber(s.total_deposit_amount),
        total_deposit_count: safeNumber(s.total_deposit_count),
        settlement_amount: s.settlement_amount !== null ? safeNumber(s.settlement_amount) : null,
      }));

      setSettlements(records);

      // 设置统计数据
      const statsData = result.stats || {};
      setStats({
        total_records: safeNumber(statsData.total_records),
        pending_count: safeNumber(statsData.pending_count),
        settled_count: safeNumber(statsData.settled_count),
        discrepancy_count: safeNumber(statsData.discrepancy_count),
        total_deposit_amount: safeNumber(statsData.total_deposit_amount),
        total_settled_amount: safeNumber(statsData.total_settled_amount),
      });
    } catch (err: any) {
      console.error('Error fetching settlements:', err);
      toast.error('获取缴款记录失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedDate]);

  useEffect(() => {
    fetchSettlements();
  }, [fetchSettlements]);

  // ============================================================
  // 确认缴款
  // ============================================================
  const openSettlementDialog = (item: PromoterSettlement) => {
    setSettlingItem(item);
    setSettlementForm({
      amount: item.total_deposit_amount > 0 ? item.total_deposit_amount.toString() : '',
      method: 'cash',
      proof_image_url: '',
      note: '',
    });
  };

  const handleConfirmSettlement = async () => {
    if (!settlingItem || !admin) return;

    const amount = parseFloat(settlementForm.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('请输入有效的缴款金额');
      return;
    }

    if (settlementForm.method === 'transfer' && !settlementForm.proof_image_url) {
      toast.error('转账方式请上传转账凭证');
      return;
    }

    setSubmitting(true);
    const timer = createAuditTimer(supabase, {
      adminId: admin.id,
      action: 'CONFIRM_SETTLEMENT',
      targetType: 'promoter_settlement',
      targetId: settlingItem.id,
      details: {
        settlement_date: settlingItem.settlement_date,
        promoter_id: settlingItem.promoter_id,
        promoter_name: settlingItem.promoter_name,
      },
    });

    try {
      const { data, error } = await supabase.rpc('confirm_promoter_settlement', {
        p_settlement_id: settlingItem.id,
        p_settlement_amount: amount,
        p_settlement_method: settlementForm.method,
        p_proof_image_url: settlementForm.proof_image_url || null,
        p_note: settlementForm.note || null,
        p_admin_id: admin.username || admin.id,
      });

      if (error) throw error;

      const result = data as any;
      if (!result.success) {
        throw new Error(result.detail || result.error || '操作失败');
      }

      await timer.success({
        newData: {
          settlement_amount: amount,
          settlement_method: settlementForm.method,
          new_status: result.new_status,
          is_discrepancy: result.is_discrepancy,
        },
      });

      if (result.is_discrepancy) {
        toast.error(
          `已标记为金额差异：实缴 ${formatAmount(amount)} TJS，应缴 ${formatAmount(safeNumber(result.total_deposit_amount))} TJS`,
          { duration: 5000 }
        );
      } else {
        toast.success('缴款确认成功');
      }

      setSettlingItem(null);
      fetchSettlements();
    } catch (err: any) {
      await timer.fail(err.message);
      toast.error('操作失败: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================
  // 日期导航
  // ============================================================
  const navigateDate = (direction: -1 | 1) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + direction);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  // ============================================================
  // 状态徽章
  // ============================================================
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="w-3 h-3 mr-1" />
            待缴款
          </Badge>
        );
      case 'settled':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            已缴款
          </Badge>
        );
      case 'discrepancy':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <AlertTriangle className="w-3 h-3 mr-1" />
            金额差异
          </Badge>
        );
      default:
        return <Badge variant="outline">{status || '未知'}</Badge>;
    }
  };

  const getMethodText = (method: string | null) => {
    switch (method) {
      case 'cash':
        return (
          <span className="flex items-center gap-1 text-sm text-gray-700">
            <Banknote className="w-3.5 h-3.5 text-green-600" />
            现金
          </span>
        );
      case 'transfer':
        return (
          <span className="flex items-center gap-1 text-sm text-gray-700">
            <CreditCard className="w-3.5 h-3.5 text-blue-600" />
            转账
          </span>
        );
      default:
        return <span className="text-sm text-gray-400">--</span>;
    }
  };

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-7 h-7 text-blue-600" />
            缴款管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">确认地推人员每日缴款状态，标记现金/转账方式</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSettlements}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 日期选择器 */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigateDate(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              {selectedDate === getDushanbeToday() && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  今天
                </Badge>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateDate(1)}
              disabled={selectedDate >= getDushanbeToday()}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDate(getDushanbeToday())}
              className="ml-2"
            >
              回到今天
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-gray-500 mb-1">总记录</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total_records}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-gray-500 mb-1">待缴款</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.pending_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-gray-500 mb-1">已缴款</p>
            <p className="text-2xl font-bold text-green-600">{stats.settled_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-gray-500 mb-1">有差异</p>
            <p className="text-2xl font-bold text-red-600">{stats.discrepancy_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-gray-500 mb-1">应缴总额</p>
            <p className="text-lg font-bold text-gray-900">{formatAmount(stats.total_deposit_amount)} <span className="text-xs font-normal">TJS</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-gray-500 mb-1">实缴总额</p>
            <p className="text-lg font-bold text-green-600">{formatAmount(stats.total_settled_amount)} <span className="text-xs font-normal">TJS</span></p>
          </CardContent>
        </Card>
      </div>

      {/* 缴款记录表格 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">加载中...</span>
            </div>
          ) : settlements.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <DollarSign className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>该日期暂无缴款记录</p>
              <p className="text-xs text-gray-400 mt-1">缴款记录在地推人员执行充值操作时自动创建</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>地推人员</TableHead>
                  <TableHead className="text-right">充值笔数</TableHead>
                  <TableHead className="text-right">应缴金额</TableHead>
                  <TableHead className="text-right">实缴金额</TableHead>
                  <TableHead>缴款方式</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>确认人</TableHead>
                  <TableHead>确认时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{s.promoter_name}</p>
                        {s.promoter_phone_number && (
                          <p className="text-xs text-gray-400">手机: {s.promoter_phone_number}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{s.total_deposit_count}</TableCell>
                    <TableCell className="text-right font-medium text-gray-900">
                      {formatAmount(s.total_deposit_amount)} TJS
                    </TableCell>
                    <TableCell className="text-right">
                      {s.settlement_amount !== null ? (
                        <span className={`font-medium ${
                          s.settlement_status === 'discrepancy' ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {formatAmount(s.settlement_amount)} TJS
                        </span>
                      ) : (
                        <span className="text-gray-400">--</span>
                      )}
                    </TableCell>
                    <TableCell>{getMethodText(s.settlement_method)}</TableCell>
                    <TableCell>{getStatusBadge(s.settlement_status)}</TableCell>
                    <TableCell className="text-sm text-gray-600">{s.confirmed_by || '--'}</TableCell>
                    <TableCell className="text-sm text-gray-500">{formatDateTime(s.confirmed_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {(s.settlement_status === 'pending' || s.settlement_status === 'discrepancy') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openSettlementDialog(s)}
                            className={s.settlement_status === 'discrepancy' ? 'border-red-300 text-red-600 hover:bg-red-50' : ''}
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-1" />
                            {s.settlement_status === 'discrepancy' ? '重新确认' : '确认'}
                          </Button>
                        )}
                        {s.proof_image_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setViewingProofUrl(s.proof_image_url)}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            凭证
                          </Button>
                        )}
                        {s.note && (
                          <Button
                            variant="outline"
                            size="sm"
                            title={s.note}
                            onClick={() => toast(s.note || '', { icon: '📝', duration: 3000 })}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ==================== 确认缴款对话框 ==================== */}
      <Dialog open={!!settlingItem} onOpenChange={(open) => !open && setSettlingItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认缴款</DialogTitle>
          </DialogHeader>
          {settlingItem && (
            <div className="space-y-4">
              {/* 地推人员信息 */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-900">{settlingItem.promoter_name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  日期: {settlingItem.settlement_date} | 充值笔数: {settlingItem.total_deposit_count}
                </p>
                <p className="text-sm font-bold text-gray-900 mt-2">
                  应缴金额: <span className="text-blue-600">{formatAmount(settlingItem.total_deposit_amount)} TJS</span>
                </p>
              </div>

              {/* 实缴金额 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">实缴金额 (TJS)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settlementForm.amount}
                  onChange={(e) => setSettlementForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="输入实际缴款金额"
                />
              </div>

              {/* 缴款方式 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">缴款方式</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSettlementForm((prev) => ({ ...prev, method: 'cash', proof_image_url: '' }))}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                      settlementForm.method === 'cash'
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    <span className="font-medium">现金</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettlementForm((prev) => ({ ...prev, method: 'transfer' }))}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                      settlementForm.method === 'transfer'
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span className="font-medium">转账</span>
                  </button>
                </div>
              </div>

              {/* 转账凭证上传 */}
              {settlementForm.method === 'transfer' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">转账凭证</label>
                  <ImageUpload
                    value={settlementForm.proof_image_url ? [settlementForm.proof_image_url] : []}
                    onChange={(urls) =>
                      setSettlementForm((prev) => ({
                        ...prev,
                        proof_image_url: urls[0] || '',
                      }))
                    }
                    maxImages={1}
                    bucket="settlement-proofs"
                  />
                </div>
              )}

              {/* 备注 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注（可选）</label>
                <textarea
                  value={settlementForm.note}
                  onChange={(e) => setSettlementForm((prev) => ({ ...prev, note: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="如有差异请说明原因..."
                />
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSettlingItem(null)}>
                  取消
                </Button>
                <Button onClick={handleConfirmSettlement} disabled={submitting}>
                  {submitting ? '提交中...' : '确认缴款'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================== 凭证查看对话框 ==================== */}
      <Dialog open={!!viewingProofUrl} onOpenChange={(open) => !open && setViewingProofUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>缴款凭证</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {viewingProofUrl && (
              <img
                src={viewingProofUrl}
                alt="缴款凭证"
                className="w-full rounded-lg border"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  toast.error('凭证图片加载失败');
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
