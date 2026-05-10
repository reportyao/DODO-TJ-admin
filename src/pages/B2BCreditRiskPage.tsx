/**
 * B2B P2 授信风控管理页
 *
 * 覆盖 P2 阶段核心后台功能：
 * 1. 授信额度与账期维护；
 * 2. 逾期订单识别与催收记录；
 * 3. 坏账申请、审批与核销；
 * 4. 当前筛选结果 CSV 导出、导出审计与打印。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSupabase } from '../contexts/SupabaseContext';
import { adminRpc } from '../lib/adminApi';

type TabKey = 'credit' | 'overdue' | 'badDebt';

interface CreditSummary {
  customer_count: number;
  credit_limit_total: number;
  credit_used_total: number;
  overdue_amount_total: number;
  bad_debt_total: number;
  overdue_customer_count: number;
  bad_debt_customer_count: number;
}

interface CreditOverviewItem {
  wholesaler_id: string;
  user_id: string;
  company_name: string | null;
  contact_phone: string | null;
  wholesaler_status: string | null;
  credit_status: string;
  credit_limit: number | string;
  credit_used: number | string;
  credit_available: number | string;
  payment_terms_days: number;
  overdue_amount: number | string;
  bad_debt_total: number | string;
  credit_note: string | null;
  credit_updated_at: string | null;
  last_overdue_at: string | null;
  open_order_count: number;
  open_balance_due: number | string;
  overdue_order_count: number;
  overdue_balance_due: number | string;
  due_soon_order_count: number;
  max_overdue_days: number;
  bad_debt_count: number;
  pending_bad_debt_amount: number | string;
  written_off_amount: number | string;
  credit_usage_percent: number | string;
  updated_at: string | null;
}

interface OverdueOrderItem {
  order_id: string;
  order_number: string;
  user_id: string;
  wholesaler_id: string | null;
  company_name: string | null;
  contact_phone: string | null;
  credit_status: string | null;
  total_amount: number | string;
  receivable_total: number | string;
  paid_total: number | string;
  balance_due: number | string;
  financial_status: string;
  fulfillment_status: string;
  payment_due_at: string | null;
  overdue_days_live: number;
  overdue_days_snapshot: number;
  risk_status: string;
  collection_status: string;
  collection_last_at: string | null;
  collection_next_at: string | null;
  bad_debt_status: string;
  created_at: string | null;
}

interface BadDebtItem {
  id: string;
  order_id: string;
  wholesaler_id: string | null;
  amount: number | string;
  status: string;
  reason: string;
  proof_urls: unknown;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  written_off_at: string | null;
  recovered_amount: number | string;
  note: string | null;
  order_number: string;
  receivable_total: number | string;
  paid_total: number | string;
  balance_due: number | string;
  financial_status: string;
  payment_due_at: string | null;
  company_name: string | null;
  contact_phone: string | null;
}

const PAGE_SIZE = 50;

const CREDIT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  normal: { label: '正常', color: 'bg-green-100 text-green-700 border-green-200' },
  on_hold: { label: '冻结', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  overdue: { label: '逾期', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  bad_debt: { label: '坏账', color: 'bg-red-100 text-red-700 border-red-200' },
  disabled: { label: '停用', color: 'bg-gray-200 text-gray-700 border-gray-300' },
};

const COLLECTION_STATUS_MAP: Record<string, { label: string; color: string }> = {
  none: { label: '未催收', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  pending: { label: '待催收', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  contacted: { label: '已联系', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  promised: { label: '承诺付款', color: 'bg-green-100 text-green-700 border-green-200' },
  escalated: { label: '升级处理', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  paused: { label: '暂停', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  closed: { label: '已关闭', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const BAD_DEBT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  none: { label: '无', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  pending: { label: '待审批', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  approved: { label: '已批准', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  rejected: { label: '已驳回', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  written_off: { label: '已核销', color: 'bg-red-100 text-red-700 border-red-200' },
  recovered: { label: '已回收', color: 'bg-green-100 text-green-700 border-green-200' },
};

const CONTACT_METHOD_OPTIONS = [
  { value: 'phone', label: '电话' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'sms', label: '短信' },
  { value: 'email', label: '邮件' },
  { value: 'visit', label: '上门' },
  { value: 'other', label: '其他' },
];

const CONTACT_RESULT_OPTIONS = [
  { value: 'contacted', label: '已联系' },
  { value: 'no_answer', label: '无人接听' },
  { value: 'promised', label: '承诺付款' },
  { value: 'disputed', label: '存在争议' },
  { value: 'refused', label: '拒绝付款' },
  { value: 'escalated', label: '升级处理' },
  { value: 'closed', label: '关闭' },
];

function n(value: number | string | null | undefined): number {
  if (value == null || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number | string | null | undefined): string {
  return n(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function formatDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function badge(map: Record<string, { label: string; color: string }>, value: string | null | undefined) {
  const item = map[value || ''] || { label: value || '—', color: 'bg-gray-100 text-gray-600 border-gray-200' };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${item.color}`}>{item.label}</span>;
}

function generateIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(fileName: string, headers: string[], rows: unknown[][]): void {
  const csv = [headers.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function EmptyState({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-gray-500">{text}</div>;
}

function LoadingOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-sm">
      <div className="rounded-lg bg-white px-4 py-3 text-sm text-gray-700 shadow">加载中...</div>
    </div>
  );
}

function SummaryCards({ summary }: { summary: CreditSummary | null }) {
  const data = summary || {
    customer_count: 0,
    credit_limit_total: 0,
    credit_used_total: 0,
    overdue_amount_total: 0,
    bad_debt_total: 0,
    overdue_customer_count: 0,
    bad_debt_customer_count: 0,
  };
  const usage = n(data.credit_limit_total) > 0 ? (n(data.credit_used_total) / n(data.credit_limit_total)) * 100 : 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <div className="rounded-xl border bg-white p-4">
        <div className="text-xs text-gray-500">授信客户</div>
        <div className="mt-1 text-2xl font-bold text-gray-900">{data.customer_count}</div>
      </div>
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <div className="text-xs text-blue-600">授信总额 TJS</div>
        <div className="mt-1 text-xl font-bold text-blue-800">{formatAmount(data.credit_limit_total)}</div>
      </div>
      <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
        <div className="text-xs text-orange-600">占用额度 TJS</div>
        <div className="mt-1 text-xl font-bold text-orange-800">{formatAmount(data.credit_used_total)}</div>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <div className="text-xs text-gray-500">使用率</div>
        <div className={`mt-1 text-xl font-bold ${usage >= 90 ? 'text-red-700' : usage >= 70 ? 'text-orange-700' : 'text-green-700'}`}>{usage.toFixed(1)}%</div>
      </div>
      <div className="rounded-xl border border-red-100 bg-red-50 p-4">
        <div className="text-xs text-red-600">逾期金额 TJS</div>
        <div className="mt-1 text-xl font-bold text-red-800">{formatAmount(data.overdue_amount_total)}</div>
      </div>
      <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
        <div className="text-xs text-purple-600">坏账金额 TJS</div>
        <div className="mt-1 text-xl font-bold text-purple-800">{formatAmount(data.bad_debt_total)}</div>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <div className="text-xs text-gray-500">风险客户</div>
        <div className="mt-1 text-xl font-bold text-gray-900">{data.overdue_customer_count + data.bad_debt_customer_count}</div>
      </div>
    </div>
  );
}

interface CreditEditForm {
  credit_limit: string;
  payment_terms_days: string;
  credit_status: string;
  note: string;
}

function CreditEditModal({ item, onClose, onSubmit, submitting }: {
  item: CreditOverviewItem;
  onClose: () => void;
  onSubmit: (form: CreditEditForm) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState<CreditEditForm>({
    credit_limit: String(n(item.credit_limit)),
    payment_terms_days: String(item.payment_terms_days ?? 0),
    credit_status: item.credit_status || 'normal',
    note: item.credit_note || '',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">编辑授信与账期</h2>
            <p className="mt-1 text-sm text-gray-500">{item.company_name || item.user_id}</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">授信额度 TJS</span>
              <input type="number" min="0" step="0.01" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">账期天数</span>
              <input type="number" min="0" step="1" value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">授信状态</span>
            <select value={form.credit_status} onChange={(e) => setForm({ ...form, credit_status: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
              {Object.entries(CREDIT_STATUS_MAP).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">调整说明</span>
            <textarea rows={4} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="记录授信调整、账期调整或冻结原因" />
          </label>
          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            当前占用 {formatAmount(item.credit_used)} TJS，可用 {formatAmount(item.credit_available)} TJS，最大逾期 {item.max_overdue_days || 0} 天。
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t p-5">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">取消</button>
          <button disabled={submitting} onClick={() => onSubmit(form)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">{submitting ? '保存中...' : '保存授信'}</button>
        </div>
      </div>
    </div>
  );
}

interface CollectionForm {
  contact_method: string;
  contact_result: string;
  note: string;
  promised_pay_at: string;
  next_follow_up_at: string;
}

function CollectionModal({ order, onClose, onSubmit, submitting }: {
  order: OverdueOrderItem;
  onClose: () => void;
  onSubmit: (form: CollectionForm) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState<CollectionForm>({
    contact_method: 'phone',
    contact_result: 'contacted',
    note: '',
    promised_pay_at: '',
    next_follow_up_at: '',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">新增催收记录</h2>
            <p className="mt-1 text-sm text-gray-500">订单 {order.order_number}，逾期 {order.overdue_days_live} 天，余额 {formatAmount(order.balance_due)} TJS</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">联系渠道</span>
              <select value={form.contact_method} onChange={(e) => setForm({ ...form, contact_method: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                {CONTACT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">催收结果</span>
              <select value={form.contact_result} onChange={(e) => setForm({ ...form, contact_result: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                {CONTACT_RESULT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">承诺付款时间</span>
              <input type="datetime-local" value={form.promised_pay_at} onChange={(e) => setForm({ ...form, promised_pay_at: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">下次跟进时间</span>
              <input type="datetime-local" value={form.next_follow_up_at} onChange={(e) => setForm({ ...form, next_follow_up_at: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">催收备注</span>
            <textarea rows={5} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="记录客户反馈、争议原因、承诺付款时间、下一步动作等" />
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t p-5">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">取消</button>
          <button disabled={submitting} onClick={() => onSubmit(form)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">{submitting ? '保存中...' : '保存催收记录'}</button>
        </div>
      </div>
    </div>
  );
}

function BadDebtRequestModal({ order, onClose, onSubmit, submitting }: {
  order: OverdueOrderItem;
  onClose: () => void;
  onSubmit: (amount: string, reason: string) => void;
  submitting: boolean;
}) {
  const [amount, setAmount] = useState(String(n(order.balance_due)));
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">申请坏账</h2>
            <p className="mt-1 text-sm text-gray-500">订单 {order.order_number}，未收余额 {formatAmount(order.balance_due)} TJS</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">坏账金额 TJS</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">申请原因</span>
            <textarea rows={5} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="说明逾期背景、催收结果、客户经营异常或失联证据等" />
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t p-5">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">取消</button>
          <button disabled={submitting} onClick={() => onSubmit(amount, reason)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">{submitting ? '提交中...' : '提交坏账申请'}</button>
        </div>
      </div>
    </div>
  );
}

function BadDebtReviewModal({ record, action, onClose, onSubmit, submitting }: {
  record: BadDebtItem;
  action: 'approve' | 'reject' | 'writeoff';
  onClose: () => void;
  onSubmit: (note: string) => void;
  submitting: boolean;
}) {
  const [note, setNote] = useState('');
  const title = action === 'approve' ? '审批通过坏账' : action === 'reject' ? '驳回坏账申请' : '核销坏账';
  const buttonClass = action === 'reject' ? 'bg-gray-700 hover:bg-gray-800' : action === 'writeoff' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">订单 {record.order_number}，金额 {formatAmount(record.amount)} TJS</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-600">&times;</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            <div className="font-medium text-gray-800">原申请原因</div>
            <div className="mt-1 whitespace-pre-wrap">{record.reason}</div>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">处理说明</span>
            <textarea rows={5} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="记录审批意见、驳回原因或核销依据" />
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t p-5">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">取消</button>
          <button disabled={submitting} onClick={() => onSubmit(note)} className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${buttonClass}`}>{submitting ? '处理中...' : '确认'}</button>
        </div>
      </div>
    </div>
  );
}

export default function B2BCreditRiskPage() {
  const { supabase } = useSupabase();
  const [activeTab, setActiveTab] = useState<TabKey>('credit');
  const [keyword, setKeyword] = useState('');
  const [creditStatus, setCreditStatus] = useState('all');
  const [collectionStatus, setCollectionStatus] = useState('all');
  const [badDebtStatus, setBadDebtStatus] = useState('all');
  const [minOverdueDays, setMinOverdueDays] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [creditItems, setCreditItems] = useState<CreditOverviewItem[]>([]);
  const [overdueItems, setOverdueItems] = useState<OverdueOrderItem[]>([]);
  const [badDebtItems, setBadDebtItems] = useState<BadDebtItem[]>([]);
  const [total, setTotal] = useState(0);

  const [editingCredit, setEditingCredit] = useState<CreditOverviewItem | null>(null);
  const [collectionOrder, setCollectionOrder] = useState<OverdueOrderItem | null>(null);
  const [badDebtOrder, setBadDebtOrder] = useState<OverdueOrderItem | null>(null);
  const [reviewRecord, setReviewRecord] = useState<{ record: BadDebtItem; action: 'approve' | 'reject' | 'writeoff' } | null>(null);

  const offset = page * PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetToFirstPage = useCallback(() => setPage(0), []);

  const loadCredit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminRpc<{ success: boolean; items: CreditOverviewItem[]; total: number; summary: CreditSummary }>(supabase, 'admin_b2b_credit_dashboard', {
        p_credit_status: creditStatus,
        p_keyword: keyword.trim() || null,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });
      setCreditItems(res.items || []);
      setSummary(res.summary || null);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(`加载授信总览失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase, creditStatus, keyword, offset]);

  const loadOverdue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminRpc<{ success: boolean; items: OverdueOrderItem[]; total: number }>(supabase, 'admin_b2b_overdue_order_list', {
        p_keyword: keyword.trim() || null,
        p_collection_status: collectionStatus,
        p_min_overdue_days: minOverdueDays ? Number(minOverdueDays) : null,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });
      setOverdueItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(`加载逾期订单失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase, keyword, collectionStatus, minOverdueDays, offset]);

  const loadBadDebt = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminRpc<{ success: boolean; items: BadDebtItem[]; total: number }>(supabase, 'admin_b2b_bad_debt_list', {
        p_status: badDebtStatus,
        p_keyword: keyword.trim() || null,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });
      setBadDebtItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(`加载坏账记录失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase, badDebtStatus, keyword, offset]);

  const reload = useCallback(async () => {
    if (activeTab === 'credit') await loadCredit();
    if (activeTab === 'overdue') await loadOverdue();
    if (activeTab === 'badDebt') await loadBadDebt();
  }, [activeTab, loadCredit, loadOverdue, loadBadDebt]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const currentRows = useMemo(() => {
    if (activeTab === 'credit') return creditItems;
    if (activeTab === 'overdue') return overdueItems;
    return badDebtItems;
  }, [activeTab, creditItems, overdueItems, badDebtItems]);

  const handleUpdateCredit = async (form: CreditEditForm) => {
    if (!editingCredit) return;
    const creditLimit = Number(form.credit_limit);
    const terms = Number(form.payment_terms_days);
    if (!Number.isFinite(creditLimit) || creditLimit < 0 || !Number.isFinite(terms) || terms < 0) {
      toast.error('授信额度和账期必须为非负数');
      return;
    }
    setSubmitting(true);
    try {
      const res = await adminRpc<{ success: boolean; message?: string }>(supabase, 'admin_b2b_update_wholesaler_credit', {
        p_wholesaler_id: editingCredit.wholesaler_id,
        p_credit_limit: creditLimit,
        p_payment_terms_days: Math.floor(terms),
        p_credit_status: form.credit_status,
        p_note: form.note.trim() || null,
        p_idempotency_key: generateIdempotencyKey('credit'),
      });
      toast.success(res.message || '授信信息已更新');
      setEditingCredit(null);
      await loadCredit();
    } catch (err: any) {
      toast.error(`授信保存失败: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecalculateCredit = async (wholesalerId?: string) => {
    setSubmitting(true);
    try {
      const res = await adminRpc<{ success: boolean; message?: string; processed_count?: number }>(supabase, 'admin_b2b_recalculate_credit', {
        p_wholesaler_id: wholesalerId || null,
      });
      toast.success(`${res.message || '授信占用已重算'}，处理 ${res.processed_count ?? 0} 个客户`);
      await loadCredit();
    } catch (err: any) {
      toast.error(`授信重算失败: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkOverdue = async () => {
    setSubmitting(true);
    try {
      const res = await adminRpc<{ success: boolean; message?: string; processed_count?: number }>(supabase, 'admin_b2b_mark_overdue', {
        p_order_ids: null,
        p_overdue_days_threshold: minOverdueDays ? Number(minOverdueDays) : 0,
      });
      toast.success(`${res.message || '逾期标记完成'}，处理 ${res.processed_count ?? 0} 单`);
      await loadOverdue();
    } catch (err: any) {
      toast.error(`标记逾期失败: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCollection = async (form: CollectionForm) => {
    if (!collectionOrder) return;
    if (!form.note.trim()) {
      toast.error('催收备注不能为空');
      return;
    }
    setSubmitting(true);
    try {
      const res = await adminRpc<{ success: boolean; message?: string }>(supabase, 'admin_b2b_add_collection_record', {
        p_order_id: collectionOrder.order_id,
        p_contact_method: form.contact_method,
        p_contact_result: form.contact_result,
        p_note: form.note.trim(),
        p_promised_pay_at: form.promised_pay_at ? new Date(form.promised_pay_at).toISOString() : null,
        p_next_follow_up_at: form.next_follow_up_at ? new Date(form.next_follow_up_at).toISOString() : null,
        p_attachments: [],
        p_idempotency_key: generateIdempotencyKey('collection'),
      });
      toast.success(res.message || '催收记录已保存');
      setCollectionOrder(null);
      await loadOverdue();
    } catch (err: any) {
      toast.error(`保存催收记录失败: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestBadDebt = async (amount: string, reason: string) => {
    if (!badDebtOrder) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error('坏账金额必须大于 0');
      return;
    }
    if (!reason.trim()) {
      toast.error('坏账申请原因不能为空');
      return;
    }
    setSubmitting(true);
    try {
      const res = await adminRpc<{ success: boolean; message?: string }>(supabase, 'admin_b2b_request_bad_debt', {
        p_order_id: badDebtOrder.order_id,
        p_amount: numericAmount,
        p_reason: reason.trim(),
        p_proof_urls: [],
        p_idempotency_key: generateIdempotencyKey('baddebt_req'),
      });
      toast.success(res.message || '坏账申请已提交');
      setBadDebtOrder(null);
      await loadOverdue();
    } catch (err: any) {
      toast.error(`坏账申请失败: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewBadDebt = async (note: string) => {
    if (!reviewRecord) return;
    setSubmitting(true);
    try {
      const { record, action } = reviewRecord;
      const res = action === 'writeoff'
        ? await adminRpc<{ success: boolean; message?: string }>(supabase, 'admin_b2b_writeoff_bad_debt', {
            p_record_id: record.id,
            p_note: note.trim() || null,
            p_idempotency_key: generateIdempotencyKey('baddebt_writeoff'),
          })
        : await adminRpc<{ success: boolean; message?: string }>(supabase, 'admin_b2b_review_bad_debt', {
            p_record_id: record.id,
            p_decision: action,
            p_reason: note.trim() || null,
            p_idempotency_key: generateIdempotencyKey('baddebt_review'),
          });
      toast.success(res.message || '坏账处理完成');
      setReviewRecord(null);
      await loadBadDebt();
    } catch (err: any) {
      toast.error(`坏账处理失败: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const logExport = async (fileName: string, rowCount: number) => {
    try {
      await adminRpc(supabase, 'admin_b2b_log_export', {
        p_export_type: activeTab,
        p_filter_json: {
          keyword: keyword.trim() || null,
          credit_status: creditStatus,
          collection_status: collectionStatus,
          bad_debt_status: badDebtStatus,
          min_overdue_days: minOverdueDays || null,
          page,
          page_size: PAGE_SIZE,
        },
        p_row_count: rowCount,
        p_file_name: fileName,
      });
    } catch (err: any) {
      toast.error(`导出审计记录失败: ${err.message}`);
    }
  };

  const handleExport = async () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    if (activeTab === 'credit') {
      const fileName = `b2b-credit-${stamp}.csv`;
      downloadCsv(fileName, ['客户', '电话', '状态', '授信额度', '占用额度', '可用额度', '账期天数', '逾期金额', '坏账金额', '最大逾期天数', '备注'], creditItems.map((x) => [x.company_name, x.contact_phone, CREDIT_STATUS_MAP[x.credit_status]?.label || x.credit_status, formatAmount(x.credit_limit), formatAmount(x.credit_used), formatAmount(x.credit_available), x.payment_terms_days, formatAmount(x.overdue_amount), formatAmount(x.bad_debt_total), x.max_overdue_days, x.credit_note || '']));
      await logExport(fileName, creditItems.length);
    } else if (activeTab === 'overdue') {
      const fileName = `b2b-overdue-${stamp}.csv`;
      downloadCsv(fileName, ['订单号', '客户', '电话', '余额', '到期时间', '逾期天数', '催收状态', '坏账状态', '下次跟进'], overdueItems.map((x) => [x.order_number, x.company_name, x.contact_phone, formatAmount(x.balance_due), formatDate(x.payment_due_at), x.overdue_days_live, COLLECTION_STATUS_MAP[x.collection_status]?.label || x.collection_status, BAD_DEBT_STATUS_MAP[x.bad_debt_status]?.label || x.bad_debt_status, formatDate(x.collection_next_at)]));
      await logExport(fileName, overdueItems.length);
    } else {
      const fileName = `b2b-bad-debt-${stamp}.csv`;
      downloadCsv(fileName, ['订单号', '客户', '电话', '金额', '状态', '原因', '申请时间', '审批时间', '核销时间', '订单余额'], badDebtItems.map((x) => [x.order_number, x.company_name, x.contact_phone, formatAmount(x.amount), BAD_DEBT_STATUS_MAP[x.status]?.label || x.status, x.reason, formatDate(x.requested_at), formatDate(x.approved_at), formatDate(x.written_off_at), formatAmount(x.balance_due)]));
      await logExport(fileName, badDebtItems.length);
    }
    toast.success('CSV 已导出，并已写入导出审计');
  };

  const handlePrint = () => {
    window.print();
  };

  const renderFilters = () => (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 print:hidden">
      <label className="block min-w-[240px] flex-1">
        <span className="text-xs font-medium text-gray-600">关键词</span>
        <input value={keyword} onChange={(e) => { setKeyword(e.target.value); resetToFirstPage(); }} placeholder="客户、电话、订单号或用户ID" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
      </label>
      {activeTab === 'credit' && (
        <label className="block w-44">
          <span className="text-xs font-medium text-gray-600">授信状态</span>
          <select value={creditStatus} onChange={(e) => { setCreditStatus(e.target.value); resetToFirstPage(); }} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
            <option value="all">全部</option>
            {Object.entries(CREDIT_STATUS_MAP).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </label>
      )}
      {activeTab === 'overdue' && (
        <>
          <label className="block w-44">
            <span className="text-xs font-medium text-gray-600">催收状态</span>
            <select value={collectionStatus} onChange={(e) => { setCollectionStatus(e.target.value); resetToFirstPage(); }} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
              <option value="all">全部</option>
              {Object.entries(COLLECTION_STATUS_MAP).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
          </label>
          <label className="block w-40">
            <span className="text-xs font-medium text-gray-600">最小逾期天数</span>
            <input type="number" min="0" value={minOverdueDays} onChange={(e) => { setMinOverdueDays(e.target.value); resetToFirstPage(); }} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
        </>
      )}
      {activeTab === 'badDebt' && (
        <label className="block w-44">
          <span className="text-xs font-medium text-gray-600">坏账状态</span>
          <select value={badDebtStatus} onChange={(e) => { setBadDebtStatus(e.target.value); resetToFirstPage(); }} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
            <option value="all">全部</option>
            {Object.entries(BAD_DEBT_STATUS_MAP).filter(([value]) => value !== 'none').map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </label>
      )}
      <button onClick={() => void reload()} className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">刷新</button>
      <button onClick={() => void handleExport()} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">导出 CSV</button>
      <button onClick={handlePrint} className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">打印</button>
      {activeTab === 'credit' && <button disabled={submitting} onClick={() => void handleRecalculateCredit()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">重算全部授信</button>}
      {activeTab === 'overdue' && <button disabled={submitting} onClick={() => void handleMarkOverdue()} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60">标记逾期</button>}
    </div>
  );

  const renderCreditTable = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">客户</th>
            <th className="px-4 py-3">授信状态</th>
            <th className="px-4 py-3 text-right">额度 / 占用 / 可用</th>
            <th className="px-4 py-3">账期</th>
            <th className="px-4 py-3 text-right">逾期 / 坏账</th>
            <th className="px-4 py-3">风险指标</th>
            <th className="px-4 py-3 print:hidden">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {creditItems.map((item) => (
            <tr key={item.wholesaler_id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900">{item.company_name || '未命名客户'}</div>
                <div className="text-xs text-gray-500">{item.contact_phone || '—'}</div>
                <div className="text-xs text-gray-400">{item.user_id}</div>
              </td>
              <td className="px-4 py-3">{badge(CREDIT_STATUS_MAP, item.credit_status)}</td>
              <td className="px-4 py-3 text-right">
                <div className="font-semibold text-gray-900">{formatAmount(item.credit_limit)}</div>
                <div className="text-xs text-orange-600">占用 {formatAmount(item.credit_used)}</div>
                <div className="text-xs text-green-600">可用 {formatAmount(item.credit_available)}</div>
              </td>
              <td className="px-4 py-3">
                <div>{item.payment_terms_days} 天</div>
                <div className="text-xs text-gray-500">使用率 {n(item.credit_usage_percent).toFixed(1)}%</div>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="text-red-700">逾期 {formatAmount(item.overdue_balance_due)}</div>
                <div className="text-xs text-purple-700">坏账 {formatAmount(item.bad_debt_total)}</div>
              </td>
              <td className="px-4 py-3 text-xs text-gray-600">
                <div>未结订单 {item.open_order_count} 单</div>
                <div>逾期订单 {item.overdue_order_count} 单</div>
                <div>最大逾期 {item.max_overdue_days || 0} 天</div>
              </td>
              <td className="px-4 py-3 print:hidden">
                <div className="flex flex-col gap-2">
                  <button onClick={() => setEditingCredit(item)} className="rounded border px-3 py-1 text-xs text-blue-700 hover:bg-blue-50">编辑授信</button>
                  <button disabled={submitting} onClick={() => void handleRecalculateCredit(item.wholesaler_id)} className="rounded border px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60">重算占用</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {creditItems.length === 0 && <EmptyState text="暂无授信客户数据" />}
    </div>
  );

  const renderOverdueTable = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">订单 / 客户</th>
            <th className="px-4 py-3 text-right">应收 / 已收 / 余额</th>
            <th className="px-4 py-3">到期与账龄</th>
            <th className="px-4 py-3">催收状态</th>
            <th className="px-4 py-3">坏账状态</th>
            <th className="px-4 py-3 print:hidden">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {overdueItems.map((item) => (
            <tr key={item.order_id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900">{item.order_number}</div>
                <div className="text-xs text-gray-500">{item.company_name || '未命名客户'} · {item.contact_phone || '—'}</div>
              </td>
              <td className="px-4 py-3 text-right">
                <div>{formatAmount(item.receivable_total)}</div>
                <div className="text-xs text-green-700">已收 {formatAmount(item.paid_total)}</div>
                <div className="font-semibold text-red-700">余额 {formatAmount(item.balance_due)}</div>
              </td>
              <td className="px-4 py-3">
                <div>{formatDate(item.payment_due_at)}</div>
                <div className="mt-1 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">逾期 {item.overdue_days_live} 天</div>
              </td>
              <td className="px-4 py-3">
                {badge(COLLECTION_STATUS_MAP, item.collection_status)}
                <div className="mt-1 text-xs text-gray-500">上次 {formatDate(item.collection_last_at)}</div>
                <div className="text-xs text-gray-500">下次 {formatDate(item.collection_next_at)}</div>
              </td>
              <td className="px-4 py-3">{badge(BAD_DEBT_STATUS_MAP, item.bad_debt_status)}</td>
              <td className="px-4 py-3 print:hidden">
                <div className="flex flex-col gap-2">
                  <button onClick={() => setCollectionOrder({ ...item, collection_next_at: item.collection_next_at ? formatDateInput(item.collection_next_at) : item.collection_next_at })} className="rounded border px-3 py-1 text-xs text-blue-700 hover:bg-blue-50">催收记录</button>
                  <button onClick={() => setBadDebtOrder(item)} className="rounded border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50">申请坏账</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {overdueItems.length === 0 && <EmptyState text="当前筛选条件下暂无逾期订单" />}
    </div>
  );

  const renderBadDebtTable = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">订单 / 客户</th>
            <th className="px-4 py-3 text-right">坏账金额</th>
            <th className="px-4 py-3">状态</th>
            <th className="px-4 py-3">原因</th>
            <th className="px-4 py-3">关键时间</th>
            <th className="px-4 py-3 print:hidden">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {badDebtItems.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900">{item.order_number}</div>
                <div className="text-xs text-gray-500">{item.company_name || '未命名客户'} · {item.contact_phone || '—'}</div>
                <div className="text-xs text-gray-400">余额 {formatAmount(item.balance_due)} TJS</div>
              </td>
              <td className="px-4 py-3 text-right font-semibold text-red-700">{formatAmount(item.amount)}</td>
              <td className="px-4 py-3">{badge(BAD_DEBT_STATUS_MAP, item.status)}</td>
              <td className="max-w-md px-4 py-3 text-xs text-gray-600">
                <div className="line-clamp-3 whitespace-pre-wrap">{item.reason}</div>
                {item.rejected_reason && <div className="mt-1 text-red-600">驳回：{item.rejected_reason}</div>}
              </td>
              <td className="px-4 py-3 text-xs text-gray-600">
                <div>申请 {formatDate(item.requested_at)}</div>
                <div>批准 {formatDate(item.approved_at)}</div>
                <div>核销 {formatDate(item.written_off_at)}</div>
              </td>
              <td className="px-4 py-3 print:hidden">
                <div className="flex flex-col gap-2">
                  {item.status === 'pending' && (
                    <>
                      <button onClick={() => setReviewRecord({ record: item, action: 'approve' })} className="rounded border px-3 py-1 text-xs text-blue-700 hover:bg-blue-50">通过</button>
                      <button onClick={() => setReviewRecord({ record: item, action: 'reject' })} className="rounded border px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">驳回</button>
                    </>
                  )}
                  {item.status === 'approved' && <button onClick={() => setReviewRecord({ record: item, action: 'writeoff' })} className="rounded border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50">核销</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {badDebtItems.length === 0 && <EmptyState text="当前筛选条件下暂无坏账记录" />}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold text-gray-900">B2B 授信风控中心</h1>
        <p className="mt-1 text-sm text-gray-600">管理批发商授信额度、账期、逾期催收与坏账审批核销，并提供审计化导出。</p>
      </div>

      <SummaryCards summary={summary} />

      <div className="rounded-xl border bg-white p-1 print:hidden">
        <div className="flex flex-wrap gap-1">
          <button onClick={() => { setActiveTab('credit'); setPage(0); }} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === 'credit' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>授信总览</button>
          <button onClick={() => { setActiveTab('overdue'); setPage(0); }} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === 'overdue' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>逾期催收</button>
          <button onClick={() => { setActiveTab('badDebt'); setPage(0); }} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === 'badDebt' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>坏账核销</button>
        </div>
      </div>

      {renderFilters()}

      <div className="relative rounded-xl border bg-white shadow-sm">
        <LoadingOverlay show={loading} />
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              {activeTab === 'credit' ? '授信客户列表' : activeTab === 'overdue' ? '逾期订单列表' : '坏账记录列表'}
            </h2>
            <div className="text-sm text-gray-500">共 {total} 条，当前显示 {currentRows.length} 条</div>
          </div>
        </div>
        {activeTab === 'credit' && renderCreditTable()}
        {activeTab === 'overdue' && renderOverdueTable()}
        {activeTab === 'badDebt' && renderBadDebtTable()}
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm print:hidden">
          <div className="text-gray-500">第 {page + 1} / {totalPages} 页</div>
          <div className="flex gap-2">
            <button disabled={page <= 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded border px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50">上一页</button>
            <button disabled={page + 1 >= totalPages || loading} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50">下一页</button>
          </div>
        </div>
      </div>

      {editingCredit && <CreditEditModal item={editingCredit} onClose={() => setEditingCredit(null)} onSubmit={handleUpdateCredit} submitting={submitting} />}
      {collectionOrder && <CollectionModal order={collectionOrder} onClose={() => setCollectionOrder(null)} onSubmit={handleAddCollection} submitting={submitting} />}
      {badDebtOrder && <BadDebtRequestModal order={badDebtOrder} onClose={() => setBadDebtOrder(null)} onSubmit={handleRequestBadDebt} submitting={submitting} />}
      {reviewRecord && <BadDebtReviewModal record={reviewRecord.record} action={reviewRecord.action} onClose={() => setReviewRecord(null)} onSubmit={handleReviewBadDebt} submitting={submitting} />}
    </div>
  );
}
