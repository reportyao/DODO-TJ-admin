/**
 * AI 商品上架助手 — TypeScript 类型定义
 *
 * 定义 AI 任务状态流转、输入输出结构，以及 AI 商品理解在新架构下的多语言与事实层数据模型。
 * 状态枚举：queued → processing → done / partial / error
 */

// AI 任务状态
// v2.0 新增 processing_images：文案已完成，后台营销海报由 pg_cron + processor 逐张陆续推送
export type AITaskStatus = 'queued' | 'processing' | 'processing_images' | 'done' | 'partial' | 'error';

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

// 单张营销海报（伴有俄文文案）
export interface MarketingImage {
  id: string;                    // 对应 ai_image_tasks.id
  url: string;                   // 最终合成后的 JPEG 图 URL
  ru_caption?: string;
  display_order: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
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
  background_images: string[];  // 下向兼容：旧背景图数组（或空数组）
  // v2.0 新增：带俄文文案的营销海报（Realtime 逐张填充）
  marketing_images?: MarketingImage[];
  // v2.0 后台任务 parent id，供 Realtime 订阅使用
  parent_task_id?: string | null;
  // 已入队的待生图总数
  enqueued_images?: number;
  // 抠图后的透明底图原图（降级时也可用于上架）
  segmented_image?: string | null;
  // 用户上传的原图
  original_images?: string[];
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
  category: string;              // 分类名称（用于AI分析和显示）
  categoryId?: string;           // [v2.1] homepage_categories 表的 ID（用于入库时创建 product_categories 关联）
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
  status: 'processing' | 'processing_images' | 'done' | 'partial' | 'error';
  progress: number;
  stage?: string;
  result?: AIListingResult;
  error?: string;
}

// [v2.1 修复] 品类不再硬编码，改为从 homepage_categories 表动态获取
// 旧的 CATEGORY_OPTIONS 已废弃，分类数据统一使用首页场景化分类管理
// 参见 TaskCreationForm.tsx 中的 fetchCategories()
