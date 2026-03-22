import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Edit, Check, X } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import toast from 'react-hot-toast';

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

interface I18nField {
  zh: string;
  ru: string;
  tg: string;
}

interface DrawAlgorithm {
  id: string;
  name: string;
  description: string | null;
  algorithm_type: string | null;
  is_active: boolean;
  is_default: boolean;
  display_name_i18n: I18nField | null;
  description_i18n: I18nField | null;
  formula_i18n: I18nField | null;
  config: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

type LangKey = 'zh' | 'ru' | 'tg';

const LANG_LABELS: Record<LangKey, string> = {
  zh: '中文',
  ru: 'Русский',
  tg: 'Тоҷикӣ',
};

// ─── 主组件 ──────────────────────────────────────────────────────────────────

const AlgorithmConfigPage: React.FC = () => {
  const { supabase } = useSupabase();

  const [algorithms, setAlgorithms] = useState<DrawAlgorithm[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  // 编辑时的临时数据（避免直接修改列表影响取消操作）
  const [editingData, setEditingData] = useState<DrawAlgorithm | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentLang, setCurrentLang] = useState<LangKey>('zh');

  // ─── 从数据库加载算法配置 ──────────────────────────────────────────────────

  const loadAlgorithms = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('draw_algorithms')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setAlgorithms(data || []);
    } catch (error: any) {
      console.error('加载算法失败:', error);
      toast.error('加载算法失败: ' + (error?.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadAlgorithms();
  }, [loadAlgorithms]);

  // ─── 开始编辑：深拷贝当前数据到临时状态 ──────────────────────────────────

  const handleStartEdit = (algorithm: DrawAlgorithm) => {
    setEditingId(algorithm.id);
    setEditingData(JSON.parse(JSON.stringify(algorithm)));
  };

  // ─── 取消编辑：丢弃临时数据 ───────────────────────────────────────────────

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingData(null);
  };

  // ─── 更新临时编辑数据（支持嵌套字段如 display_name_i18n.zh） ─────────────

  const updateEditingField = (field: string, value: any) => {
    if (!editingData) return;
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setEditingData({
        ...editingData,
        [parent]: {
          ...(editingData as any)[parent],
          [child]: value,
        },
      });
    } else {
      setEditingData({ ...editingData, [field]: value });
    }
  };

  // ─── 保存算法配置到数据库 ─────────────────────────────────────────────────

  const handleSave = async () => {
    if (!editingData) return;
    setSaving(true);
    try {
      // 如果设置为默认，先取消其他算法的默认状态（防止多个默认算法并存）
      if (editingData.is_default) {
        const { error: clearError } = await supabase
          .from('draw_algorithms')
          .update({ is_default: false, updated_at: new Date().toISOString() })
          .neq('id', editingData.id);
        if (clearError) throw clearError;
      }

      const { error } = await supabase
        .from('draw_algorithms')
        .update({
          display_name_i18n: editingData.display_name_i18n,
          description_i18n: editingData.description_i18n,
          formula_i18n: editingData.formula_i18n,
          is_active: editingData.is_active,
          is_default: editingData.is_default,
          config: editingData.config,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingData.id);

      if (error) throw error;

      toast.success('算法配置保存成功！');
      setEditingId(null);
      setEditingData(null);
      await loadAlgorithms();
    } catch (error: any) {
      console.error('保存失败:', error);
      toast.error('保存失败: ' + (error?.message || '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  // ─── 渲染 ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-7 h-7" />
          开奖算法配置
        </h1>
        <p className="text-gray-600 mt-1">
          管理开奖算法的多语言显示名称、描述和公式。算法逻辑由系统内置，此处仅配置展示内容。
        </p>
      </div>

      {/* 语言切换 */}
      <div className="flex gap-2 mb-6">
        {(Object.keys(LANG_LABELS) as LangKey[]).map(lang => (
          <button
            key={lang}
            onClick={() => setCurrentLang(lang)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              currentLang === lang
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {LANG_LABELS[lang]}
          </button>
        ))}
      </div>

      {/* 无数据提示 */}
      {algorithms.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800 font-medium">暂无算法配置</p>
          <p className="text-yellow-600 text-sm mt-1">
            请在数据库 draw_algorithms 表中添加算法记录
          </p>
        </div>
      )}

      {/* 算法卡片列表 */}
      <div className="space-y-6">
        {algorithms.map(algorithm => {
          const isEditing = editingId === algorithm.id;
          const data = isEditing && editingData ? editingData : algorithm;

          return (
            <div key={algorithm.id} className="bg-white rounded-lg shadow-md p-6">
              {/* 卡片标题栏 */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {algorithm.display_name_i18n?.zh || algorithm.name}
                  </h3>
                  <p className="text-sm text-gray-400 font-mono mt-0.5">{algorithm.name}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2 text-sm"
                      >
                        <Check className="w-4 h-4" />
                        {saving ? '保存中...' : '保存'}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
                      >
                        <X className="w-4 h-4" />
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleStartEdit(algorithm)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
                    >
                      <Edit className="w-4 h-4" />
                      编辑
                    </button>
                  )}
                </div>
              </div>

              {/* 状态开关（编辑模式下可修改） */}
              <div className="flex gap-4 mb-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.is_active}
                    onChange={e => isEditing && updateEditingField('is_active', e.target.checked)}
                    disabled={!isEditing}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">启用此算法</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.is_default}
                    onChange={e => isEditing && updateEditingField('is_default', e.target.checked)}
                    disabled={!isEditing}
                    className="w-4 h-4 text-green-600 rounded"
                  />
                  <span className="text-sm text-gray-700">设为默认算法</span>
                </label>
              </div>

              {/* 状态标签 */}
              <div className="flex gap-2 mb-5">
                {data.is_default && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                    默认算法
                  </span>
                )}
                {data.is_active ? (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                    已启用
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">
                    已禁用
                  </span>
                )}
              </div>

              {/* 多语言内容编辑区 */}
              <div className="space-y-4 border-t pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    显示名称（{LANG_LABELS[currentLang]}）
                  </label>
                  <input
                    type="text"
                    value={data.display_name_i18n?.[currentLang] || ''}
                    onChange={e =>
                      isEditing && updateEditingField(`display_name_i18n.${currentLang}`, e.target.value)
                    }
                    disabled={!isEditing}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
                    placeholder="算法显示名称"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    算法描述（{LANG_LABELS[currentLang]}）
                  </label>
                  <textarea
                    value={data.description_i18n?.[currentLang] || ''}
                    onChange={e =>
                      isEditing && updateEditingField(`description_i18n.${currentLang}`, e.target.value)
                    }
                    disabled={!isEditing}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
                    placeholder="算法描述"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    算法公式（{LANG_LABELS[currentLang]}）
                  </label>
                  <textarea
                    value={data.formula_i18n?.[currentLang] || ''}
                    onChange={e =>
                      isEditing && updateEditingField(`formula_i18n.${currentLang}`, e.target.value)
                    }
                    disabled={!isEditing}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600 font-mono text-sm"
                    placeholder="算法公式"
                  />
                </div>
              </div>

              {/* 最后更新时间 */}
              <p className="text-xs text-gray-400 mt-4">
                最后更新：{new Date(algorithm.updated_at).toLocaleString('zh-CN')}
              </p>
            </div>
          );
        })}
      </div>

      {/* 说明卡片 */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-5">
        <h4 className="font-semibold text-blue-900 mb-2">算法说明</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>启用</strong>：算法可被选择用于开奖</li>
          <li>• <strong>默认</strong>：创建新积分商城时自动选择此算法（同时只能有一个默认算法）</li>
          <li>• <strong>显示名称/描述/公式</strong>：面向用户展示的多语言内容，不影响算法逻辑</li>
          <li>• 算法核心逻辑由系统内置，修改此配置不会改变实际开奖计算方式</li>
        </ul>
      </div>
    </div>
  );
};

export default AlgorithmConfigPage;
