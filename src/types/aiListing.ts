/**
 * AI 商品上架助手 — TypeScript 类型定义
 *
 * 定义 AI 任务状态流转、输入输出结构，以及 AI 商品理解在新架构下的多语言与事实层数据模型。
 * 状态枚举：queued → processing → done / partial / error
 */

// AI 任务状态
export type AITaskStatus = 'queued' | 'processing' | 'done' | 'partial' | 'error';

export type LanguageCode = 'tg' | 'ru' | 'zh';

export type LocalizedAIText = {
  ru?: string;
  zh?: string;
  tg?: string;
};

export interface AISemanticFacts {
  product_type?: string;
  core_function?: string;
  target_user_traits?: string[];
  primary_pain_points?: string[];
  usage_steps?: string[];
  usage_tips?: string[];
  usage_scenarios?: string[];
  parameter_highlights?: string[];
  local_context_signals?: string[];
  trust_signals?: string[];
  badge_candidates?: string[];
}

export interface AIUnderstandingI18n {
  target_people?: LocalizedAIText;
  selling_angle?: LocalizedAIText;
  how_to_use?: LocalizedAIText;
  best_scene?: LocalizedAIText;
  local_life_connection?: LocalizedAIText;
  recommended_badge?: LocalizedAIText;
  semantic_facts?: AISemanticFacts;
  generated_at?: string;
  generated_by?: string;
  model_used?: string;
  generation_mode?: string;
  primary_market_language?: 'tg' | 'ru' | 'zh';
  display_priority?: LanguageCode[];
  source_language?: 'multi' | 'tg' | 'ru' | 'zh';
}

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
    semantic_facts?: AISemanticFacts;
    // AI 商品理解数据（用于保存到 inventory_products.ai_understanding）
    ai_understanding?: AIUnderstandingI18n;
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
