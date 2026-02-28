import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { MultiImageUpload } from '../components/MultiImageUpload';

interface BusinessHours {
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
  sunday?: string;
}

interface PickupPoint {
  id: string;
  name: string;
  name_i18n: { zh: string; ru: string; tg: string };
  address: string;
  address_i18n: { zh: string; ru: string; tg: string };
  latitude: number | null;
  longitude: number | null;
  contact_phone: string | null;
  contact_person: string | null;
  working_hours: BusinessHours | string | null;
  photos: string[];
  status: string;
  is_active?: boolean;
  created_at: string;
}

interface FormData {
  name: string;
  name_i18n: { zh: string; ru: string; tg: string };
  address: string;
  address_i18n: { zh: string; ru: string; tg: string };
  latitude: number | null;
  longitude: number | null;
  contact_phone: string;
  contact_person: string;
  working_hours: BusinessHours;
  photos: string[];
  status: string;
}

const emptyBusinessHours: BusinessHours = {
  monday: '09:00-18:00',
  tuesday: '09:00-18:00',
  wednesday: '09:00-18:00',
  thursday: '09:00-18:00',
  friday: '09:00-18:00',
  saturday: '10:00-16:00',
  sunday: 'closed',
};

const emptyPickupPoint: FormData = {
  name: '',
  name_i18n: { zh: '', ru: '', tg: '' },
  address: '',
  address_i18n: { zh: '', ru: '', tg: '' },
  latitude: null,
  longitude: null,
  contact_phone: '',
  contact_person: '',
  working_hours: emptyBusinessHours,
  photos: [],
  status: 'ACTIVE',
};

// 格式化营业时间显示
const formatBusinessHours = (hours: BusinessHours | string | null): string => {
  if (!hours) {return '-';}
  if (typeof hours === 'string') {return hours;}
  
  // 如果是对象，格式化显示
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayNames: Record<string, string> = {
    monday: '周一',
    tuesday: '周二',
    wednesday: '周三',
    thursday: '周四',
    friday: '周五',
    saturday: '周六',
    sunday: '周日',
  };
  
  // 简化显示：只显示工作日和周末
  const weekdayHours = hours.monday || hours.tuesday || '-';
  const saturdayHours = hours.saturday || '-';
  const sundayHours = hours.sunday || '-';
  
  if (weekdayHours === saturdayHours && saturdayHours === sundayHours) {
    return `每天 ${weekdayHours}`;
  }
  
  return `工作日 ${weekdayHours}`;
};

// 解析营业时间
const parseBusinessHours = (hours: BusinessHours | string | null): BusinessHours => {
  if (!hours) {return emptyBusinessHours;}
  if (typeof hours === 'string') {
    return {
      monday: hours,
      tuesday: hours,
      wednesday: hours,
      thursday: hours,
      friday: hours,
      saturday: hours,
      sunday: hours,
    };
  }
  return {
    monday: hours.monday || '09:00-18:00',
    tuesday: hours.tuesday || '09:00-18:00',
    wednesday: hours.wednesday || '09:00-18:00',
    thursday: hours.thursday || '09:00-18:00',
    friday: hours.friday || '09:00-18:00',
    saturday: hours.saturday || '10:00-16:00',
    sunday: hours.sunday || 'closed',
  };
};

export default function PickupPointsPage() {
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPoint, setEditingPoint] = useState<PickupPoint | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyPickupPoint);
  const [saving, setSaving] = useState(false);

  // 加载自提点列表
  const loadPickupPoints = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pickup_points')
        .select('*')
        .neq('is_active', false)  // 过滤掉已停用的自提点
        .order('created_at', { ascending: false });

      if (error) {throw error;}
      setPickupPoints(data || []);
    } catch (error) {
      console.error('加载自提点失败:', error);
      toast.error('加载自提点失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPickupPoints();
  }, []);

  // 打开新增/编辑弹窗
  const openModal = (point?: PickupPoint) => {
    if (point) {
      setEditingPoint(point);
      setFormData({
        name: point.name,
        name_i18n: point.name_i18n || { zh: '', ru: '', tg: '' },
        address: point.address,
        address_i18n: point.address_i18n || { zh: '', ru: '', tg: '' },
        latitude: point.latitude,
        longitude: point.longitude,
        contact_phone: point.contact_phone || '',
        contact_person: point.contact_person || '',
        working_hours: parseBusinessHours(point.working_hours),
        photos: Array.isArray(point.photos) ? point.photos : [],
        status: point.status || 'ACTIVE',
      });
    } else {
      setEditingPoint(null);
      setFormData(emptyPickupPoint);
    }
    setShowModal(true);
  };

  // 关闭弹窗
  const closeModal = () => {
    setShowModal(false);
    setEditingPoint(null);
    setFormData(emptyPickupPoint);
  };

  // 保存自提点
  const handleSave = async () => {
    if (!formData.name || !formData.address) {
      toast.error('请填写名称和地址');
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        name: formData.name,
        name_i18n: formData.name_i18n,
        address: formData.address,
        address_i18n: formData.address_i18n,
        latitude: formData.latitude,
        longitude: formData.longitude,
        contact_phone: formData.contact_phone || null,
        contact_person: formData.contact_person || null,
        working_hours: formData.working_hours,
        photos: formData.photos,
        status: formData.status,
      };

      if (editingPoint) {
        // 更新
        const { error } = await supabase
          .from('pickup_points')
          .update(dataToSave)
          .eq('id', editingPoint.id);

        if (error) {throw error;}
        toast.success('更新成功');
      } else {
        // 新增
        const { error } = await supabase
          .from('pickup_points')
          .insert(dataToSave);

        if (error) {throw error;}
        toast.success('添加成功');
      }

      closeModal();
      loadPickupPoints();
    } catch (error) {
      console.error('保存失败:', error);
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 删除自提点
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个自提点吗？此操作将停用该自提点，但不会删除历史记录。')) {return;}

    try {
      // 使用软删除：设置 is_active 为 false 和 status 为 INACTIVE
      const { error } = await supabase
        .from('pickup_points')
        .update({ is_active: false, status: 'INACTIVE' })
        .eq('id', id);

      if (error) {throw error;}
      toast.success('删除成功');
      loadPickupPoints();
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败');
    }
  };

  // 切换启用状态
  const toggleActive = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const { error } = await supabase
        .from('pickup_points')
        .update({ status: newStatus, is_active: newStatus === 'ACTIVE' })
        .eq('id', id);

      if (error) {throw error;}
      loadPickupPoints();
    } catch (error) {
      console.error('更新状态失败:', error);
      toast.error('更新状态失败');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">自提点管理</h1>
        <button
          onClick={() => openModal()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + 添加自提点
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-500">加载中...</p>
        </div>
      ) : pickupPoints.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-lg">
          <p className="text-gray-500">暂无自提点，请点击上方按钮添加</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  名称
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  地址
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  联系人
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  联系电话
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  营业时间
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pickupPoints.map((point) => (
                <tr key={point.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{point.name}</div>
                    {point.name_i18n?.ru && (
                      <div className="text-xs text-gray-500">{point.name_i18n.ru}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{point.address}</div>
                    {point.address_i18n?.ru && (
                      <div className="text-xs text-gray-500">{point.address_i18n.ru}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {point.contact_person || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {point.contact_phone || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs break-words">
                    {formatBusinessHours(point.working_hours)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => toggleActive(point.id, point.status)}
                      className={`px-2 py-1 text-xs rounded-full ${
                        point.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {point.status === 'ACTIVE' ? '启用' : '停用'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => openModal(point)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(point.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingPoint ? '编辑自提点' : '添加自提点'}
            </h2>

            <div className="space-y-4">
              {/* 名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  名称 (中文) *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例如：杜尚别总店"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    名称 (俄文)
                  </label>
                  <input
                    type="text"
                    value={formData.name_i18n.ru}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        name_i18n: { ...formData.name_i18n, ru: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    名称 (塔文)
                  </label>
                  <input
                    type="text"
                    value={formData.name_i18n.tg}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        name_i18n: { ...formData.name_i18n, tg: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* 地址 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  地址 (中文) *
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例如：杜尚别市中心"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    地址 (俄文)
                  </label>
                  <input
                    type="text"
                    value={formData.address_i18n.ru}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address_i18n: { ...formData.address_i18n, ru: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    地址 (塔文)
                  </label>
                  <input
                    type="text"
                    value={formData.address_i18n.tg}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address_i18n: { ...formData.address_i18n, tg: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* 坐标 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    纬度
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={formData.latitude || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        latitude: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="例如：38.5598"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    经度
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={formData.longitude || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        longitude: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="例如：68.7870"
                  />
                </div>
              </div>

              {/* 联系信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    联系人
                  </label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) =>
                      setFormData({ ...formData, contact_person: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    联系电话
                  </label>
                  <input
                    type="text"
                    value={formData.contact_phone}
                    onChange={(e) =>
                      setFormData({ ...formData, contact_phone: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="+992 XXX XXX XXX"
                  />
                </div>
              </div>

              {/* 营业时间 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  营业时间
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map((day) => {
                    const dayNames: Record<string, string> = {
                      monday: '周一',
                      tuesday: '周二',
                      wednesday: '周三',
                      thursday: '周四',
                      friday: '周五',
                      saturday: '周六',
                      sunday: '周日',
                    };
                    return (
                      <div key={day} className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600 w-10">{dayNames[day]}</span>
                        <input
                          type="text"
                          value={formData.working_hours[day] || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              working_hours: { ...formData.working_hours, [day]: e.target.value },
                            })
                          }
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                          placeholder="09:00-18:00 或 closed"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 自提点照片 */}
              <div>
                <MultiImageUpload
                  label="自提点照片（最多3张）"
                  bucket="avatars"
                  folder="pickup-points"
                  maxImages={3}
                  imageUrls={formData.photos}
                  onImageUrlsChange={(urls) => setFormData({ ...formData, photos: urls })}
                />
              </div>

              {/* 启用状态 */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="status"
                  checked={formData.status === 'ACTIVE'}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.checked ? 'ACTIVE' : 'INACTIVE' })
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="status" className="ml-2 text-sm text-gray-700">
                  启用此自提点
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
