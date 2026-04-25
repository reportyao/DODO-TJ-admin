import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Package, RefreshCw, AlertCircle, CheckCircle2, Clock, XCircle,
  ChevronDown, ChevronUp, Loader2, RotateCcw, Ban, Eye, ArrowLeft,
  Upload, Plus, Trash2, X, ImageIcon, FolderUp
} from 'lucide-react';
import { useSupabase } from '@/contexts/SupabaseContext';
import { adminQuery, adminUpdate, adminInsert } from '@/lib/adminApi';
import { uploadImage } from '@/lib/uploadImage';
import toast from 'react-hot-toast';

// ============================================================
// 类型定义
// ============================================================
interface BatchTask {
  id: string;
  admin_id: string | null;
  batch_name: string;
  total_items: number;
  processed_items: number;
  success_items: number;
  error_items: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  default_category_id: string | null;
  default_price: number | null;
  default_stock: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface BatchItem {
  id: string;
  batch_id: string;
  image_urls: string[];
  category_id: string | null;
  product_name: string | null;
  price: number | null;
  stock: number | null;
  specs: string | null;
  status: string;
  inventory_product_id: string | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface I18nText {
  zh?: string;
  ru?: string;
  tg?: string;
}

interface Category {
  id: string;
  code: string;
  name_i18n: I18nText;
}

// 新建任务中的商品组
interface ProductGroup {
  id: string; // 前端临时ID
  name: string;
  files: File[];
  previews: string[];
  uploading: boolean;
  uploadedUrls: string[];
  uploadError: string | null;
}

// ============================================================
// 状态配置
// ============================================================
const TASK_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: '等待中', color: 'bg-gray-100 text-gray-700', icon: <Clock className="w-3.5 h-3.5" /> },
  processing: { label: '处理中', color: 'bg-blue-100 text-blue-700', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  failed: { label: '全部失败', color: 'bg-red-100 text-red-700', icon: <XCircle className="w-3.5 h-3.5" /> },
  cancelled: { label: '已取消', color: 'bg-yellow-100 text-yellow-700', icon: <Ban className="w-3.5 h-3.5" /> },
};

const ITEM_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  queued: { label: '排队中', color: 'bg-gray-100 text-gray-700' },
  processing: { label: '处理中', color: 'bg-blue-100 text-blue-700' },
  ai_analyzing: { label: 'AI分析中', color: 'bg-purple-100 text-purple-700' },
  ai_generating: { label: 'AI生成中', color: 'bg-indigo-100 text-indigo-700' },
  saving: { label: '入库中', color: 'bg-cyan-100 text-cyan-700' },
  success: { label: '成功', color: 'bg-green-100 text-green-700' },
  error: { label: '失败', color: 'bg-red-100 text-red-700' },
  skipped: { label: '已跳过', color: 'bg-yellow-100 text-yellow-700' },
};

// ============================================================
// 辅助函数
// ============================================================
function formatTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(startStr: string | null, endStr: string | null): string {
  if (!startStr || !endStr) return '-';
  const ms = new Date(endStr).getTime() - new Date(startStr).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ============================================================
// 进度条组件
// ============================================================
function ProgressBar({ task }: { task: BatchTask }) {
  const total = task.total_items || 1;
  const successPct = (task.success_items / total) * 100;
  const errorPct = (task.error_items / total) * 100;
  const pendingPct = 100 - successPct - errorPct;

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{task.processed_items}/{task.total_items} 已处理</span>
        <span>{successPct.toFixed(0)}% 成功</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden flex">
        {successPct > 0 && <div className="bg-green-500 h-full transition-all" style={{ width: `${successPct}%` }} />}
        {errorPct > 0 && <div className="bg-red-400 h-full transition-all" style={{ width: `${errorPct}%` }} />}
        {pendingPct > 0 && task.status === 'processing' && (
          <div className="bg-blue-300 h-full transition-all animate-pulse" style={{ width: `${pendingPct}%` }} />
        )}
      </div>
      <div className="flex gap-3 mt-1 text-xs text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> 成功 {task.success_items}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> 失败 {task.error_items}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> 待处理 {task.total_items - task.processed_items}</span>
      </div>
    </div>
  );
}

// ============================================================
// 状态徽章
// ============================================================
function StatusBadge({ status, config }: { status: string; config: Record<string, { label: string; color: string; icon?: React.ReactNode }> }) {
  const cfg = config[status] || { label: status, color: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ============================================================
// 统计卡片
// ============================================================
function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const bgMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    orange: 'bg-orange-50 border-orange-200',
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${bgMap[color] || 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <div className="text-xs text-gray-500">{label}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 新建批量上架表单
// ============================================================
function CreateBatchForm({
  supabase,
  categories,
  onCreated,
  onCancel,
}: {
  supabase: any;
  categories: Category[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [batchName, setBatchName] = useState(`批量上架_${new Date().toISOString().slice(0, 10)}`);
  const [defaultPrice, setDefaultPrice] = useState(39.9);
  const [defaultStock, setDefaultStock] = useState(100);
  const [categoryId, setCategoryId] = useState('');
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, currentName: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // 添加单个图片（每张图片 = 一个商品）
  const handleAddFiles = (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArr.length === 0) {
      toast.error('请选择图片文件');
      return;
    }

    // 检查是否有webkitRelativePath（文件夹上传）
    const hasSubfolders = fileArr.some(f => (f as any).webkitRelativePath && (f as any).webkitRelativePath.includes('/'));
    
    if (hasSubfolders) {
      // 文件夹模式：按子文件夹分组
      const folderMap = new Map<string, File[]>();
      for (const file of fileArr) {
        const relPath = (file as any).webkitRelativePath || file.name;
        const parts = relPath.split('/');
        // parts[0] = 根文件夹名, parts[1] = 子文件夹名或文件名
        let groupName: string;
        if (parts.length >= 3) {
          // 有子文件夹: root/subfolder/file.jpg
          groupName = parts[1];
        } else {
          // 直接在根目录: root/file.jpg
          groupName = file.name.replace(/\.[^.]+$/, '');
        }
        if (!folderMap.has(groupName)) folderMap.set(groupName, []);
        folderMap.get(groupName)!.push(file);
      }
      
      const newGroups: ProductGroup[] = [];
      folderMap.forEach((files, name) => {
        newGroups.push({
          id: generateId(),
          name,
          files,
          previews: files.map(f => URL.createObjectURL(f)),
          uploading: false,
          uploadedUrls: [],
          uploadError: null,
        });
      });
      setGroups(prev => [...prev, ...newGroups]);
      toast.success(`已添加 ${newGroups.length} 个商品（文件夹模式）`);
    } else {
      // 单图模式：每张图片 = 一个商品
      const newGroups: ProductGroup[] = fileArr.map(file => ({
        id: generateId(),
        name: file.name.replace(/\.[^.]+$/, ''),
        files: [file],
        previews: [URL.createObjectURL(file)],
        uploading: false,
        uploadedUrls: [],
        uploadError: null,
      }));
      setGroups(prev => [...prev, ...newGroups]);
      toast.success(`已添加 ${newGroups.length} 个商品`);
    }
  };

  // 为已有商品组追加图片
  const handleAddImagesToGroup = (groupId: string, files: FileList | File[]) => {
    const fileArr = Array.from(files).filter(f => f.type.startsWith('image/'));
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        files: [...g.files, ...fileArr],
        previews: [...g.previews, ...fileArr.map(f => URL.createObjectURL(f))],
      };
    }));
  };

  // 删除商品组
  const handleRemoveGroup = (groupId: string) => {
    setGroups(prev => {
      const group = prev.find(g => g.id === groupId);
      if (group) group.previews.forEach(url => URL.revokeObjectURL(url));
      return prev.filter(g => g.id !== groupId);
    });
  };

  // 删除商品组中的单张图片
  const handleRemoveImage = (groupId: string, imageIndex: number) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      URL.revokeObjectURL(g.previews[imageIndex]);
      return {
        ...g,
        files: g.files.filter((_, i) => i !== imageIndex),
        previews: g.previews.filter((_, i) => i !== imageIndex),
      };
    }).filter(g => g.files.length > 0));
  };

  // 拖拽处理
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) handleAddFiles(files);
  };

  // 提交创建批量任务
  const handleSubmit = async () => {
    if (groups.length === 0) {
      toast.error('请至少添加一个商品图片');
      return;
    }
    if (!batchName.trim()) {
      toast.error('请输入批次名称');
      return;
    }

    setSubmitting(true);
    const totalImages = groups.reduce((sum, g) => sum + g.files.length, 0);
    setUploadProgress({ current: 0, total: totalImages, currentName: '' });

    try {
      // Step 1: 创建批次任务
      toast.loading('正在创建批次任务...', { id: 'batch-create' });
      const batchResult = await adminInsert(supabase, 'batch_upload_tasks', {
        batch_name: batchName.trim(),
        total_items: groups.length,
        status: 'pending',
        default_category_id: categoryId || null,
        default_price: defaultPrice,
        default_stock: defaultStock,
      });
      
      // 从返回结果中提取batch ID
      let batchId: string;
      if (Array.isArray(batchResult) && batchResult.length > 0) {
        batchId = batchResult[0].id;
      } else if (batchResult && typeof batchResult === 'object' && 'id' in batchResult) {
        batchId = (batchResult as any).id;
      } else {
        throw new Error('创建批次失败：无法获取批次ID');
      }

      toast.loading(`批次已创建，正在上传 ${totalImages} 张图片...`, { id: 'batch-create' });

      // Step 2: 逐组上传图片并创建子项
      let uploadedCount = 0;
      let successGroups = 0;
      let failedGroups = 0;

      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];
        setUploadProgress({ current: uploadedCount, total: totalImages, currentName: group.name });
        
        try {
          // 上传该组的所有图片
          const imageUrls: string[] = [];
          for (const file of group.files) {
            const url = await uploadImage(file, 'inventory-products', 'batch-upload', 'image/jpeg');
            imageUrls.push(url);
            uploadedCount++;
            setUploadProgress({ current: uploadedCount, total: totalImages, currentName: group.name });
          }

          // 创建子项
          await adminInsert(supabase, 'batch_upload_items', {
            batch_id: batchId,
            image_urls: imageUrls,
            category_id: categoryId || null,
            product_name: group.name,
            price: defaultPrice,
            stock: defaultStock,
            status: 'queued',
          });

          successGroups++;
        } catch (err: any) {
          console.error(`商品 "${group.name}" 上传失败:`, err);
          failedGroups++;
          // 继续处理其他商品
        }
      }

      // 清理预览URL
      groups.forEach(g => g.previews.forEach(url => URL.revokeObjectURL(url)));

      if (successGroups > 0) {
        toast.success(`批量上架任务已创建！成功 ${successGroups} 个商品${failedGroups > 0 ? `，失败 ${failedGroups} 个` : ''}`, { id: 'batch-create' });
        onCreated();
      } else {
        toast.error('所有商品上传均失败，请检查网络后重试', { id: 'batch-create' });
      }
    } catch (err: any) {
      console.error('创建批量任务失败:', err);
      toast.error('创建失败: ' + (err.message || '未知错误'), { id: 'batch-create' });
    } finally {
      setSubmitting(false);
      setUploadProgress({ current: 0, total: 0, currentName: '' });
    }
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-blue-600" />
          新建批量上架任务
        </h2>

        {/* 基本参数 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">批次名称 *</label>
            <input
              type="text"
              value={batchName}
              onChange={e => setBatchName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="例如：2026春季新品"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">默认价格 (TJS)</label>
            <input
              type="number"
              value={defaultPrice}
              onChange={e => setDefaultPrice(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              min="0"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">默认库存</label>
            <input
              type="number"
              value={defaultStock}
              onChange={e => setDefaultStock(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">商品分类</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">AI自动识别</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name_i18n?.zh || cat.code}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 图片上传区域 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              商品图片 * <span className="text-gray-400 font-normal">（每张图片 = 一个商品，或上传文件夹按子目录分组）</span>
            </label>
            <span className="text-sm text-gray-500">
              已添加 {groups.length} 个商品，共 {groups.reduce((s, g) => s + g.files.length, 0)} 张图片
            </span>
          </div>

          {/* 拖拽上传区 */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <FolderUp className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-600 mb-2">
              拖拽图片到此处，或点击选择文件
            </p>
            <p className="text-xs text-gray-400 mb-4">
              支持 JPG、PNG、WebP、GIF 格式
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1.5"
              >
                <ImageIcon className="w-4 h-4" />
                选择图片
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 flex items-center gap-1.5"
              >
                <FolderUp className="w-4 h-4" />
                选择文件夹
              </button>
            </div>
          </div>

          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) handleAddFiles(e.target.files); e.target.value = ''; }}
          />
          <input
            ref={folderInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            {...{ webkitdirectory: '', directory: '' } as any}
            onChange={e => { if (e.target.files) handleAddFiles(e.target.files); e.target.value = ''; }}
          />
        </div>

        {/* 商品列表预览 */}
        {groups.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">商品列表预览</h3>
              <button
                onClick={() => {
                  groups.forEach(g => g.previews.forEach(url => URL.revokeObjectURL(url)));
                  setGroups([]);
                }}
                className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> 清空全部
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 max-h-[500px] overflow-y-auto p-1">
              {groups.map(group => (
                <div key={group.id} className="relative bg-white rounded-lg border shadow-sm overflow-hidden group/card">
                  {/* 主图 */}
                  <div className="aspect-square bg-gray-100 relative">
                    <img
                      src={group.previews[0]}
                      alt={group.name}
                      className="w-full h-full object-cover"
                    />
                    {group.files.length > 1 && (
                      <span className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                        {group.files.length} 张
                      </span>
                    )}
                    {/* 删除按钮 */}
                    <button
                      onClick={() => handleRemoveGroup(group.id)}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* 商品名 */}
                  <div className="p-2">
                    <p className="text-xs text-gray-700 truncate" title={group.name}>{group.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 上传进度 */}
        {submitting && uploadProgress.total > 0 && (
          <div className="mb-6 bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span className="text-sm text-blue-700 font-medium">
                正在上传图片... {uploadProgress.current}/{uploadProgress.total}
              </span>
            </div>
            <div className="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
            {uploadProgress.currentName && (
              <p className="text-xs text-blue-500 mt-1">当前: {uploadProgress.currentName}</p>
            )}
          </div>
        )}

        {/* 提交按钮 */}
        <div className="flex items-center justify-between pt-4 border-t">
          <p className="text-xs text-gray-400">
            提交后，AI处理器将自动识别商品信息并入库。处理进度可在列表中查看。
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || groups.length === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  上传中...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  提交批量上架 ({groups.length} 个商品)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 批次详情面板
// ============================================================
function BatchDetailPanel({
  task,
  items,
  loading,
  onRetryItem,
  onRetryAll,
  onBack,
}: {
  task: BatchTask;
  items: BatchItem[];
  loading: boolean;
  onRetryItem: (itemId: string) => void;
  onRetryAll: () => void;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<string>('all');
  const filteredItems = filter === 'all'
    ? items
    : filter === 'ai_analyzing'
      ? items.filter(i => ['ai_analyzing', 'ai_generating', 'saving', 'processing'].includes(i.status))
      : items.filter(i => i.status === filter);
  const errorCount = items.filter(i => i.status === 'error').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
        {errorCount > 0 && (
          <button
            onClick={onRetryAll}
            className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600"
          >
            <RotateCcw className="w-3.5 h-3.5" /> 重试全部失败 ({errorCount})
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-lg">{task.batch_name || '未命名批次'}</h3>
            <p className="text-xs text-gray-400 mt-0.5">ID: {task.id.slice(0, 8)}... | 创建: {formatTime(task.created_at)}</p>
          </div>
          <StatusBadge status={task.status} config={TASK_STATUS_CONFIG} />
        </div>
        <ProgressBar task={task} />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {[
          { key: 'all', label: `全部 (${items.length})` },
          { key: 'success', label: `成功 (${items.filter(i => i.status === 'success').length})` },
          { key: 'error', label: `失败 (${errorCount})` },
          { key: 'queued', label: `排队 (${items.filter(i => i.status === 'queued').length})` },
          { key: 'ai_analyzing', label: `分析中 (${items.filter(i => ['ai_analyzing', 'ai_generating', 'saving', 'processing'].includes(i.status)).length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span className="ml-2 text-gray-500">加载中...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无数据</div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map(item => (
            <ItemCard key={item.id} item={item} onRetry={onRetryItem} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 子项卡片
// ============================================================
function ItemCard({ item, onRetry }: { item: BatchItem; onRetry: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const statusCfg = ITEM_STATUS_CONFIG[item.status] || { label: item.status, color: 'bg-gray-100 text-gray-600' };
  const firstImage = item.image_urls?.[0];

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
          {firstImage ? (
            <img src={firstImage} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300"><Package className="w-5 h-5" /></div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{item.product_name || '(待识别)'}</span>
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {item.image_urls?.length || 0} 张图 | 重试 {item.retry_count}/{item.max_retries} | 耗时 {formatDuration(item.processing_started_at, item.processing_completed_at)}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {item.status === 'error' && (
            <button
              onClick={(e) => { e.stopPropagation(); onRetry(item.id); }}
              className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-500"
              title="重试"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {item.inventory_product_id && (
            <a
              href={`/admin/inventory-products?highlight=${item.inventory_product_id}`}
              className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500"
              title="查看商品"
            >
              <Eye className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-3 py-2 bg-gray-50 text-xs space-y-1.5">
          <div className="flex gap-4">
            <span className="text-gray-400">ID:</span>
            <span className="font-mono text-gray-600">{item.id}</span>
          </div>
          {item.error_message && (
            <div className="flex gap-4">
              <span className="text-gray-400 flex-shrink-0">错误:</span>
              <span className="text-red-600 break-all">{item.error_message}</span>
            </div>
          )}
          {item.image_urls && item.image_urls.length > 0 && (
            <div>
              <span className="text-gray-400">图片:</span>
              <div className="flex gap-1 mt-1 flex-wrap">
                {item.image_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`img-${i}`} className="w-16 h-16 rounded object-cover border hover:border-blue-400" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </a>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-4">
            <span className="text-gray-400">价格:</span>
            <span>{item.price ?? '-'}</span>
            <span className="text-gray-400 ml-2">库存:</span>
            <span>{item.stock ?? '-'}</span>
            <span className="text-gray-400 ml-2">规格:</span>
            <span>{item.specs || '-'}</span>
          </div>
          <div className="flex gap-4">
            <span className="text-gray-400">开始:</span>
            <span>{formatTime(item.processing_started_at)}</span>
            <span className="text-gray-400 ml-2">完成:</span>
            <span>{formatTime(item.processing_completed_at)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 主页面组件
// ============================================================
export default function BatchUploadPage() {
  const { supabase } = useSupabase();
  const [tasks, setTasks] = useState<BatchTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<BatchTask | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  // 加载分类列表
  const loadCategories = useCallback(async () => {
    try {
      const data = await adminQuery<Category>(supabase, 'homepage_categories', {
        select: 'id, code, name_i18n',
        filters: [{ col: 'is_active', op: 'eq', val: true }],
        orderBy: 'sort_order',
        orderAsc: true,
      });
      setCategories(data || []);
    } catch (err) {
      console.error('加载分类失败:', err);
    }
  }, [supabase]);

  // 加载批次列表
  const loadTasks = useCallback(async () => {
    try {
      const data = await adminQuery<BatchTask>(supabase, 'batch_upload_tasks', {
        select: '*',
        orderBy: 'created_at',
        orderAsc: false,
        limit: 50,
      });
      setTasks(data || []);
    } catch (err: any) {
      console.error('加载批次列表失败:', err);
      toast.error('加载批次列表失败: ' + (err.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // 加载子项
  const loadItems = useCallback(async (batchId: string) => {
    setItemsLoading(true);
    try {
      const data = await adminQuery<BatchItem>(supabase, 'batch_upload_items', {
        select: '*',
        filters: [{ col: 'batch_id', op: 'eq', val: batchId }],
        orderBy: 'created_at',
        orderAsc: true,
        limit: 500,
      });
      setItems(data || []);
    } catch (err: any) {
      console.error('加载子项失败:', err);
      toast.error('加载子项失败');
    } finally {
      setItemsLoading(false);
    }
  }, [supabase]);

  // 加载健康状态
  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch('/batch-api/health');
      if (res.ok) {
        setHealthStatus(await res.json());
      } else {
        setHealthStatus(null);
      }
    } catch {
      setHealthStatus(null);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadTasks();
    loadHealth();
    loadCategories();
  }, [loadTasks, loadHealth, loadCategories]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh || showCreateForm) return;
    const interval = setInterval(() => {
      loadTasks();
      loadHealth();
      if (selectedTask) loadItems(selectedTask.id);
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, showCreateForm, selectedTask, loadTasks, loadItems, loadHealth]);

  // 选择批次
  const handleSelectTask = (task: BatchTask) => {
    setSelectedTask(task);
    loadItems(task.id);
  };

  // 重试单个子项
  const handleRetryItem = async (itemId: string) => {
    try {
      await adminUpdate(supabase, 'batch_upload_items', {
        status: 'queued',
        error_message: null,
        retry_count: 0,
        next_retry_at: null,
        processing_started_at: null,
        processing_completed_at: null,
      }, [{ col: 'id', op: 'eq', val: itemId }]);
      toast.success('已重新加入队列');
      if (selectedTask) loadItems(selectedTask.id);
    } catch (err: any) {
      toast.error('重试失败: ' + err.message);
    }
  };

  // 重试所有失败项
  const handleRetryAll = async () => {
    if (!selectedTask) return;
    const errorItems = items.filter(i => i.status === 'error');
    if (errorItems.length === 0) {
      toast('没有需要重试的失败任务');
      return;
    }
    try {
      let successCount = 0;
      for (const item of errorItems) {
        try {
          await adminUpdate(supabase, 'batch_upload_items', {
            status: 'queued',
            error_message: null,
            retry_count: 0,
            next_retry_at: null,
            processing_started_at: null,
            processing_completed_at: null,
          }, [{ col: 'id', op: 'eq', val: item.id }]);
          successCount++;
        } catch (e) {
          console.warn(`重试 ${item.id} 失败:`, e);
        }
      }
      await adminUpdate(supabase, 'batch_upload_tasks', {
        status: 'processing',
      }, [{ col: 'id', op: 'eq', val: selectedTask.id }]);
      toast.success(`已将 ${successCount} 个失败任务重新加入队列`);
      loadItems(selectedTask.id);
      loadTasks();
    } catch (err: any) {
      toast.error('批量重试失败: ' + err.message);
    }
  };

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="max-w-6xl mx-auto">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Upload className="w-6 h-6 text-blue-600" />
            批量商品上架
          </h1>
          <p className="text-sm text-gray-500 mt-1">上传商品图片，AI自动识别并批量入库</p>
        </div>
        <div className="flex items-center gap-3">
          {/* 处理器状态 */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
            healthStatus?.status === 'running' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${healthStatus?.status === 'running' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            处理器 {healthStatus?.status === 'running' ? '运行中' : '离线'}
          </div>
          {!showCreateForm && !selectedTask && (
            <>
              {/* 自动刷新 */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  autoRefresh ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} style={autoRefresh ? { animationDuration: '3s' } : {}} />
                {autoRefresh ? '自动刷新' : '已暂停'}
              </button>
              {/* 新建按钮 */}
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                新建批量上架
              </button>
            </>
          )}
        </div>
      </div>

      {/* 主内容区 */}
      {showCreateForm ? (
        <CreateBatchForm
          supabase={supabase}
          categories={categories}
          onCreated={() => {
            setShowCreateForm(false);
            loadTasks();
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      ) : selectedTask ? (
        <BatchDetailPanel
          task={selectedTask}
          items={items}
          loading={itemsLoading}
          onRetryItem={handleRetryItem}
          onRetryAll={handleRetryAll}
          onBack={() => { setSelectedTask(null); loadTasks(); }}
        />
      ) : (
        <>
          {/* 统计卡片 */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={<Package className="w-5 h-5 text-blue-500" />}
              label="总批次"
              value={tasks.length}
              color="blue"
            />
            <StatCard
              icon={<Loader2 className="w-5 h-5 text-orange-500" />}
              label="处理中"
              value={tasks.filter(t => t.status === 'processing').length}
              color="orange"
            />
            <StatCard
              icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
              label="已完成"
              value={tasks.filter(t => t.status === 'completed').length}
              color="green"
            />
            <StatCard
              icon={<AlertCircle className="w-5 h-5 text-red-500" />}
              label="有失败"
              value={tasks.filter(t => t.error_items > 0).length}
              color="red"
            />
          </div>

          {/* 批次列表 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-500">加载中...</span>
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border">
              <FolderUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">还没有批量上架任务</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                创建第一个批量上架任务
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map(task => {
                const statusCfg = TASK_STATUS_CONFIG[task.status] || { label: task.status, color: 'bg-gray-100 text-gray-600' };
                return (
                  <div
                    key={task.id}
                    onClick={() => handleSelectTask(task)}
                    className="bg-white rounded-xl border shadow-sm p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-base">{task.batch_name || '未命名批次'}</h3>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={task.status} config={TASK_STATUS_CONFIG} />
                        <span className="text-xs text-gray-400">{formatTime(task.created_at)}</span>
                      </div>
                    </div>
                    <ProgressBar task={task} />
                    <div className="flex gap-4 mt-2 text-xs text-gray-400">
                      {task.default_price && <span>默认价格: {task.default_price}</span>}
                      {task.default_stock && <span>默认库存: {task.default_stock}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
