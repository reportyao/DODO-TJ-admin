import { supabase } from '@/lib/supabase';

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
    const { data, error } = await supabase
      .from('full_purchase_orders')
      .select(`
        *,
        user:users(id, display_name, phone_number),
        lottery:lotteries(id, title_i18n, image_urls, period),
        pickup_point:pickup_points(id, name, address)
      `)
      .eq('id', orderId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data as FullPurchaseOrderDetails;
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

    const { error } = await supabase
      .from('full_purchase_orders')
      .update(updateData)
      .eq('id', orderId);

    if (error) throw error;
  },

  /**
   * 更新物流信息（存入 metadata.tracking_info）
   */
  async updateTrackingInfo(orderId: string, trackingInfo: string): Promise<void> {
    const { data: existing, error: fetchErr } = await supabase
      .from('full_purchase_orders')
      .select('metadata')
      .eq('id', orderId)
      .single();

    if (fetchErr) throw fetchErr;

    const newMetadata = { ...(existing?.metadata || {}), tracking_info: trackingInfo };

    const { error } = await supabase
      .from('full_purchase_orders')
      .update({ metadata: newMetadata, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    if (error) throw error;
  },
};
