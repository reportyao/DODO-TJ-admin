import React, { useState } from 'react';
import { Search, Users, TrendingUp, Download } from 'lucide-react';
import { useSupabase } from '../contexts/SupabaseContext';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import toast from 'react-hot-toast';

interface User {
  id: string;
  phone_number: string;
  first_name: string;
  last_name: string;
  invite_code: string | null;  // 兼容旧字段
  referral_code: string | null;  // 新字段
  referred_by_id: string | null;
  created_at: string;
}

interface ReferralNode extends User {
  children: ReferralNode[];
  stats: {
    level1_count: number;
    level2_count: number;
    level3_count: number;
    total_commission: number;
  };
}

export default function ReferralManagementPage() {
  const { supabase } = useSupabase();
  const { admin } = useAdminAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [referralTree, setReferralTree] = useState<ReferralNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      toast.error('请输入用户ID、用户名或邀请码');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`id.eq.${searchTerm},phone_number.eq.${searchTerm},phone_number.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,invite_code.eq.${searchTerm},referral_code.eq.${searchTerm}`)
        .limit(1);

      if (error) {throw error;}

      if (data && data.length > 0) {
        setSelectedUser(data[0]);
        await loadReferralTree(data[0].id);
      } else {
        toast.error('未找到用户');
      }
    } catch (error: any) {
      console.error('搜索用户失败:', error);
      toast.error('搜索失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const loadReferralTree = async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-referral-tree', {
        body: { user_id: userId },
        headers: { 'x-admin-id': admin?.id || '' },
      });

      if (error) {throw error;}

      setReferralTree(data);
      setExpandedNodes(new Set([userId]));
    } catch (error: any) {
      console.error('加载邀请树失败:', error);
      toast.error('加载邀请树失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const exportData = async () => {
    if (!referralTree) {
      toast.error('请先搜索用户');
      return;
    }

    const flattenTree = (node: ReferralNode, level: number = 0): any[] => {
      const result = [{
        '用户ID': node.id,
        '显示名': `${node.first_name || ''} ${node.last_name || ''}`.trim() || node.phone_number || '668265e0',
        '手机号': node.phone_number,
        '邀请码': node.referral_code || node.invite_code || '668265e0',
        '层级': level,
        '一级邀请数': node.stats.level1_count,
        '二级邀请数': node.stats.level2_count,
        '三级邀请数': node.stats.level3_count,
        '总返利': node.stats.total_commission,
        '注册时间': new Date(node.created_at).toLocaleString('zh-CN')
      }];

      node.children.forEach(child => {
        result.push(...flattenTree(child, level + 1));
      });

      return result;
    };

    const csvData = flattenTree(referralTree);
    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => headers.map(h => row[h]).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `referral_tree_${selectedUser?.phone_number || selectedUser?.id}_${Date.now()}.csv`;
    link.click();
  };

  const renderTreeNode = (node: ReferralNode, level: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="ml-6">
        <div
          className={`flex items-center gap-3 p-3 rounded-lg border mb-2 cursor-pointer hover:bg-gray-50 ${
            selectedUser?.id === node.id ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'
          }`}
          onClick={() => hasChildren && toggleNode(node.id)}
        >
          {hasChildren && (
            <span className="text-gray-400">
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{`${node.first_name || ''} ${node.last_name || ''}`.trim() || node.phone_number || '668265e0'}</span>
              <span className="text-xs text-gray-500">({node.phone_number || '668265e0'})</span>
              <span className="text-xs bg-gray-100 px-2 py-1 rounded">L{level}</span>
            </div>
            <div className="text-sm text-gray-600 mt-1">
              邀请码: {node.referral_code || node.invite_code || '668265e0'} | 
              邀请: {node.stats.level1_count}人 (L1) / {node.stats.level2_count}人 (L2) / {node.stats.level3_count}人 (L3) |
              返利: {node.stats.total_commission.toFixed(2)} TJS
            </div>
          </div>
        </div>
        {isExpanded && hasChildren && (
          <div className="border-l-2 border-gray-200 ml-3">
            {node.children.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">邀请关系管理</h1>
        <p className="text-gray-600 mt-1">查看和管理用户的邀请关系树</p>
      </div>

      {/* 搜索区域 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="输入用户ID、用户名或邀请码进行搜索..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            {loading ? '搜索中...' : '搜索'}
          </button>
          {referralTree && (
            <button
              onClick={exportData}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              导出数据
            </button>
          )}
        </div>
      </div>

      {/* 用户信息卡片 */}
      {selectedUser && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">用户信息</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">显示名</p>
              <p className="font-medium">{`${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim() || selectedUser.phone_number || '668265e0'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">手机号</p>
              <p className="font-medium">{selectedUser.phone_number}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">邀请码</p>
              <p className="font-medium">{selectedUser.referral_code || selectedUser.invite_code || '668265e0'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">注册时间</p>
              <p className="font-medium">{new Date(selectedUser.created_at).toLocaleString('zh-CN')}</p>
            </div>
          </div>
        </div>
      )}

      {/* 邀请树 */}
      {referralTree && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              邀请关系树
            </h2>
            <div className="text-sm text-gray-600">
              总计: {referralTree.stats.level1_count + referralTree.stats.level2_count + referralTree.stats.level3_count} 人
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {renderTreeNode(referralTree)}
          </div>
        </div>
      )}

      {!selectedUser && !loading && (
        <div className="text-center py-12 text-gray-500">
          <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>请输入用户信息进行搜索</p>
        </div>
      )}
    </div>
  );
}
