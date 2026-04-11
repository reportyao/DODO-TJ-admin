/**
 * AI 商品上架助手 — TypeScript 类型定义
 *
 * 定义了 AI 任务的状态流转、输入/输出结构、品类预设等核心类型。
 * 状态枚举：queued → processing → done / partial / error
 */

// AI 任务状态
export type AITaskStatus = 'queued' | 'processing' | 'done' | 'partial' | 'error';

// AI 生成结果（来自 Edge Function SSE 的 result 字段）
export interface AIListingResult {
  title_ru: string;
  title_zh: string;
  title_tg: string;
  bullets_ru: string[];
  bullets_zh: string[];
  bullets_tg: string[];
  description_ru: string;
  description_zh: string;
  description_tg: string;
  background_images: string[];  // Supabase Storage 永久 URL
  // Step A 分析结果（用于入库时填充 material 等字段）
  analysis?: {
    product_type?: string;
    main_color?: string;
    material_guess?: string | null;
    key_features?: string[];
    use_scenes?: string[];
    target_audience?: string;
    // AI 商品理解数据（用于保存到 inventory_products.ai_understanding）
    ai_understanding?: {
      target_people?: string;
      selling_angle?: string;
      best_scene?: string;
      local_life_connection?: string;
      recommended_badge?: string;
    };
    // selling_points 从 Step A 透传
    selling_points?: Array<{ zh: string; detail: string }>;
  };
}

// 单个 AI 任务
export interface AITask {
  id: string;                    // 前端生成的 UUID
  status: AITaskStatus;
  progress: number;              // 0-100
  stage: string;                 // 当前阶段描述
  // 输入
  imageUrls: string[];           // 已上传到 Storage 的图片 URL
  category: string;
  productName: string;
  specs: string;
  price: number;
  stock: number;
  notes: string;
  // 输出
  result?: AIListingResult;
  errorMessage?: string;
  // 入库状态
  savedToInventory: boolean;
  // 时间
  createdAt: Date;
  completedAt?: Date;
}

// SSE 事件数据结构（来自 Edge Function）
export interface SSEEventData {
  status: 'processing' | 'done' | 'partial' | 'error';
  progress: number;
  stage?: string;
  result?: AIListingResult;
  error?: string;
}

// 品类预设列表
export const CATEGORY_OPTIONS = [
  '服装',
  '鞋靴',
  '箱包',
  '美妆',
  '家居',
  '数码',
  '食品',
  '母婴',
] as const;

export type CategoryOption = (typeof CATEGORY_OPTIONS)[number];
