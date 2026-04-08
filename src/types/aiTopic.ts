/**
 * AI 专题生成助手 — TypeScript 类型定义
 *
 * 定义了 AI 专题任务的状态流转、输入/输出结构、SSE 事件格式等核心类型。
 * 与 ai-listing-generate 保持一致的状态枚举：queued → processing → done / partial / error
 *
 * 两层架构：
 *   - 商品理解层 (understanding): 分析商品在本地生活中的使用场景
 *   - 内容表达层 (content): 生成三语专题草稿
 */

// ============================================================
// 任务状态
// ============================================================

export type AITopicTaskStatus = 'queued' | 'processing' | 'done' | 'partial' | 'error';

// ============================================================
// 请求结构（发送给 Edge Function 的 payload）
// ============================================================

export interface AITopicDraftRequest {
  topic_goal: string;
  target_audience: string[];
  core_scene: string[];
  local_context_hints: string[];
  selected_products: AITopicProductInput[];
  manual_notes?: string;
  tone_constraints?: string[];
  output_languages: ('zh' | 'ru' | 'tg')[];
}

/** 选中商品的输入信息 */
export interface AITopicProductInput {
  id: string;
  name: string;
  name_i18n?: Record<string, string> | null;
  description_i18n?: Record<string, string> | null;
  image_url?: string | null;
  original_price?: number | null;
  active_lottery?: {
    ticket_price?: number;
  } | null;
  categories?: Array<{ code: string; name_i18n?: Record<string, string> | null }>;
  tags?: Array<{ code: string; name_i18n?: Record<string, string> | null }>;
}

// ============================================================
// 商品理解层结果
// ============================================================

export interface ProductUnderstanding {
  overall_theme: string;
  story_angle: string;
  local_anchors_used: string[];
  risk_notes: string[];
  products_analysis: ProductAnalysisItem[];
  recommended_topic_type: 'story' | 'collection' | 'seasonal' | 'gift_guide';
  recommended_card_style: 'story_card' | 'image_card' | 'minimal_card';
}

export interface ProductAnalysisItem {
  product_id: string;
  product_name: string;
  best_scene: string;
  target_people: string;
  local_life_connection: string;
  selling_angle: string;
  recommended_badge: string;
}

// ============================================================
// 内容表达层结果
// ============================================================

export interface AITopicDraftResult {
  // 理解层
  understanding: ProductUnderstanding;
  // 内容表达层
  title_i18n: Record<string, string>;
  subtitle_i18n: Record<string, string>;
  intro_i18n: Record<string, string>;
  story_blocks_i18n: StoryBlock[];
  placement_variants: PlacementVariant[];
  product_notes: ProductNote[];
  recommended_category_ids: string[];
  recommended_tag_ids: string[];
  // 质量元数据
  explanation: {
    local_anchors: string[];
    selected_story_angle: string;
    risk_notes: string[];
  };
  quality_warnings: string[];
}

export interface StoryBlock {
  block_key: string;
  block_type: 'paragraph';
  zh: string;
  ru: string;
  tg: string;
}

export interface PlacementVariant {
  variant_name: string;
  title_i18n: Record<string, string>;
  subtitle_i18n: Record<string, string>;
  angle: string;
}

export interface ProductNote {
  product_id: string;
  note_i18n: Record<string, string>;
  badge_text_i18n?: Record<string, string>;
}

// ============================================================
// SSE 事件数据结构
// ============================================================

export interface AITopicSSEEventData {
  status: AITopicTaskStatus;
  progress: number;
  stage?: string;
  result?: AITopicDraftResult;
  error?: string;
  task_id?: string;
}

// ============================================================
// 前端任务对象（本地状态管理）
// ============================================================

export interface AITopicTask {
  id: string;                          // 前端生成的 UUID
  status: AITopicTaskStatus;
  progress: number;                    // 0-100
  stage: string;                       // 当前阶段描述
  // 输入
  request: AITopicDraftRequest;
  // 输出
  result?: AITopicDraftResult;
  errorMessage?: string;
  taskId?: string;                     // 后端 ai_topic_generation_tasks.id
  // 入库状态
  savedAsDraft: boolean;               // 是否已创建为专题草稿
  savedTopicId?: string;               // 创建后的 homepage_topics.id
  // 时间
  createdAt: Date;
  completedAt?: Date;
}

// ============================================================
// 预设选项
// ============================================================

export const SCENE_OPTIONS = [
  '冬季保暖',
  '厨房做饭',
  '家里来人待客',
  '节庆送礼',
  '宿舍小空间',
  '家庭聚餐',
  '日常收纳',
  '婚礼季',
  '开学季',
  '夏季消暑',
] as const;

export const AUDIENCE_OPTIONS = [
  '年轻妈妈',
  '新婚夫妇',
  '大学生',
  '家庭主妇',
  '上班族',
  '老人',
  '送礼人群',
  '租房青年',
] as const;

export const TONE_CONSTRAINT_OPTIONS = [
  '太官方',
  '太像广告',
  '过度夸张',
  '生硬硬翻',
  '空泛套话',
  '过于文艺',
] as const;

export type SceneOption = (typeof SCENE_OPTIONS)[number];
export type AudienceOption = (typeof AUDIENCE_OPTIONS)[number];
export type ToneConstraintOption = (typeof TONE_CONSTRAINT_OPTIONS)[number];
