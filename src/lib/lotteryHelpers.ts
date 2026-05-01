/**
 * 商城活动（lotteries）相关共享 helper
 * --------------------------------------------------
 * 抽取自 LotteryForm.tsx，目的是让"库存页一键批量创建商城活动"
 * 与"商城活动表单单个创建"复用同一套字段构造、期号生成与库存预留同步逻辑，
 * 避免业务规则散落在多处导致字段差异。
 *
 * 不影响数据库结构，所有写入仍走既有 admin_mutate RPC（lotteries 已在白名单内）。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminInsert } from './adminApi';

// ----------------------------------------------------------------
// 类型定义
// ----------------------------------------------------------------

/**
 * 用于构造 lottery payload 的最小库存商品快照
 */
export interface InventoryProductForLottery {
  id: string;
  name?: string | null;
  name_i18n?: { zh?: string; ru?: string; tg?: string } | null;
  description_i18n?: { zh?: string; ru?: string; tg?: string } | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  original_price?: number | null;
  stock?: number | null;
  status?: string | null;
  sku?: string | null;
  ai_understanding?: Record<string, any> | null;
}

export interface BuildLotteryPayloadOptions {
  /** 活动初始状态，默认 'ACTIVE'（进行中） */
  status?: 'PENDING' | 'ACTIVE' | 'SOLD_OUT' | 'COMPLETED' | 'CANCELLED';
  /** 单价（票价），默认 1 */
  ticketPrice?: number;
  /** 总票数，默认按 round(original_price) 取整 */
  totalTickets?: number;
  /** 比价清单，默认 [] */
  priceComparisons?: Array<Record<string, any>>;
  /** 是否启用全款购买，默认 true */
  fullPurchaseEnabled?: boolean;
  /** 开始时间 ISO 字符串，默认当前时间 */
  startTime?: string;
  /** 是否无限购，默认 true → max_per_user = null */
  unlimitedPurchase?: boolean;
  /** 每人限购，仅在 unlimitedPurchase=false 时生效，默认 1 */
  maxPerUser?: number;
}

// ----------------------------------------------------------------
// 期号生成（与 LotteryForm 行为完全一致）
// ----------------------------------------------------------------

/**
 * 生成期号：使用复杂算法避免规律被发现
 * 算法：时间戳 + 随机数 + Base36编码 + 校验位
 */
export function generateLotteryPeriod(): string {
  const now = Date.now();
  const timePart = (now % 100000000).toString(36).toUpperCase();
  const randomPart = Math.floor(Math.random() * 46656)
    .toString(36)
    .toUpperCase()
    .padStart(3, '0');
  const checksum = ((now + Math.floor(Math.random() * 1000)) % 36)
    .toString(36)
    .toUpperCase();
  return `LM${timePart}${randomPart}${checksum}`;
}

// ----------------------------------------------------------------
// 字段默认值与 payload 构造
// ----------------------------------------------------------------

const DEFAULT_TICKET_PRICE = 1;

/**
 * 由库存商品 + options 构造一份可直接 insert 到 lotteries 表的 payload。
 *
 * 关键默认值：
 *  - status: 'ACTIVE'（进行中）
 *  - price_comparisons: []（比价留空）
 *  - currency: 'TJS'
 *  - unlimited_purchase: true → max_per_user: null
 *  - full_purchase_enabled: true，full_purchase_price: 库存商品 original_price
 *  - title/description/image 直接读取库存商品的 i18n 与图片字段
 *  - ai_understanding 直接复用库存商品 ai_understanding
 *
 * 字段集与 LotteryForm.handleSubmit 中的 payload 严格对齐，确保两边创建出的活动
 * 在数据形态上一致。
 */
export function buildLotteryPayloadFromInventory(
  product: InventoryProductForLottery,
  options: BuildLotteryPayloadOptions = {}
): Record<string, any> {
  const status = options.status ?? 'ACTIVE';
  const ticketPrice = Number(options.ticketPrice ?? DEFAULT_TICKET_PRICE);
  const originalPrice = Number(product.original_price ?? 0);
  const totalTickets =
    options.totalTickets !== undefined && options.totalTickets !== null
      ? Math.max(1, Math.round(Number(options.totalTickets)))
      : Math.max(1, Math.round(originalPrice / Math.max(ticketPrice, 1)));

  const priceComparisons = Array.isArray(options.priceComparisons)
    ? options.priceComparisons
    : [];

  const fullPurchaseEnabled = options.fullPurchaseEnabled ?? true;

  const startTimeIso = options.startTime
    ? new Date(options.startTime).toISOString()
    : new Date().toISOString();

  const unlimited = options.unlimitedPurchase ?? true;
  const maxPerUser = unlimited ? null : Math.max(1, Number(options.maxPerUser ?? 1));

  const titleI18n =
    product.name_i18n && Object.keys(product.name_i18n).length > 0
      ? product.name_i18n
      : { zh: product.name || '', ru: product.name || '', tg: product.name || '' };
  const descI18n = product.description_i18n || {};

  const images: string[] =
    Array.isArray(product.image_urls) && product.image_urls.length > 0
      ? (product.image_urls.filter(Boolean) as string[])
      : product.image_url
        ? [product.image_url]
        : [];

  return {
    title: titleI18n.zh || product.name || '',
    description: descI18n.zh || '',
    title_i18n: titleI18n,
    description_i18n: descI18n,
    period: generateLotteryPeriod(),
    ticket_price: ticketPrice,
    total_tickets: totalTickets,
    max_per_user: maxPerUser,
    currency: 'TJS',
    status,
    image_url: images[0] || null,
    image_urls: images,
    start_time: startTimeIso,
    updated_at: new Date().toISOString(),
    price_comparisons: priceComparisons,
    inventory_product_id: product.id,
    full_purchase_enabled: fullPurchaseEnabled,
    full_purchase_price: originalPrice > 0 ? originalPrice : null,
    original_price: originalPrice,
    ai_understanding: product.ai_understanding ?? null,
  };
}

// ----------------------------------------------------------------
// 已存在活动检测（用于"自动忽略已有活动"）
// ----------------------------------------------------------------

/**
 * 视为"已存在商城活动"的状态集合：
 *  - PENDING：未开始（已经被创建过，无须重复）
 *  - ACTIVE：进行中
 *  - SOLD_OUT：售罄等待开奖（仍占用库存预留）
 *
 * COMPLETED / CANCELLED 视为"已结束"，不会阻止再次为该商品创建新活动。
 */
export const ACTIVE_LIKE_LOTTERY_STATUSES = ['PENDING', 'ACTIVE', 'SOLD_OUT'] as const;

/**
 * 查询给定 inventory_product_id 集合中，已存在 PENDING/ACTIVE/SOLD_OUT 活动的 id 集合。
 *
 * 直接走表查询（lotteries 已在 admin_query 白名单中），不依赖额外 RPC。
 * 这里使用前端 supabase.from() 即可，因为 LotteryForm 中查询活动数也是这种用法，
 * 以便在 admin RLS 之外保留与既有代码一致的行为。
 */
export async function findInventoryIdsWithActiveLotteries(
  supabase: SupabaseClient,
  inventoryProductIds: string[]
): Promise<Set<string>> {
  const ids = Array.from(new Set(inventoryProductIds.filter(Boolean)));
  if (ids.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from('lotteries')
    .select('inventory_product_id, status')
    .in('inventory_product_id', ids)
    .in('status', ACTIVE_LIKE_LOTTERY_STATUSES as unknown as string[]);

  if (error) {
    throw error;
  }

  const result = new Set<string>();
  for (const row of (data || []) as Array<{ inventory_product_id: string | null }>) {
    if (row.inventory_product_id) {
      result.add(row.inventory_product_id);
    }
  }
  return result;
}

// ----------------------------------------------------------------
// 库存预留同步（与 LotteryForm.syncReservedStockForInventoryIds 一致）
// ----------------------------------------------------------------

/**
 * 重新计算并写回指定 inventory_product 的 reserved_stock。
 * reserved_stock = 当前 ACTIVE/SOLD_OUT 状态的活动数量。
 *
 * 与 LotteryForm 中保持完全一致的口径，避免两条创建路径各算各的。
 */
export async function syncReservedStockForInventoryIds(
  supabase: SupabaseClient,
  inventoryProductIds: Array<string | null | undefined>
): Promise<void> {
  const ids = Array.from(
    new Set(
      inventoryProductIds.filter((value): value is string => Boolean(value))
    )
  );

  for (const inventoryProductId of ids) {
    const { count, error: countError } = await supabase
      .from('lotteries')
      .select('id', { count: 'exact', head: true })
      .eq('inventory_product_id', inventoryProductId)
      .in('status', ['ACTIVE', 'SOLD_OUT']);

    if (countError) {
      throw countError;
    }

    const { error: updateInventoryError } = await supabase
      .from('inventory_products')
      .update({
        reserved_stock: count || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inventoryProductId);

    if (updateInventoryError) {
      throw updateInventoryError;
    }
  }
}

// ----------------------------------------------------------------
// 批量创建主流程
// ----------------------------------------------------------------

export interface BatchCreateLotteriesResult {
  /** 成功创建的库存商品 id */
  created: string[];
  /** 已存在 PENDING/ACTIVE/SOLD_OUT 活动而被跳过的库存商品 id */
  skipped: string[];
  /** 状态非 ACTIVE 而被跳过的库存商品 id */
  inactive: string[];
  /** 库存不足而被跳过的库存商品 id */
  insufficientStock: string[];
  /** 创建过程中失败的库存商品 id 与错误信息 */
  failed: Array<{ id: string; error: string }>;
}

/**
 * 一键批量创建商城活动：
 *  1. 过滤掉非 ACTIVE 的库存商品（不能为下架/缺货商品创建活动）
 *  2. 查询并自动忽略已经存在 PENDING/ACTIVE/SOLD_OUT 活动的商品
 *  3. 校验剩余商品的可用库存（stock 减去已占用的活动数）足以再开 1 个活动
 *  4. 走 adminInsert 写入 lotteries（默认 status=ACTIVE，price_comparisons=[]）
 *  5. 同步刷新所有受影响商品的 reserved_stock
 */
export async function batchCreateLotteriesFromInventory(
  supabase: SupabaseClient,
  products: InventoryProductForLottery[],
  options: BuildLotteryPayloadOptions = {}
): Promise<BatchCreateLotteriesResult> {
  const result: BatchCreateLotteriesResult = {
    created: [],
    skipped: [],
    inactive: [],
    insufficientStock: [],
    failed: [],
  };

  if (!products || products.length === 0) {
    return result;
  }

  // 1. 过滤掉非 ACTIVE 商品
  const activeProducts = products.filter((p) => {
    if (p.status !== 'ACTIVE') {
      result.inactive.push(p.id);
      return false;
    }
    return true;
  });
  if (activeProducts.length === 0) {
    return result;
  }

  // 2. 查询已存在活动的商品 id（ACTIVE/PENDING/SOLD_OUT），自动忽略
  const productIds = activeProducts.map((p) => p.id);
  const existingIdSet = await findInventoryIdsWithActiveLotteries(
    supabase,
    productIds
  );
  const candidates = activeProducts.filter((p) => {
    if (existingIdSet.has(p.id)) {
      result.skipped.push(p.id);
      return false;
    }
    return true;
  });
  if (candidates.length === 0) {
    return result;
  }

  // 3. 库存校验：当前 ACTIVE/SOLD_OUT 活动数 + 1 必须 ≤ stock
  //    一次性查询，避免 N 次往返
  const { data: occupiedRows, error: occupiedErr } = await supabase
    .from('lotteries')
    .select('inventory_product_id')
    .in('inventory_product_id', candidates.map((p) => p.id))
    .in('status', ['ACTIVE', 'SOLD_OUT']);
  if (occupiedErr) {
    throw occupiedErr;
  }
  const occupiedCount = new Map<string, number>();
  for (const row of (occupiedRows || []) as Array<{
    inventory_product_id: string | null;
  }>) {
    if (!row.inventory_product_id) continue;
    occupiedCount.set(
      row.inventory_product_id,
      (occupiedCount.get(row.inventory_product_id) || 0) + 1
    );
  }

  const eligible: InventoryProductForLottery[] = [];
  for (const p of candidates) {
    const stock = Number(p.stock ?? 0);
    const occupied = occupiedCount.get(p.id) || 0;
    if (stock < occupied + 1) {
      result.insufficientStock.push(p.id);
      continue;
    }
    eligible.push(p);
  }

  // 4. 顺序写入（避免期号生成在同毫秒内重复，且方便逐条收集错误）
  const touchedInventoryIds: string[] = [];
  for (const product of eligible) {
    try {
      const payload = buildLotteryPayloadFromInventory(product, options);
      await adminInsert(supabase, 'lotteries', payload);
      result.created.push(product.id);
      touchedInventoryIds.push(product.id);
    } catch (e: any) {
      result.failed.push({
        id: product.id,
        error: e?.message || String(e) || '未知错误',
      });
    }
  }

  // 5. 同步 reserved_stock
  if (touchedInventoryIds.length > 0) {
    try {
      await syncReservedStockForInventoryIds(supabase, touchedInventoryIds);
    } catch (e) {
      // reserved_stock 同步失败不应吞掉已成功的创建结果，仅打印日志
      // eslint-disable-next-line no-console
      console.error('[batchCreateLotteriesFromInventory] sync reserved stock failed:', e);
    }
  }

  return result;
}
