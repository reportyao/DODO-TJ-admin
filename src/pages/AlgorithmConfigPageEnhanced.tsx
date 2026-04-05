import React, { useState, useEffect } from 'react';
import { Settings, Plus, Edit, Trash2, Check, X, TestTube } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { adminQuery, adminUpdate } from '../lib/adminApi';
import toast from 'react-hot-toast';

interface DrawAlgorithm {
  id: string;
  name: string;
  display_name_i18n: {
    zh: string;
    ru: string;
    tg: string;
  };
  description_i18n: {
    zh: string;
    ru: string;
    tg: string;
  };
  formula_i18n: {
    zh: string;
    ru: string;
    tg: string;
  };
  is_active: boolean;
  is_default: boolean;
  config: any;
}

export default function AlgorithmConfigPageEnhanced() {
  const [algorithms, setAlgorithms] = useState<DrawAlgorithm[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentLang, setCurrentLang] = useState<'zh' | 'ru' | 'tg'>('zh');

  useEffect(() => {
    loadAlgorithms();
  }, []);

  const loadAlgorithms = async () => {
    setLoading(true);
    try {
      const data = await adminQuery<DrawAlgorithm>(supabase, 'draw_algorithms', {
        select: '*',
        orderBy: 'created_at',
        orderAsc: true,
      });
      setAlgorithms(data || []);
    } catch (error: any) {
      console.error('加载算法失败:', error);
      toast.error('加载算法失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (algorithm: DrawAlgorithm) => {
    try {
      // 如果设置为默认，必须先取消其他算法的默认状态（防止多个默认算法并存）
      if (algorithm.is_default) {
        // 取消其他算法的默认状态（通过查询+更新）
        const allAlgos = await adminQuery<DrawAlgorithm>(supabase, 'draw_algorithms', { select: '*' });
        for (const algo of allAlgos) {
          if (algo.id !== algorithm.id && algo.is_default) {
            await adminUpdate(supabase, 'draw_algorithms', 
              { is_default: false, updated_at: new Date().toISOString() },
              [{ col: 'id', op: 'eq', val: algo.id }]
            );
          }
        }
      }

      await adminUpdate(supabase, 'draw_algorithms', {
        display_name_i18n: algorithm.display_name_i18n,
        description_i18n: algorithm.description_i18n,
        formula_i18n: algorithm.formula_i18n,
        is_active: algorithm.is_active,
        is_default: algorithm.is_default,
        config: algorithm.config,
        updated_at: new Date().toISOString()
      }, [{ col: 'id', op: 'eq', val: algorithm.id }]);
      const error = null;

      if (error) {throw error;}

      toast.success('保存成功！');
      setEditingId(null);
      await loadAlgorithms();
    } catch (error: any) {
      console.error('保存失败:', error);
      toast.error('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const updateAlgorithm = (id: string, field: string, value: any) => {
    setAlgorithms(prev => prev.map(a => {
      if (a.id === id) {
        if (field.includes('.')) {
          const [parent, child] = field.split('.');
          return {
            ...a,
            [parent]: {
              ...(a as any)[parent],
              [child]: value
            }
          };
        }
        return { ...a, [field]: value };
      }
      return a;
    }));
  };

  if (loading) {
    return <div className="p-6 text-center">加载中...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-7 h-7" />
          开奖算法配置
        </h1>
        <p className="text-gray-600 mt-1">管理和配置开奖算法</p>
      </div>

      <div className="space-y-6">
        {algorithms.map((algorithm) => {
          const isEditing = editingId === algorithm.id;

          return (
            <div key={algorithm.id} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{algorithm.display_name_i18n.zh}</h3>
                  <p className="text-sm text-gray-500">{algorithm.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={algorithm.is_active}
                      onChange={(e) => updateAlgorithm(algorithm.id, 'is_active', e.target.checked)}
                      disabled={!isEditing}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm">启用</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={algorithm.is_default}
                      onChange={(e) => updateAlgorithm(algorithm.id, 'is_default', e.target.checked)}
                      disabled={!isEditing}
                      className="w-4 h-4 text-green-600 rounded"
                    />
                    <span className="text-sm">默认</span>
                  </label>
                  {isEditing ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(algorithm)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        保存
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          loadAlgorithms();
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingId(algorithm.id)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      编辑
                    </button>
                  )}
                </div>
              </div>

              {/* 语言切换 */}
              <div className="flex gap-2 mb-4 border-b border-gray-200">
                {(['zh', 'ru', 'tg'] as const).map(lang => (
                  <button
                    key={lang}
                    onClick={() => setCurrentLang(lang)}
                    className={`px-4 py-2 font-medium transition-colors ${
                      currentLang === lang
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {lang === 'zh' ? '中文' : lang === 'ru' ? 'Русский' : 'Тоҷикӣ'}
                  </button>
                ))}
              </div>

              {/* 多语言内容 */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    算法名称
                  </label>
                  <input
                    type="text"
                    value={algorithm.display_name_i18n[currentLang]}
                    onChange={(e) => updateAlgorithm(algorithm.id, `display_name_i18n.${currentLang}`, e.target.value)}
                    disabled={!isEditing}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    算法描述
                  </label>
                  <textarea
                    value={algorithm.description_i18n[currentLang]}
                    onChange={(e) => updateAlgorithm(algorithm.id, `description_i18n.${currentLang}`, e.target.value)}
                    disabled={!isEditing}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    算法公式
                  </label>
                  <textarea
                    value={algorithm.formula_i18n[currentLang]}
                    onChange={(e) => updateAlgorithm(algorithm.id, `formula_i18n.${currentLang}`, e.target.value)}
                    disabled={!isEditing}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 font-mono text-sm"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
