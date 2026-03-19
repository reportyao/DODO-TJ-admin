import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Settings, AlertCircle } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import toast from 'react-hot-toast';

interface CommissionSetting {
  id: string;
  level: number;
  rate: number;
  description_i18n: {
    zh: string;
    ru: string;
    tg: string;
  };
  trigger_condition: string;
  min_payout_amount: number;
  is_active: boolean;
}

export default function CommissionConfigPage() {
  const { supabase } = useSupabase();
  const [settings, setSettings] = useState<CommissionSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingLevel, setEditingLevel] = useState<number | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('commission_settings')
        .select('*')
        .order('level', { ascending: true });

      if (error) {throw error;}
      setSettings(data || []);
    } catch (error: any) {
      console.error('加载配置失败:', error);
      toast.error('加载配置失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (setting: CommissionSetting) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('commission_settings')
        .update({
          rate: setting.rate,
          description_i18n: setting.description_i18n,
          trigger_condition: setting.trigger_condition,
          min_payout_amount: setting.min_payout_amount,
          is_active: setting.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', setting.id);

      if (error) {throw error;}

      toast.success('保存成功！');
      setEditingLevel(null);
      await loadSettings();
    } catch (error: any) {
      console.error('保存失败:', error);
      toast.error('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (level: number, field: string, value: any) => {
    setSettings(prev => prev.map(s => {
      if (s.level === level) {
        if (field.includes('.')) {
          const [parent, child] = field.split('.');
          return {
            ...s,
            [parent]: {
              ...(s as any)[parent],
              [child]: value
            }
          };
        }
        return { ...s, [field]: value };
      }
      return s;
    }));
  };

  const getLevelName = (level: number) => {
    const names = ['', '一级', '二级', '三级'];
    return names[level] || level;
  };

  const getTriggerConditionText = (condition: string) => {
    const map: { [key: string]: string } = {
      'first_deposit': '充值',
      'first_purchase': '首次购买',
      'any_purchase': '任意购买'
    };
    return map[condition] || condition;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-7 h-7" />
          返利比例配置
        </h1>
        <p className="text-gray-600 mt-1">配置多层级邀请返利比例和规则</p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-yellow-800">
          <p className="font-medium mb-1">重要提示</p>
          <p>修改返利比例将影响所有新产生的返利计算。已发放的返利不受影响。请谨慎操作。</p>
        </div>
      </div>

      <div className="space-y-6">
        {settings.map((setting) => {
          const isEditing = editingLevel === setting.level;

          return (
            <div key={setting.id} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                    setting.level === 1 ? 'bg-blue-500' :
                    setting.level === 2 ? 'bg-green-500' :
                    'bg-purple-500'
                  }`}>
                    {setting.level}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{getLevelName(setting.level)}邀请返利</h3>
                    <p className="text-sm text-gray-500">Level {setting.level} Referral Commission</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={setting.is_active}
                      onChange={(e) => updateSetting(setting.level, 'is_active', e.target.checked)}
                      disabled={!isEditing}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">启用</span>
                  </label>
                  {isEditing ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(setting)}
                        disabled={saving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        {saving ? '保存中...' : '保存'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingLevel(null);
                          loadSettings();
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingLevel(setting.level)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                      编辑
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 返利比例 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    返利比例 (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={(setting.rate * 100).toFixed(2)}
                    onChange={(e) => updateSetting(setting.level, 'rate', parseFloat(e.target.value) / 100)}
                    disabled={!isEditing}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    当前: {(setting.rate * 100).toFixed(2)}% (被邀请人每消费100元，邀请人获得{(setting.rate * 100).toFixed(2)}元)
                  </p>
                </div>

                {/* 触发条件 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    触发条件
                  </label>
                  <select
                    value={setting.trigger_condition}
                    onChange={(e) => updateSetting(setting.level, 'trigger_condition', e.target.value)}
                    disabled={!isEditing}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  >
                    <option value="any_purchase">任意购买</option>
                    <option value="first_purchase">首次购买</option>
                    <option value="first_deposit">充值</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    当前: {getTriggerConditionText(setting.trigger_condition)}
                  </p>
                </div>

                {/* 最低发放金额 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    最低发放金额 (元)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={setting.min_payout_amount}
                    onChange={(e) => updateSetting(setting.level, 'min_payout_amount', parseFloat(e.target.value))}
                    disabled={!isEditing}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    返利金额低于此值时不发放
                  </p>
                </div>
              </div>

              {/* 多语言描述 */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  多语言描述
                </label>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-600">中文</label>
                    <input
                      type="text"
                      value={setting.description_i18n.zh}
                      onChange={(e) => updateSetting(setting.level, 'description_i18n.zh', e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 text-sm"
                      placeholder="例如: 一级邀请返利10%"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Русский</label>
                    <input
                      type="text"
                      value={setting.description_i18n.ru}
                      onChange={(e) => updateSetting(setting.level, 'description_i18n.ru', e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 text-sm"
                      placeholder="Например: Реферал 1-го уровня 10%"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Тоҷикӣ</label>
                    <input
                      type="text"
                      value={setting.description_i18n.tg}
                      onChange={(e) => updateSetting(setting.level, 'description_i18n.tg', e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 text-sm"
                      placeholder="Масалан: Рефералӣ дараҷаи 1 10%"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
