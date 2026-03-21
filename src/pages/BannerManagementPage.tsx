import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Eye, EyeOff, ArrowUp, ArrowDown } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import toast from 'react-hot-toast';
import { SingleImageUpload } from '@/components/SingleImageUpload';

interface Banner {
  id: string;
  title: string;
  image_url: string;
  image_url_zh: string | null;
  image_url_ru: string | null;
  image_url_tg: string | null;
  link_url: string | null;
  link_type: string;
  sort_order: number;
  is_active: boolean;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  updated_at: string;
}

export default function BannerManagementPage() {
  const { supabase } = useSupabase();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    image_url: '',
    image_url_zh: '',
    image_url_ru: '',
    image_url_tg: '',
    link_url: '',
    link_type: 'internal',
    sort_order: 0,
    is_active: true,
    start_time: '',
    end_time: ''
  });

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .order('sort_order', { ascending: true});

      if (error) {throw error;}
      setBanners(data || []);
    } catch (error: any) {
      console.error('Failed to fetch banners:', error);
      toast.error('获取Banner列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 必填字段验证
    if (!formData.title.trim()) {
      toast.error('Banner 标题不能为空');
      return;
    }
    const hasImage = formData.image_url || formData.image_url_zh || formData.image_url_ru || formData.image_url_tg;
    if (!hasImage) {
      toast.error('请至少上传一张 Banner 图片');
      return;
    }
    // 时间范围验证
    if (formData.start_time && formData.end_time) {
      if (new Date(formData.start_time) >= new Date(formData.end_time)) {
        toast.error('开始时间必须早于结束时间');
        return;
      }
    }

    try {
      const bannerData = {
        title: formData.title,
        image_url: formData.image_url || formData.image_url_zh || formData.image_url_ru || formData.image_url_tg,
        image_url_zh: formData.image_url_zh || null,
        image_url_ru: formData.image_url_ru || null,
        image_url_tg: formData.image_url_tg || null,
        link_url: formData.link_url || null,
        link_type: formData.link_type,
        sort_order: formData.sort_order,
        is_active: formData.is_active,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        updated_at: new Date().toISOString()
      };

      if (editingBanner) {
        const { error } = await supabase
          .from('banners')
          .update(bannerData)
          .eq('id', editingBanner.id);

        if (error) {throw error;}
        toast.success('Banner更新成功');
      } else {
        const { error } = await supabase
          .from('banners')
          .insert([bannerData]);

        if (error) {throw error;}
        toast.success('Banner创建成功');
      }

      setShowModal(false);
      resetForm();
      fetchBanners();
    } catch (error: any) {
      console.error('Failed to save banner:', error);
      toast.error('保存失败: ' + error.message);
    }
  };

  const handleEdit = (banner: Banner) => {
    setEditingBanner(banner);
    setFormData({
      title: banner.title,
      image_url: banner.image_url,
      image_url_zh: banner.image_url_zh || '',
      image_url_ru: banner.image_url_ru || '',
      image_url_tg: banner.image_url_tg || '',
      link_url: banner.link_url || '',
      link_type: banner.link_type,
      sort_order: banner.sort_order,
      is_active: banner.is_active,
      start_time: banner.start_time || '',
      end_time: banner.end_time || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个Banner吗？')) {return;}
    
    try {
      const { error } = await supabase
        .from('banners')
        .delete()
        .eq('id', id);

      if (error) {throw error;}
      toast.success('Banner删除成功');
      fetchBanners();
    } catch (error: any) {
      console.error('Failed to delete banner:', error);
      toast.error('删除失败');
    }
  };

  const toggleActive = async (banner: Banner) => {
    try {
      const { error } = await supabase
        .from('banners')
        .update({ is_active: !banner.is_active })
        .eq('id', banner.id);

      if (error) {throw error;}
      toast.success(banner.is_active ? 'Banner已停用' : 'Banner已启用');
      fetchBanners();
    } catch (error: any) {
      console.error('Failed to toggle banner:', error);
      toast.error('状态切换失败');
    }
  };

  const moveOrder = async (banner: Banner, direction: 'up' | 'down') => {
    const currentIndex = banners.findIndex(b => b.id === banner.id);
    if (
      (direction === 'up' && currentIndex === 0) ||
      (direction === 'down' && currentIndex === banners.length - 1)
    ) {
      return;
    }

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const targetBanner = banners[targetIndex];

    try {
      // 第一步：更新当前 banner 的排序
      const { error: err1 } = await supabase
        .from('banners')
        .update({ sort_order: targetBanner.sort_order })
        .eq('id', banner.id);
      if (err1) throw err1;

      // 第二步：更新目标 banner 的排序
      const { error: err2 } = await supabase
        .from('banners')
        .update({ sort_order: banner.sort_order })
        .eq('id', targetBanner.id);
      if (err2) {
        // 回滚第一步
        await supabase
          .from('banners')
          .update({ sort_order: banner.sort_order })
          .eq('id', banner.id);
        throw err2;
      }

      toast.success('排序已更新');
      fetchBanners();
    } catch (error: any) {
      console.error('Failed to update order:', error);
      toast.error('排序更新失败');
      fetchBanners(); // 失败时也刷新列表确保状态一致
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      image_url: '',
      image_url_zh: '',
      image_url_ru: '',
      image_url_tg: '',
      link_url: '',
      link_type: 'internal',
      sort_order: banners.length,
      is_active: true,
      start_time: '',
      end_time: ''
    });
    setEditingBanner(null);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Banner管理</h1>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600"
        >
          <Plus className="w-5 h-5" />
          创建Banner
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">加载中...</div>
      ) : banners.length === 0 ? (
        <div className="text-center py-12 text-gray-500">暂无Banner</div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {(banners || []).map((banner, index) => (
            <div key={banner.id} className="bg-white rounded-lg shadow-md p-4 flex items-center gap-4">
              <img
                src={banner.image_url_zh || banner.image_url_ru || banner.image_url_tg || banner.image_url}
                alt={banner.title}
                className="w-48 h-24 object-cover rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x200?text=No+Image';
                }}
              />
              <div className="flex-1">
                <h3 className="font-bold text-lg">{banner.title}</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>链接: {banner.link_url || '无'}</div>
                  <div>排序: {banner.sort_order}</div>
                  <div>
                    多语言: 
                    {banner.image_url_zh && ' 中文✓'}
                    {banner.image_url_ru && ' 俄语✓'}
                    {banner.image_url_tg && ' 塔吉克语✓'}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => toggleActive(banner)}
                  className={`flex items-center gap-1 px-3 py-1 rounded text-sm ${
                    banner.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {banner.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  {banner.is_active ? '已启用' : '已停用'}
                </button>
                <button
                  onClick={() => handleEdit(banner)}
                  className="flex items-center gap-1 bg-blue-100 text-blue-700 px-3 py-1 rounded text-sm"
                >
                  <Edit className="w-4 h-4" />
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(banner.id)}
                  className="flex items-center gap-1 bg-red-100 text-red-700 px-3 py-1 rounded text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => moveOrder(banner, 'up')}
                  disabled={index === 0}
                  className="p-2 bg-gray-100 rounded disabled:opacity-50"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moveOrder(banner, 'down')}
                  disabled={index === banners.length - 1}
                  className="p-2 bg-gray-100 rounded disabled:opacity-50"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingBanner ? '编辑Banner' : '创建Banner'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">标题 *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    required
                  />
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-2">🖼️ 多语言Banner图片</h3>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-blue-800">
                      📐 <strong>建议尺寸:</strong> 1200×400px (3:1比例)
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      💡 上传不同语言版本的Banner图片，系统会根据用户语言自动切换显示。至少上传一种语言版本。
                    </p>
                  </div>
                  
                  <div className="space-y-6">
                    {/* 中文版 */}
                    <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">🇨🇳</span>
                        <span className="font-bold text-red-700">中文版 Banner</span>
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">Chinese</span>
                      </div>
                      <SingleImageUpload
                        bucket="banners"
                        folder="zh"
                        imageUrl={formData.image_url_zh}
                        onImageUrlChange={(url) => setFormData({ ...formData, image_url_zh: url })}
                      />
                    </div>
                    
                    {/* 俄语版 */}
                    <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">🇷🇺</span>
                        <span className="font-bold text-blue-700">俄语版 Banner</span>
                        <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">Русский</span>
                      </div>
                      <SingleImageUpload
                        bucket="banners"
                        folder="ru"
                        imageUrl={formData.image_url_ru}
                        onImageUrlChange={(url) => setFormData({ ...formData, image_url_ru: url })}
                      />
                    </div>
                    
                    {/* 塔吉克语版 */}
                    <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">🇹🇯</span>
                        <span className="font-bold text-green-700">塔吉克语版 Banner</span>
                        <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded">Тоҷикӣ</span>
                      </div>
                      <SingleImageUpload
                        bucket="banners"
                        folder="tg"
                        imageUrl={formData.image_url_tg}
                        onImageUrlChange={(url) => setFormData({ ...formData, image_url_tg: url })}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">链接地址</label>
                  <input
                    type="text"
                    value={formData.link_url}
                    onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="/lottery/123 或 https://example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">链接类型</label>
                  <select
                    value={formData.link_type}
                    onChange={(e) => setFormData({ ...formData, link_type: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="internal">内部链接</option>
                    <option value="external">外部链接</option>
                    <option value="none">无链接</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">排序</label>
                    <input
                      type="number"
                      value={formData.sort_order}
                      onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">状态</label>
                    <select
                      value={formData.is_active ? 'active' : 'inactive'}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'active' })}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="active">启用</option>
                      <option value="inactive">停用</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">开始时间</label>
                    <input
                      type="datetime-local"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">结束时间</label>
                    <input
                      type="datetime-local"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 border rounded hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
                  >
                    {editingBanner ? '更新' : '创建'}
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
