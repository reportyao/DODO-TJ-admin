import { supabase } from '@/lib/supabase';
import { adminQuery, adminUpdate, adminDelete } from '@/lib/adminApi';

export interface FullPurchaseOrderDetails {
  id: string;
  order_number: string;
  user_id: string;
  lottery_id: string;
  total_amount: number;
  currency: string;
  status: string;
  batch_id: string | null;
  logistics_status: string;
  pickup_code: string | null;
  pickup_point_id: string | null;
  pickup_status: string | null;
  picked_up_at: string | null;
  picked_up_by: string | null;
  expires_at: string | null;
  metadata: Record<string, any>;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    display_name: string | null;
    phone_number: string | null;
  } | null;
  lottery: {
    id: string;
    title_i18n: Record<string, string>;
    image_urls: string[] | null;
    period: string | null;
  } | null;
  pickup_point: {
    id: string;
    name: string;
    address: string;
  } | null;
}

export const OrderService = {
  /**
   * 获取全款购买订单详情（full_purchase_orders 表）
   */
  async getOrderDetails(orderId: string): Promise<FullPurchaseOrderDetails | null> {
    // 安全修复: 通过 RPC 查询，并手动关联用户、商品、取货点信息
    const orders = await adminQuery<any>(supabase, 'full_purchase_orders', {
      select: '*',
      filters: [{ col: 'id', op: 'eq', val: orderId }],
      limit: 1,
    });
    if (!orders || orders.length === 0) return null;
    const order = orders[0];

    // 关联查询用户信息
    let user = null;
    if (order.user_id) {
      const users = await adminQuery<any>(supabase, 'users', {
        select: '*',
        filters: [{ col: 'id', op: 'eq', val: order.user_id }],
        limit: 1,
      });
      if (users.length > 0) {
        user = { id: users[0].id, display_name: users[0].display_name, phone_number: users[0].phone_number };
      }
    }

    // 关联查询商品信息
    let lottery = null;
    if (order.lottery_id) {
      const lotteries = await adminQuery<any>(supabase, 'lotteries', {
        select: '*',
        filters: [{ col: 'id', op: 'eq', val: order.lottery_id }],
        limit: 1,
      });
      if (lotteries.length > 0) {
        lottery = { id: lotteries[0].id, title_i18n: lotteries[0].title_i18n, image_urls: lotteries[0].image_urls, period: lotteries[0].period };
      }
    }

    // 关联查询取货点信息
    let pickup_point = null;
    if (order.pickup_point_id) {
      const points = await adminQuery<any>(supabase, 'pickup_points', {
        select: '*',
        filters: [{ col: 'id', op: 'eq', val: order.pickup_point_id }],
        limit: 1,
      });
      if (points.length > 0) {
        pickup_point = { id: points[0].id, name: points[0].name, address: points[0].address };
      }
    }

    return { ...order, user, lottery, pickup_point } as FullPurchaseOrderDetails;
  },

  /**
   * 更新订单状态
   */
  async updateOrderStatus(
    orderId: string,
    status: string,
    updates?: {
      logistics_status?: string;
    }
  ): Promise<void> {
    const updateData: Record<string, any> = {
      status,
      updated_at: new Date().toISOString()
    };
    if (updates?.logistics_status) updateData.logistics_status = updates.logistics_status;

    await adminUpdate(supabase, 'full_purchase_orders', updateData, [
      { col: 'id', op: 'eq', val: orderId }
    ]);

    // 取消订单时，级联清理 batch_order_items 中的关联记录，防止产生孤儿数据
    // 必须使用 adminDelete（通过 admin_mutate RPC）而非直接 supabase.from().delete()，
    // 因为管理后台使用 Anon Key，直接操作受 RLS 策略限制可能无权删除
    if (status === 'CANCELLED') {
      try {
        await adminDelete(supabase, 'batch_order_items', [
          { col: 'order_id', op: 'eq', val: orderId }
        ]);
      } catch (e) {
        // 级联清理失败不应阻断订单取消操作
        // 可能原因：该订单本身不在任何批次中（无关联记录），这是正常情况
        console.error('[OrderService] 级联清理批次关联异常:', e);
      }
    }
  },

  /**
   * 更新物流信息（存入 metadata.tracking_info）
   */
  async updateTrackingInfo(orderId: string, trackingInfo: string): Promise<void> {
    // 先查询现有 metadata
    const orders = await adminQuery<any>(supabase, 'full_purchase_orders', {
      select: '*',
      filters: [{ col: 'id', op: 'eq', val: orderId }],
      limit: 1,
    });
    const existing = orders[0];
    const newMetadata = { ...(existing?.metadata || {}), tracking_info: trackingInfo };

    await adminUpdate(supabase, 'full_purchase_orders', 
      { metadata: newMetadata, updated_at: new Date().toISOString() },
      [{ col: 'id', op: 'eq', val: orderId }]
    );
  },
};
