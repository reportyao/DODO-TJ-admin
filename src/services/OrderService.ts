import { supabase } from '@/lib/supabase';
import { Tables } from '@/types/supabase';

type Order = Tables<'orders'>;

export const OrderService = {
  /**
   * 获取单个订单详情
   * @param orderId 订单ID
   * @returns 订单详情，包含关联的用户和积分商城信息
   */
  async getOrderDetails(orderId: string): Promise<any> {
    // 先查询订单
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError) {
      if (orderError.code === 'PGRST116') {
        return null; // 订单不存在
      }
      console.error('Error fetching order:', orderError);
      throw orderError;
    }

    if (!orderData) {return null;}

    // 查询用户信息
    let userData = null;
    if (orderData.user_id) {
      const { data: user } = await supabase
        .from('users')
        .select('id, phone_number, first_name, last_name')
        .eq('id', orderData.user_id)
        .single();
      userData = user;
    }

    // 查询积分商城信息
    let lotteryData = null;
    if (orderData.lottery_id) {
      const { data: lottery } = await supabase
        .from('lotteries')
        .select('id, title_i18n, period, image_urls')
        .eq('id', orderData.lottery_id)
        .single();
      lotteryData = lottery;
    }

    return {
      ...orderData,
      user: userData,
      lottery: lotteryData
    };
  },

  /**
   * 更新订单状态和物流信息
   * @param orderId 订单ID
   * @param status 订单状态
   * @param trackingNumber 物流单号 (可选)
   */
  async updateOrderStatus(orderId: string, status: Tables<'orders'>['status'], trackingNumber?: string): Promise<void> {
    const updateData: any = { status, updated_at: new Date().toISOString() };
    if (trackingNumber !== undefined) {
      updateData.tracking_number = trackingNumber;
    }

    const { error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId);

    if (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  },
};
