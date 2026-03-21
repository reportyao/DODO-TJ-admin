import React, { useState, useEffect } from 'react';
import { useSupabase } from '@/contexts/SupabaseContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MultiLanguageInput } from '@/components/MultiLanguageInput';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, Power, PowerOff } from 'lucide-react';

interface PaymentConfig {
  id: string;
  config_key: string;
  config_type: string;
  config_data: any;
  name_i18n: any;
  description_i18n: any;
  is_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const initialFormData = {
  config_key: '',
  config_type: 'DEPOSIT',
  method: 'BANK_TRANSFER',
  account_number: '',
  account_name: '',
  bank_name: '',
  phone_number: '',
  qr_code_urls: [] as string[],
  instructions: { zh: '', ru: '', tg: '' } as any,
  require_payer_name: false,
  require_payer_account: false,
  require_payer_phone: false,
  min_amount: 10,
  max_amount: 10000,
  processing_time: '10-30分钟',
  name_i18n: { zh: '', ru: '', tg: '' } as any,
  description_i18n: { zh: '', ru: '', tg: '' } as any,
  is_enabled: true,
  sort_order: 0,
};

export const PaymentConfigPage: React.FC = () => {
  const { supabase } = useSupabase();
  const [configs, setConfigs] = useState<PaymentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<PaymentConfig | null>(null);
  const [formData, setFormData] = useState(initialFormData);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_config')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) {throw error;}
      setConfigs(data || []);
    } catch (error: any) {
      toast.error(`加载配置失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleOpenModal = (config: PaymentConfig | null = null) => {
    if (config) {
      setEditingConfig(config);
      const configData = config.config_data || {};
      setFormData({
        config_key: config.config_key,
        config_type: config.config_type as any,
        method: configData.method || 'BANK_TRANSFER',
        account_number: configData.account_number || '',
        account_name: configData.account_name || '',
        bank_name: configData.bank_name || '',
        phone_number: configData.phone_number || '',
        qr_code_urls: configData.qr_code_url ? [configData.qr_code_url] : [],
        require_payer_name: config.require_payer_name || false,
        require_payer_account: config.require_payer_account || false,
        require_payer_phone: config.require_payer_phone || false,
        instructions: configData.instructions || { zh: '', ru: '', tg: '' },
        min_amount: configData.min_amount || 10,
        max_amount: configData.max_amount || 10000,
        processing_time: configData.processing_time || '10-30分钟',
        name_i18n: config.name_i18n || { zh: '', ru: '', tg: '' },
        description_i18n: config.description_i18n || { zh: '', ru: '', tg: '' },
        is_enabled: config.is_enabled,
        sort_order: config.sort_order,
      });
    } else {
      setEditingConfig(null);
      setFormData(initialFormData);
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 必填字段验证
    if (!formData.config_key.trim()) {
      toast.error('配置 Key 不能为空');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(formData.config_key.trim())) {
      toast.error('配置 Key 只能包含字母、数字、下划线和短横线');
      return;
    }
    if (!formData.name_i18n.zh.trim()) {
      toast.error('请填写中文名称');
      return;
    }
    if (formData.min_amount <= 0) {
      toast.error('最小金额必须大于 0');
      return;
    }
    if (formData.max_amount <= formData.min_amount) {
      toast.error('最大金额必须大于最小金额');
      return;
    }
    // 新建时检查 config_key 唯一性
    if (!editingConfig) {
      const { data: existing } = await supabase
        .from('payment_config')
        .select('id')
        .eq('config_key', formData.config_key.trim())
        .maybeSingle();
      if (existing) {
        toast.error(`配置 Key "${formData.config_key}" 已存在，请使用不同的 Key`);
        return;
      }
    }

    try {
      // 构建config_data
      const configData = {
        method: formData.method,
        enabled: formData.is_enabled,
        account_number: formData.account_number,
        account_name: formData.account_name,
        bank_name: formData.bank_name,
        phone_number: formData.phone_number,
        qr_code_url: formData.qr_code_urls[0] || '',
        require_payer_name: formData.require_payer_name,
        require_payer_account: formData.require_payer_account,
        require_payer_phone: formData.require_payer_phone,
        instructions: formData.instructions,
        min_amount: formData.min_amount,
        max_amount: formData.max_amount,
        processing_time: formData.processing_time,
      };

      const payload = {
        provider: formData.name_i18n.zh || formData.config_key,
        config_key: formData.config_key,
        config_type: formData.config_type,
        config_data: configData,
        config: configData, // 兼容旧字段
        name: formData.name_i18n.zh || formData.config_key,
        type: formData.method || 'BANK_TRANSFER',
        name_i18n: formData.name_i18n,
        description_i18n: formData.description_i18n,
        is_enabled: formData.is_enabled,
        is_active: formData.is_enabled,
        sort_order: formData.sort_order,
        require_payer_name: formData.require_payer_name,
        require_payer_account: formData.require_payer_account,
        require_payer_phone: formData.require_payer_phone,
        updated_at: new Date().toISOString(),
      };

      if (editingConfig) {
        const { error } = await supabase
          .from('payment_config')
          .update(payload)
          .eq('id', editingConfig.id);

        if (error) {throw error;}
        toast.success('支付配置更新成功');
      } else {
        const { error } = await supabase
          .from('payment_config')
          .insert({
            ...payload,
            created_at: new Date().toISOString(),
          });

        if (error) {throw error;}
        toast.success('支付配置创建成功');
      }

      setShowModal(false);
      fetchConfigs();
    } catch (error: any) {
      toast.error(`操作失败: ${error.message}`);
      console.error('Error saving payment config:', error);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`确定要删除支付方式“${name}”吗？`)) {return;}
    try {
      // 检查是否有待审批的充値记录使用此支付方式
      const config = configs.find(c => c.id === id);
      if (config) {
        const { count } = await supabase
          .from('deposit_requests')
          .select('id', { count: 'exact', head: true })
          .eq('payment_config_key', config.config_key)
          .eq('status', 'pending');
        if ((count || 0) > 0) {
          toast.error(`该支付方式有 ${count} 条待审批的充値申请，请先处理完毕再删除`);
          return;
        }
      }
      const { error } = await supabase
        .from('payment_config')
        .delete()
        .eq('id', id);
      if (error) {throw error;}
      toast.success('支付配置已删除');
      fetchConfigs();
    } catch (error: any) {
      toast.error(`删除失败: ${error.message}`);
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('payment_config')
        .update({ 
          is_enabled: !currentStatus,
          is_active: !currentStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {throw error;}
      toast.success('状态更新成功');
      fetchConfigs();
    } catch (error: any) {
      toast.error(`更新失败: ${error.message}`);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">支付配置管理</h1>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4 mr-2" />
          添加支付方式
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(configs || []).map((config) => (
          <Card key={config.id} className={!config.is_enabled ? 'opacity-60' : ''}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-bold">
                {config.name_i18n?.zh || config.config_key}
              </CardTitle>
              <div className="flex space-x-2">
                <Button variant="ghost" size="icon" onClick={() => toggleActive(config.id, config.is_enabled)}>
                  {config.is_enabled ? <Power className="w-4 h-4 text-green-500" /> : <PowerOff className="w-4 h-4 text-red-500" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleOpenModal(config)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(config.id, config.name_i18n?.zh || config.config_key)}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm space-y-1">
                <p><span className="font-semibold">类型:</span> {config.config_type === 'DEPOSIT' ? '充值' : '提现'}</p>
                <p><span className="font-semibold">方法:</span> {config.config_data?.method}</p>
                <p><span className="font-semibold">限额:</span> {config.config_data?.min_amount} - {config.config_data?.max_amount} TJS</p>
                <p className="line-clamp-2 text-gray-500 mt-2">{config.description_i18n?.zh}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>{editingConfig ? '编辑支付配置' : '添加支付配置'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>配置Key (唯一标识)</Label>
                <Input 
                  value={formData.config_key} 
                  onChange={(e) => setFormData({...formData, config_key: e.target.value})}
                  placeholder="如: alif_bank_deposit"
                  disabled={!!editingConfig}
                />
              </div>
              <div className="space-y-2">
                <Label>配置类型</Label>
                <select 
                  className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.config_type}
                  onChange={(e) => setFormData({...formData, config_type: e.target.value as any})}
                >
                  <option value="DEPOSIT">充值</option>
                  <option value="WITHDRAW">提现</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>显示名称 (多语言)</Label>
              <MultiLanguageInput 
                value={formData.name_i18n}
                onChange={(val) => setFormData({...formData, name_i18n: val})}
              />
            </div>

            <div className="space-y-2">
              <Label>描述信息 (多语言)</Label>
              <MultiLanguageInput 
                value={formData.description_i18n}
                onChange={(val) => setFormData({...formData, description_i18n: val})}
                multiline={true}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>支付方法</Label>
                <Input 
                  value={formData.method} 
                  onChange={(e) => setFormData({...formData, method: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>处理时间</Label>
                <Input 
                  value={formData.processing_time} 
                  onChange={(e) => setFormData({...formData, processing_time: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>最小金额</Label>
                <Input 
                  type="number"
                  value={formData.min_amount} 
                  onChange={(e) => setFormData({...formData, min_amount: Number(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>最大金额</Label>
                <Input 
                  type="number"
                  value={formData.max_amount} 
                  onChange={(e) => setFormData({...formData, max_amount: Number(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>排序权重</Label>
                <Input 
                  type="number"
                  value={formData.sort_order} 
                  onChange={(e) => setFormData({...formData, sort_order: Number(e.target.value)})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>收款账号信息（选填）</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input 
                  placeholder="账号"
                  value={formData.account_number} 
                  onChange={(e) => setFormData({...formData, account_number: e.target.value})}
                />
                <Input 
                  placeholder="户名"
                  value={formData.account_name} 
                  onChange={(e) => setFormData({...formData, account_name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Input 
                  placeholder="银行名称"
                  value={formData.bank_name} 
                  onChange={(e) => setFormData({...formData, bank_name: e.target.value})}
                />
                <Input 
                  placeholder="付款电话号码"
                  value={formData.phone_number} 
                  onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>付款人信息要求</Label>
              <div className="space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.require_payer_name}
                    onChange={(e) => setFormData({...formData, require_payer_name: e.target.checked})}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm">要求填写付款人姓名</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.require_payer_account}
                    onChange={(e) => setFormData({...formData, require_payer_account: e.target.checked})}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm">要求填写付款人账号</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.require_payer_phone}
                    onChange={(e) => setFormData({...formData, require_payer_phone: e.target.checked})}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm">要求填写付款人手机号</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>收款二维码</Label>
              <ImageUpload 
                value={formData.qr_code_urls}
                onChange={(urls) => setFormData({...formData, qr_code_urls: urls})}
                maxImages={1}
              />
            </div>

            <div className="space-y-2">
              <Label>操作说明 (多语言)</Label>
              <MultiLanguageInput 
                value={formData.instructions}
                onChange={(val) => setFormData({...formData, instructions: val})}
                multiline={true}
                rows={5}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" type="button" onClick={() => setShowModal(false)}>取消</Button>
              <Button type="submit">保存配置</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
