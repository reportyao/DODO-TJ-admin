/**
 * 本地化词库管理页面
 *
 * 管理塔吉克斯坦本地化指导词库（localization_lexicon）。
 * 支持：列表展示、按词库组筛选、创建、编辑、删除、启用/停用。
 *
 * 与 BannerManagementPage 保持一致的 CRUD 模式。
 */
import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Eye, EyeOff, RefreshCw, X, BookOpen } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import { adminQuery, adminInsert, adminUpdate, adminDelete } from '../lib/adminApi';
import toast from 'react-hot-toast';
import type { DbLocalizationLexiconRow, LexiconGroup, I18nText } from '../types/homepage';

// ============================================================
// 词库组配置
// ============================================================
const LEXICON_GROUP_OPTIONS: { value: LexiconGroup; label: string; color: string }[] = [
  { value: 'food', label: '饮食文化', color: 'bg-orange-100 text-orange-700' },
  { value: 'festival', label: '节日习俗', color: 'bg-red-100 text-red-700' },
  { value: 'family', label: '家庭场景', color: 'bg-blue-100 text-blue-700' },
  { value: 'gifting', label: '送礼文化', color: 'bg-pink-100 text-pink-700' },
  { value: 'home_scene', label: '居家场景', color: 'bg-green-100 text-green-700' },
  { value: 'tone', label: '语气语调', color: 'bg-purple-100 text-purple-700' },
  { value: 'taboo', label: '文化禁忌', color: 'bg-gray-100 text-gray-700' },
  { value: 'shopping', label: '购物习惯', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'beauty', label: '美妆护肤', color: 'bg-rose-100 text-rose-700' },
  { value: 'children', label: '儿童玩具', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'tech', label: '数码3C', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'season', label: '季节场景', color: 'bg-teal-100 text-teal-700' },
  { value: 'daily', label: '日常用品', color: 'bg-lime-100 text-lime-700' },
  { value: 'stationery', label: '文具学习', color: 'bg-sky-100 text-sky-700' },
  { value: 'novelty', label: '新奇特', color: 'bg-fuchsia-100 text-fuchsia-700' },
];

const getGroupBadge = (group: LexiconGroup) => {
  const opt = LEXICON_GROUP_OPTIONS.find(o => o.value === group);
  return opt || { label: group, color: 'bg-gray-100 text-gray-700' };
};

// ============================================================
// 表单默认值
// ============================================================
const defaultFormData = {
  lexicon_group: 'food' as LexiconGroup,
  code: '',
  title_zh: '', title_ru: '', title_tg: '',
  content_zh: '', content_ru: '', content_tg: '',
  example_zh: '', example_ru: '', example_tg: '',
  example_good: '',
  example_bad: '',
  local_anchors: '',
  tone_notes: '',
  is_active: true,
  sort_order: 0,
};

export default function LocalizationLexiconPage() {
  const { supabase } = useSupabase();
  const [items, setItems] = useState<DbLocalizationLexiconRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DbLocalizationLexiconRow | null>(null);
  const [formData, setFormData] = useState(defaultFormData);
  const [filterGroup, setFilterGroup] = useState<LexiconGroup | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      // [RLS 修复] 使用 adminQuery
      const data = await adminQuery<DbLocalizationLexiconRow>(supabase, 'localization_lexicon', {
        select: '*',
        orderBy: 'lexicon_group',
        orderAsc: true,
      });
      setItems(data || []);
    } catch (error: any) {
      console.error('Failed to fetch lexicon:', error);
      toast.error('获取词库列表失败');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = filterGroup === 'all'
    ? items
    : items.filter(i => i.lexicon_group === filterGroup);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code.trim()) {
      toast.error('词条编码不能为空');
      return;
    }
    if (!formData.title_zh.trim()) {
      toast.error('中文标题不能为空');
      return;
    }
    if (!formData.content_zh.trim()) {
      toast.error('中文内容不能为空');
      return;
    }

    try {
      const buildI18n = (zh: string, ru: string, tg: string): I18nText => {
        const obj: I18nText = {};
        if (zh.trim()) obj.zh = zh.trim();
        if (ru.trim()) obj.ru = ru.trim();
        if (tg.trim()) obj.tg = tg.trim();
        return obj;
      };

      const buildI18nNullable = (zh: string, ru: string, tg: string): I18nText | null => {
        const obj = buildI18n(zh, ru, tg);
        return Object.keys(obj).length > 0 ? obj : null;
      };

      // 解析 local_anchors（逗号分隔）
      const anchors = formData.local_anchors.trim()
        ? formData.local_anchors.split(',').map(s => s.trim()).filter(Boolean)
        : null;

      const saveData = {
        lexicon_group: formData.lexicon_group,
        code: formData.code.trim(),
        title_i18n: buildI18n(formData.title_zh, formData.title_ru, formData.title_tg),
        content_i18n: buildI18n(formData.content_zh, formData.content_ru, formData.content_tg),
        example_i18n: buildI18nNullable(formData.example_zh, formData.example_ru, formData.example_tg),
        example_good: formData.example_good.trim() || null,
        example_bad: formData.example_bad.trim() || null,
        local_anchors: anchors,
        tone_notes: formData.tone_notes.trim() || null,
        is_active: formData.is_active,
        sort_order: formData.sort_order,
        updated_at: new Date().toISOString(),
      };

      if (editingItem) {
        // [RLS 修复] 使用 adminUpdate
        await adminUpdate(supabase, 'localization_lexicon', saveData, [
          { col: 'id', op: 'eq', val: editingItem.id },
        ]);
        toast.success('词条更新成功');
      } else {
        // [RLS 修复] 使用 adminInsert
        await adminInsert(supabase, 'localization_lexicon', saveData);
        toast.success('词条创建成功');
      }

      setShowModal(false);
      resetForm();
      fetchItems();
    } catch (error: any) {
      console.error('Failed to save lexicon:', error);
      toast.error('保存失败: ' + error.message);
    }
  };

  const handleEdit = (item: DbLocalizationLexiconRow) => {
    setEditingItem(item);
    const title = item.title_i18n || {};
    const content = item.content_i18n || {};
    const example = item.example_i18n || {};
    setFormData({
      lexicon_group: item.lexicon_group,
      code: item.code,
      title_zh: title.zh || '', title_ru: title.ru || '', title_tg: title.tg || '',
      content_zh: content.zh || '', content_ru: content.ru || '', content_tg: content.tg || '',
      example_zh: example.zh || '', example_ru: example.ru || '', example_tg: example.tg || '',
      example_good: item.example_good || '',
      example_bad: item.example_bad || '',
      local_anchors: (item.local_anchors || []).join(', '),
      tone_notes: item.tone_notes || '',
      is_active: item.is_active,
      sort_order: item.sort_order,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个词条吗？')) return;
    try {
      // [RLS 修复] 使用 adminDelete
      await adminDelete(supabase, 'localization_lexicon', [
        { col: 'id', op: 'eq', val: id },
      ]);
      toast.success('词条删除成功');
      fetchItems();
    } catch (error: any) {
      toast.error('删除失败: ' + error.message);
    }
  };

  const toggleActive = async (item: DbLocalizationLexiconRow) => {
    try {
      // [RLS 修复] 使用 adminUpdate
      await adminUpdate(supabase, 'localization_lexicon', { is_active: !item.is_active }, [
        { col: 'id', op: 'eq', val: item.id },
      ]);
      toast.success(item.is_active ? '词条已停用' : '词条已启用');
      fetchItems();
    } catch (error: any) {
      toast.error('状态切换失败');
    }
  };

  const resetForm = () => {
    setFormData({ ...defaultFormData, sort_order: items.length });
    setEditingItem(null);
  };

  // 按组统计
  const groupCounts = LEXICON_GROUP_OPTIONS.map(g => ({
    ...g,
    count: items.filter(i => i.lexicon_group === g.value).length,
  }));

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-orange-500" />
          <h1 className="text-2xl font-bold">本地化词库</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchItems}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200">
            <RefreshCw className="w-4 h-4" /> 刷新
          </button>
          <button onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600">
            <Plus className="w-5 h-5" /> 创建词条
          </button>
        </div>
      </div>

      {/* 词库组筛选 */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => setFilterGroup('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filterGroup === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          全部 ({items.length})
        </button>
        {groupCounts.map(g => (
          <button key={g.value} onClick={() => setFilterGroup(g.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterGroup === g.value ? 'bg-gray-800 text-white' : `${g.color} hover:opacity-80`
            }`}>
            {g.label} ({g.count})
          </button>
        ))}
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-12">加载中...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 text-gray-500">暂无词条</div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map(item => {
            const title = item.title_i18n || {};
            const content = item.content_i18n || {};
            const badge = getGroupBadge(item.lexicon_group);
            const isExpanded = expandedId === item.id;

            return (
              <div key={item.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
                {/* 头部 */}
                <div
                  className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${badge.color}`}>
                    {badge.label}
                  </span>
                  <code className="text-xs bg-gray-100 px-2 py-0.5 rounded flex-shrink-0">{item.code}</code>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800">{title.zh || '-'}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); toggleActive(item); }}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs flex-shrink-0 ${
                      item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                    {item.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {item.is_active ? '启用' : '停用'}
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
                      className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs hover:bg-blue-200">
                      <Edit className="w-3 h-3" /> 编辑
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                      className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-200">
                      <Trash2 className="w-3 h-3" /> 删除
                    </button>
                  </div>
                </div>

                {/* 展开详情 */}
                {isExpanded && (
                  <div className="border-t px-4 py-3 bg-gray-50 space-y-3">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-gray-400 mb-1">🇨🇳 内容</div>
                        <div className="text-sm text-gray-700">{content.zh || '-'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-1">🇷🇺 内容</div>
                        <div className="text-sm text-gray-700">{content.ru || '-'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-1">🇹🇯 内容</div>
                        <div className="text-sm text-gray-700">{content.tg || '-'}</div>
                      </div>
                    </div>
                    {(item.example_good || item.example_bad) && (
                      <div className="grid grid-cols-2 gap-4">
                        {item.example_good && (
                          <div className="bg-green-50 border border-green-200 rounded p-2">
                            <div className="text-xs text-green-600 font-medium mb-1">正确示例</div>
                            <div className="text-sm text-green-800">{item.example_good}</div>
                          </div>
                        )}
                        {item.example_bad && (
                          <div className="bg-red-50 border border-red-200 rounded p-2">
                            <div className="text-xs text-red-600 font-medium mb-1">错误示例</div>
                            <div className="text-sm text-red-800">{item.example_bad}</div>
                          </div>
                        )}
                      </div>
                    )}
                    {item.local_anchors && item.local_anchors.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-400 mb-1">本地锚点</div>
                        <div className="flex flex-wrap gap-1">
                          {item.local_anchors.map((a, i) => (
                            <span key={i} className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">{a}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {item.tone_notes && (
                      <div>
                        <div className="text-xs text-gray-400 mb-1">语气备注</div>
                        <div className="text-sm text-gray-600">{item.tone_notes}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 创建/编辑模态框 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{editingItem ? '编辑词条' : '创建词条'}</h2>
                <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">词库组 *</label>
                    <select value={formData.lexicon_group}
                      onChange={(e) => setFormData({ ...formData, lexicon_group: e.target.value as LexiconGroup })}
                      className="w-full border rounded px-3 py-2">
                      {LEXICON_GROUP_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">编码 *</label>
                    <input type="text" value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="w-full border rounded px-3 py-2" placeholder="如: plov_culture" />
                  </div>
                </div>

                {/* 三语标题 */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">标题（三语）</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇨🇳 中文 *</label>
                      <input type="text" value={formData.title_zh}
                        onChange={(e) => setFormData({ ...formData, title_zh: e.target.value })}
                        className="w-full border rounded px-3 py-2" placeholder="手抓饭文化" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇷🇺 俄语</label>
                      <input type="text" value={formData.title_ru}
                        onChange={(e) => setFormData({ ...formData, title_ru: e.target.value })}
                        className="w-full border rounded px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇹🇯 塔吉克语</label>
                      <input type="text" value={formData.title_tg}
                        onChange={(e) => setFormData({ ...formData, title_tg: e.target.value })}
                        className="w-full border rounded px-3 py-2" />
                    </div>
                  </div>
                </div>

                {/* 三语内容 */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">内容说明（三语）</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇨🇳 中文 *</label>
                      <textarea value={formData.content_zh}
                        onChange={(e) => setFormData({ ...formData, content_zh: e.target.value })}
                        className="w-full border rounded px-3 py-2" rows={3}
                        placeholder="手抓饭（Плов/Ош）是塔吉克斯坦最重要的待客食物..." />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇷🇺 俄语</label>
                      <textarea value={formData.content_ru}
                        onChange={(e) => setFormData({ ...formData, content_ru: e.target.value })}
                        className="w-full border rounded px-3 py-2" rows={3} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">🇹🇯 塔吉克语</label>
                      <textarea value={formData.content_tg}
                        onChange={(e) => setFormData({ ...formData, content_tg: e.target.value })}
                        className="w-full border rounded px-3 py-2" rows={3} />
                    </div>
                  </div>
                </div>

                {/* 示例 */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">用法示例</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-green-600 font-medium mb-1">正确示例</label>
                      <textarea value={formData.example_good}
                        onChange={(e) => setFormData({ ...formData, example_good: e.target.value })}
                        className="w-full border border-green-200 rounded px-3 py-2 bg-green-50" rows={2}
                        placeholder="家里来人了，准备一锅好饭" />
                    </div>
                    <div>
                      <label className="block text-xs text-red-600 font-medium mb-1">错误示例</label>
                      <textarea value={formData.example_bad}
                        onChange={(e) => setFormData({ ...formData, example_bad: e.target.value })}
                        className="w-full border border-red-200 rounded px-3 py-2 bg-red-50" rows={2}
                        placeholder="买个电饭锅随便煮" />
                    </div>
                  </div>
                </div>

                {/* 本地锚点和语气 */}
                <div className="border-t pt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">本地锚点（逗号分隔）</label>
                    <input type="text" value={formData.local_anchors}
                      onChange={(e) => setFormData({ ...formData, local_anchors: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                      placeholder="手抓饭, Плов, Ош, 待客" />
                    <p className="text-xs text-gray-400 mt-1">用于 AI 生成时的文化关键词锚定</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">语气备注</label>
                    <textarea value={formData.tone_notes}
                      onChange={(e) => setFormData({ ...formData, tone_notes: e.target.value })}
                      className="w-full border rounded px-3 py-2" rows={2}
                      placeholder="应使用温暖、尊重的语气，避免过于商业化的表达" />
                  </div>
                </div>

                {/* 排序和状态 */}
                <div className="grid grid-cols-2 gap-4 border-t pt-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">排序</label>
                    <input type="number" value={formData.sort_order}
                      onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                      className="w-full border rounded px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">状态</label>
                    <select value={formData.is_active ? 'active' : 'inactive'}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'active' })}
                      className="w-full border rounded px-3 py-2">
                      <option value="active">启用</option>
                      <option value="inactive">停用</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-4">
                  <button type="button" onClick={() => { setShowModal(false); resetForm(); }}
                    className="px-4 py-2 border rounded hover:bg-gray-50">取消</button>
                  <button type="submit"
                    className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600">
                    {editingItem ? '更新' : '创建'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
