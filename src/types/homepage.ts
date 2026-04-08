/**
 * DODO 首页场景化改造 · 后台类型定义
 *
 * 本文件定义首页改造涉及的所有新表类型、RPC 参数/返回类型。
 * 与 database.types.ts 自动生成文件分离维护。
 *
 * 命名规范:
 * - 数据库行类型: Db{TableName}Row
 * - 插入类型: Db{TableName}Insert
 * - 更新类型: Db{TableName}Update
 * - 后台业务模型: {Name} (不带 Db 前缀)
 */

// ============================================================================
// 通用类型
// ============================================================================

/** 三语 i18n 对象 */
export interface I18nText {
  zh?: string;
  ru?: string;
  tg?: string;
}

/** 支持的语言 */
export type SupportedLang = 'zh' | 'ru' | 'tg';

/** 翻译审核状态 */
export interface TranslationStatus {
  zh?: 'approved' | 'ai_draft' | 'pending';
  ru?: 'approved' | 'ai_draft' | 'pending';
  tg?: 'approved' | 'ai_draft' | 'pending';
}

/** 正文块类型 */
export interface StoryBlock {
  block_key: string;
  block_type: 'heading' | 'paragraph' | 'image' | 'product_grid' | 'callout';
  zh?: string;
  ru?: string;
  tg?: string;
  image_url?: string;
  product_ids?: string[];
}

// ============================================================================
// 1. homepage_categories 一级分类
// ============================================================================

export interface DbHomepageCategoryRow {
  id: string;
  code: string;
  name_i18n: I18nText;
  icon_key: string;
  color_token: string;
  sort_order: number;
  is_active: boolean;
  is_fixed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbHomepageCategoryInsert {
  id?: string;
  code: string;
  name_i18n: I18nText;
  icon_key?: string;
  color_token?: string;
  sort_order?: number;
  is_active?: boolean;
  is_fixed?: boolean;
}

export interface DbHomepageCategoryUpdate {
  code?: string;
  name_i18n?: I18nText;
  icon_key?: string;
  color_token?: string;
  sort_order?: number;
  is_active?: boolean;
  is_fixed?: boolean;
}

// ============================================================================
// 2. homepage_tags 标签
// ============================================================================

export type TagGroup = 'scene' | 'audience' | 'festival' | 'style' | 'function' | 'local';

export interface DbHomepageTagRow {
  id: string;
  tag_group: TagGroup;
  code: string;
  name_i18n: I18nText;
  description_i18n: I18nText | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbHomepageTagInsert {
  id?: string;
  tag_group: TagGroup;
  code: string;
  name_i18n: I18nText;
  description_i18n?: I18nText | null;
  is_active?: boolean;
  created_by?: string | null;
}

export interface DbHomepageTagUpdate {
  tag_group?: TagGroup;
  code?: string;
  name_i18n?: I18nText;
  description_i18n?: I18nText | null;
  is_active?: boolean;
}

// ============================================================================
// 3. product_categories 商品-分类关系
// ============================================================================

export interface DbProductCategoryRow {
  id: string;
  product_id: string;
  category_id: string;
  created_at: string;
}

// ============================================================================
// 4. product_tags 商品-标签关系
// ============================================================================

export interface DbProductTagRow {
  id: string;
  product_id: string;
  tag_id: string;
  created_at: string;
}

// ============================================================================
// 5. homepage_topics 专题
// ============================================================================

export type TopicStatus = 'draft' | 'ready' | 'published' | 'offline';
export type TopicSourceType = 'manual' | 'ai_draft' | 'hybrid';

export interface DbHomepageTopicRow {
  id: string;
  topic_type: string;
  status: TopicStatus;
  slug: string;
  title_i18n: I18nText;
  subtitle_i18n: I18nText | null;
  intro_i18n: I18nText | null;
  story_blocks_i18n: StoryBlock[];
  cover_image_default: string | null;
  cover_image_zh: string | null;
  cover_image_ru: string | null;
  cover_image_tg: string | null;
  theme_color: string | null;
  card_style: string | null;
  local_context_notes: string | null;
  source_type: TopicSourceType;
  translation_status: TranslationStatus | null;
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbHomepageTopicInsert {
  id?: string;
  topic_type?: string;
  status?: TopicStatus;
  slug: string;
  title_i18n: I18nText;
  subtitle_i18n?: I18nText | null;
  intro_i18n?: I18nText | null;
  story_blocks_i18n?: StoryBlock[];
  cover_image_default?: string | null;
  cover_image_zh?: string | null;
  cover_image_ru?: string | null;
  cover_image_tg?: string | null;
  theme_color?: string | null;
  card_style?: string | null;
  local_context_notes?: string | null;
  source_type?: TopicSourceType;
  translation_status?: TranslationStatus | null;
  start_time?: string | null;
  end_time?: string | null;
  is_active?: boolean;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface DbHomepageTopicUpdate {
  topic_type?: string;
  status?: TopicStatus;
  slug?: string;
  title_i18n?: I18nText;
  subtitle_i18n?: I18nText | null;
  intro_i18n?: I18nText | null;
  story_blocks_i18n?: StoryBlock[];
  cover_image_default?: string | null;
  cover_image_zh?: string | null;
  cover_image_ru?: string | null;
  cover_image_tg?: string | null;
  theme_color?: string | null;
  card_style?: string | null;
  local_context_notes?: string | null;
  source_type?: TopicSourceType;
  translation_status?: TranslationStatus | null;
  start_time?: string | null;
  end_time?: string | null;
  is_active?: boolean;
  updated_by?: string | null;
}

// ============================================================================
// 6. topic_products 专题-商品关系
// ============================================================================

export interface DbTopicProductRow {
  id: string;
  topic_id: string;
  product_id: string;
  sort_order: number;
  note_i18n: I18nText | null;
  badge_text_i18n: I18nText | null;
  created_at: string;
  updated_at: string;
}

export interface DbTopicProductInsert {
  topic_id: string;
  product_id: string;
  sort_order?: number;
  note_i18n?: I18nText | null;
  badge_text_i18n?: I18nText | null;
}

// ============================================================================
// 7. topic_placements 专题投放
// ============================================================================

export interface DbTopicPlacementRow {
  id: string;
  topic_id: string;
  placement_name: string;
  card_variant_name: string | null;
  title_i18n: I18nText | null;
  subtitle_i18n: I18nText | null;
  cover_image_default: string | null;
  cover_image_zh: string | null;
  cover_image_ru: string | null;
  cover_image_tg: string | null;
  feed_position: number;
  sort_order: number;
  is_active: boolean;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbTopicPlacementInsert {
  topic_id: string;
  placement_name?: string;
  card_variant_name?: string | null;
  title_i18n?: I18nText | null;
  subtitle_i18n?: I18nText | null;
  cover_image_default?: string | null;
  cover_image_zh?: string | null;
  cover_image_ru?: string | null;
  cover_image_tg?: string | null;
  feed_position?: number;
  sort_order?: number;
  is_active?: boolean;
  start_time?: string | null;
  end_time?: string | null;
}

export interface DbTopicPlacementUpdate {
  placement_name?: string;
  card_variant_name?: string | null;
  title_i18n?: I18nText | null;
  subtitle_i18n?: I18nText | null;
  cover_image_default?: string | null;
  cover_image_zh?: string | null;
  cover_image_ru?: string | null;
  cover_image_tg?: string | null;
  feed_position?: number;
  sort_order?: number;
  is_active?: boolean;
  start_time?: string | null;
  end_time?: string | null;
}

// ============================================================================
// 8. user_behavior_events 用户行为事件
// ============================================================================

export type BehaviorEventName =
  | 'home_view'
  | 'banner_click'
  | 'category_click'
  | 'topic_card_expose'
  | 'topic_card_click'
  | 'product_card_expose'
  | 'product_card_click'
  | 'topic_detail_view'
  | 'topic_product_click'
  | 'product_detail_view'
  | 'order_create'
  | 'order_pay_success'
  | 'order_complete';

export type BehaviorEntityType =
  | 'home'
  | 'banner'
  | 'category'
  | 'topic'
  | 'product'
  | 'order';

export interface DbUserBehaviorEventRow {
  id: string;
  user_id: string | null;
  session_id: string;
  event_name: BehaviorEventName;
  page_name: string;
  entity_type: BehaviorEntityType | null;
  entity_id: string | null;
  position: string | null;
  source_page: string | null;
  source_topic_id: string | null;
  source_placement_id: string | null;
  source_category_id: string | null;
  lottery_id: string | null;
  inventory_product_id: string | null;
  order_id: string | null;
  trace_id: string | null;
  metadata: Record<string, unknown>;
  device_info: Record<string, unknown> | null;
  created_at: string;
}

// ============================================================================
// 9. ai_topic_generation_tasks AI 专题生成任务
// ============================================================================

export type AiTaskStatus = 'queued' | 'processing' | 'done' | 'partial' | 'error';

export interface DbAiTopicGenerationTaskRow {
  id: string;
  status: AiTaskStatus;
  topic_id: string | null;
  request_payload: Record<string, unknown>;
  result_payload: Record<string, unknown> | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// ============================================================================
// 10. localization_lexicon 本地化词库
// ============================================================================

export type LexiconGroup =
  | 'food'
  | 'festival'
  | 'family'
  | 'gifting'
  | 'home_scene'
  | 'tone'
  | 'taboo';

export interface DbLocalizationLexiconRow {
  id: string;
  lexicon_group: LexiconGroup;
  code: string;
  title_i18n: I18nText;
  content_i18n: I18nText;
  example_i18n: I18nText | null;
  example_good: string | null;
  example_bad: string | null;
  local_anchors: string[] | null;
  tone_notes: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbLocalizationLexiconInsert {
  lexicon_group: LexiconGroup;
  code: string;
  title_i18n: I18nText;
  content_i18n: I18nText;
  example_i18n?: I18nText | null;
  example_good?: string | null;
  example_bad?: string | null;
  local_anchors?: string[] | null;
  tone_notes?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

// ============================================================================
// RPC 参数与返回类型
// ============================================================================

/** rpc_admin_save_product_taxonomy 参数 */
export interface SaveProductTaxonomyParams {
  p_session_token: string;
  p_product_id: string;
  p_category_ids: string[];
  p_tag_ids: string[];
}

/** rpc_admin_save_topic_products 参数 */
export interface SaveTopicProductsParams {
  p_session_token: string;
  p_topic_id: string;
  p_items: DbTopicProductInsert[];
}

/** rpc_admin_search_topic_products 参数 */
export interface SearchTopicProductsParams {
  p_session_token: string;
  p_keyword?: string;
  p_category_ids?: string[];
  p_tag_ids?: string[];
  p_has_active_lottery?: boolean;
  p_limit?: number;
  p_offset?: number;
}

/** rpc_admin_search_topic_products 返回结构 */
export interface AdminSearchProductsResponse {
  data: AdminSearchProductItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminSearchProductItem {
  id: string;
  name_i18n: I18nText;
  description_i18n: I18nText;
  image_url: string;
  image_urls: string[];
  original_price: number;
  status: string;
  sku: string;
  created_at: string;
  categories: { id: string; code: string; name_i18n: I18nText }[];
  tags: { id: string; code: string; tag_group: TagGroup; name_i18n: I18nText }[];
  active_lottery: {
    id: string;
    ticket_price: number;
    total_tickets: number;
    sold_tickets: number;
    status: string;
  } | null;
}

/** 标签引用数统计 */
export interface TagUsageCount {
  tag_id: string;
  code: string;
  tag_group: TagGroup;
  usage_count: number;
}

/** 分类商品数统计 */
export interface CategoryProductCount {
  category_id: string;
  code: string;
  product_count: number;
}
