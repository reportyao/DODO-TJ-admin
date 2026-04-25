/**
 * DODO-TJ 批量商品上架 — 独立处理服务 (Processor v3)
 *
 * 从数据库队列中拉取待处理的商品，调用阿里云百炼 DashScope API
 * 进行 AI 商品理解（两阶段流水线），然后将商品写入 inventory_products。
 *
 * 与项目规范完全对齐：
 *   - AI 理解结构 100% 兼容 LocalizedAIUnderstanding（6 字段 × 3 语言 + semantic_facts + 元数据）
 *   - 两阶段流水线：Stage1 semantic_facts（视觉/文本）→ Stage2 三语文案（文本）
 *   - Prompt、模型降级链、数据清洗函数均从 ai-understanding-generate Edge Function 1:1 复制
 *   - 入库数据结构与 AIListingPage.saveTaskToInventory 完全一致
 *   - 审计日志字段与 admin_audit_logs 表结构完全匹配
 *
 * v3 修复清单：
 *   [C1] admin_audit_logs 字段名修正（target_table/target_type/target_id/source/status）
 *   [C2] extractProductInfo 不再用 recommended_badge 作商品名
 *   [M1] 孤儿恢复增加 processing_started_at 时间条件（防止多实例互踩）
 *   [M3] retry_count 使用查询时的值 +1（乐观锁保证单进程处理，无并发风险）
 *   [M4] ecosystem.config.cjs 移除过时的 --experimental-modules
 *   [m1] 日志增加 itemId 前缀便于排查
 *   [m5] 增加 HTTP 健康检查端点
 *   [m6] Supabase 连接中断时的指数退避重连
 *
 * 部署方式：
 *   PM2:  pm2 start ecosystem.config.cjs
 *   手动: node processor.mjs
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'http';

// ============================================================
// 配置
// ============================================================
const CONFIG = {
  supabaseUrl:        process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  dashscopeApiKey:    process.env.DASHSCOPE_API_KEY,
  concurrency:        parseInt(process.env.CONCURRENCY || '3', 10),
  pollIntervalMs:     parseInt(process.env.POLL_INTERVAL_MS || '10000', 10),
  maxRetryCount:      parseInt(process.env.MAX_RETRY_COUNT || '3', 10),
  aiRequestTimeoutMs: parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '60000', 10),
  defaultPrice:       parseFloat(process.env.DEFAULT_PRICE || '39.90'),
  defaultStock:       parseInt(process.env.DEFAULT_STOCK || '100', 10),
  defaultCurrency:    process.env.DEFAULT_CURRENCY || 'TJS',
  healthPort:         parseInt(process.env.HEALTH_PORT || '9090', 10),
  // 孤儿任务超时阈值：超过此时间的 processing 状态任务视为孤儿（默认 10 分钟）
  orphanTimeoutMs:    parseInt(process.env.ORPHAN_TIMEOUT_MS || '600000', 10),
};

// 模型降级链 — 与 ai-understanding-generate Edge Function 完全一致
const VISION_MODELS = ['qwen3-vl-plus', 'qwen-vl-max'];
const TEXT_MODELS   = ['qwen-plus', 'qwen3.5-plus', 'qwen-max'];

// 规范的 AI 理解字段列表
const AI_UNDERSTANDING_FIELDS = [
  'target_people',
  'selling_angle',
  'how_to_use',
  'best_scene',
  'local_life_connection',
  'recommended_badge',
];

// ============================================================
// 初始化
// ============================================================
const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseServiceKey);

let activeCount = 0;
let isShuttingDown = false;
let totalProcessed = 0;
let totalSuccess = 0;
let totalError = 0;
let lastPollTime = null;
let consecutivePollErrors = 0;

// ============================================================
// 日志工具
// ============================================================
function log(level, msg, data = null) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (data !== null && data !== undefined) {
    console.log(`${prefix} ${msg}`, typeof data === 'string' ? data : JSON.stringify(data));
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

// ============================================================
// JSON 解析（容错处理）— 与 Edge Function parseAIJson 完全一致
// ============================================================
function parseAIJson(text) {
  let cleaned = text.trim();

  // 移除 markdown 代码块标记
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // 防御性处理 thinking 模式残留的 <think>...</think>
  const thinkEnd = cleaned.indexOf('</think>');
  if (thinkEnd !== -1) {
    cleaned = cleaned.slice(thinkEnd + 8).trim();
  }

  // 兼容模型偶尔在 JSON 前后追加散文
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

// ============================================================
// DashScope API 调用（带模型降级和超时）
// ============================================================

function isQuotaOrModelError(errMsg) {
  const lower = (errMsg || '').toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('404') ||
    lower.includes('403') ||
    lower.includes('quota') ||
    lower.includes('rate_limit') ||
    lower.includes('rate limit') ||
    lower.includes('insufficient') ||
    lower.includes('does not exist') ||
    lower.includes('model_not_found') ||
    lower.includes('access denied') ||
    lower.includes('billing')
  );
}

/**
 * [FIX-C1] 检测是否为图片下载失败错误
 * 阿里云百炼视觉模型从中国大陆访问 Supabase CDN 可能失败，
 * 返回 400: "Failed to download multimodal content"
 */
function isImageDownloadError(errMsg) {
  const lower = (errMsg || '').toLowerCase();
  return (
    lower.includes('failed to download') ||
    lower.includes('download multimodal') ||
    (lower.includes('invalid_parameter') && lower.includes('400'))
  );
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`DashScope 调用超时 (${Math.round(timeoutMs / 1000)}s)`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 带模型降级的 DashScope 调用 — 与 ai-understanding-generate 完全一致
 *
 * 每个模型一次性尝试。命中配额/模型错误 → 降级到下一个。
 * 非配额错误（超时/网络）也尝试下一个模型（与 Edge Function 行为一致）。
 */
async function callDashScopeWithFallback({ models, messages, temperature = 0.3, enableThinking = false, maxTokens, stepName = 'unknown' }) {
  let lastError = null;

  for (const model of models) {
    try {
      log('debug', `[${stepName}] 尝试模型: ${model}`);

      const body = {
        model,
        messages,
        temperature,
        enable_thinking: enableThinking,
      };
      if (maxTokens) body.max_tokens = maxTokens;

      const response = await fetchWithTimeout(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CONFIG.dashscopeApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        CONFIG.aiRequestTimeoutMs,
      );

      if (!response.ok) {
        const errText = await response.text();
        const errMsg = `${model} HTTP ${response.status}: ${errText.slice(0, 500)}`;
        if (isQuotaOrModelError(`${response.status} ${errText}`)) {
          log('warn', `[${stepName}] 模型 ${model} 配额/不可用，降级`, errMsg);
          lastError = new Error(errMsg);
          continue;
        }
        // [FIX-C6] 图片下载失败等 400 错误也应降级到下一个模型
        if (isImageDownloadError(`${response.status} ${errText}`)) {
          log('warn', `[${stepName}] 模型 ${model} 图片下载失败，降级`, errMsg);
          lastError = new Error(errMsg);
          continue;
        }
        throw new Error(errMsg);
      }

      const result = await response.json();
      const rawContent = result.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new Error(`${model} 返回内容为空: ${JSON.stringify(result).slice(0, 300)}`);
      }

      log('info', `[${stepName}] 模型 ${model} 成功`);
      return { payload: parseAIJson(rawContent), modelUsed: model };
    } catch (error) {
      lastError = error;
      const msg = error.message || String(error);
      // 非配额错误也尝试下一个模型（与 Edge Function 行为一致）
      log('warn', `[${stepName}] 模型 ${model} 失败，尝试下一个: ${msg.slice(0, 200)}`);
    }
  }

  throw lastError || new Error(`所有模型均失败 (${stepName})`);
}

// ============================================================
// 数据清洗函数 — 与 ai-understanding-generate 完全一致
// ============================================================

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanStringList(value, limit = 6) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean).slice(0, limit);
}

function normalizeSemanticFacts(payload) {
  const raw =
    payload?.semantic_facts && typeof payload.semantic_facts === 'object'
      ? payload.semantic_facts
      : payload || {};

  return {
    product_type:           cleanText(raw.product_type),
    core_function:          cleanText(raw.core_function),
    target_user_traits:     cleanStringList(raw.target_user_traits),
    primary_pain_points:    cleanStringList(raw.primary_pain_points),
    usage_steps:            cleanStringList(raw.usage_steps),
    usage_tips:             cleanStringList(raw.usage_tips),
    usage_scenarios:        cleanStringList(raw.usage_scenarios),
    parameter_highlights:   cleanStringList(raw.parameter_highlights),
    local_context_signals:  cleanStringList(raw.local_context_signals),
    trust_signals:          cleanStringList(raw.trust_signals),
    badge_candidates:       cleanStringList(raw.badge_candidates, 4),
  };
}

function normalizeSingleLanguageUnderstanding(payload) {
  const normalized = {};
  for (const field of AI_UNDERSTANDING_FIELDS) {
    normalized[field] = cleanText(payload?.[field]);
  }
  // [FIX-C5] 保留 product_name 字段（不在 AI_UNDERSTANDING_FIELDS 中，但用于 name_i18n）
  if (payload?.product_name) {
    normalized.product_name = cleanText(payload.product_name);
  }
  return normalized;
}

function buildLocalizedUnderstanding({ tg, ru, zh, semanticFacts, generated_by, model_used }) {
  const localized = {};
  for (const field of AI_UNDERSTANDING_FIELDS) {
    localized[field] = {
      tg: cleanText(tg[field]),
      ru: cleanText(ru[field]),
      zh: cleanText(zh[field]),
    };
  }
  return {
    ...localized,
    semantic_facts: semanticFacts,
    generated_at: new Date().toISOString(),
    generated_by,
    model_used,
    generation_mode: 'semantic_facts_to_unified_tg_ru_zh',
    primary_market_language: 'tg',
    display_priority: ['tg', 'ru', 'zh'],
    source_language: 'multi',
  };
}

// ============================================================
// Stage 1: 生成语言无关的结构化商品事实 (semantic_facts)
// Prompt 与 ai-understanding-generate 完全一致
// ============================================================

function buildSemanticFactsPrompt({ name, desc, specs, material, price }) {
  return `你是一名面向塔吉克斯坦电商业务的商品理解专家。请抽取一份"语言无关、可复用、可审计"的结构化商品事实，为后续生成塔吉克语和俄语用户文案提供统一依据。

【商品信息】
- 名称：${name}
- 描述：${desc || '未提供'}
- 规格：${specs || '未提供'}
- 材质：${material || '未提供'}
- 价格：${price} сомони

请只输出以下 JSON：
{
  "semantic_facts": {
    "product_type": "一句话明确商品类型",
    "core_function": "一句话说明商品最核心的用途",
    "target_user_traits": ["适合的人群特征1", "适合的人群特征2"],
    "primary_pain_points": ["它解决的问题1", "它解决的问题2"],
    "usage_steps": ["使用动作或步骤1", "使用动作或步骤2"],
    "usage_tips": ["使用提醒或小技巧1", "使用提醒或小技巧2"],
    "usage_scenarios": ["典型使用场景1", "典型使用场景2"],
    "parameter_highlights": ["用户需要知道的参数或规格亮点1", "亮点2"],
    "local_context_signals": ["与塔吉克本地生活相关的连接点1", "连接点2"],
    "trust_signals": ["能增强购买信心的事实1", "事实2"],
    "badge_candidates": ["候选角标1", "候选角标2", "候选角标3"]
  }
}

要求：
1. 只输出 JSON，不要附加任何说明。
2. 这是事实层，不要写营销文案，不要写多语言。
3. usage_steps、usage_tips、parameter_highlights 必须尽量具体。
4. local_context_signals 必须贴近塔吉克斯坦真实生活。
5. 信息不足时基于图片做谨慎推断，避免明显夸大。`;
}

async function generateSemanticFacts({ imageUrls, name, desc, specs, material, price }) {
  const prompt = buildSemanticFactsPrompt({ name, desc, specs, material, price });

  if (imageUrls && imageUrls.length > 0) {
    // 只用首图（与规范一致：多图收益边际递减，但耗时线性增长）
    const content = [
      { type: 'image_url', image_url: { url: imageUrls[0] } },
      { type: 'text', text: prompt },
    ];

    try {
      const { payload, modelUsed } = await callDashScopeWithFallback({
        models: VISION_MODELS,
        messages: [{ role: 'user', content }],
        temperature: 0.3,
        enableThinking: false,
        maxTokens: 2000,
        stepName: 'Stage1_Vision',
      });
      return { semanticFacts: normalizeSemanticFacts(payload), modelUsed };
    } catch (visionError) {
      // [FIX-C2] 视觉模型全部失败时（常见于图片URL无法被阿里云下载），
      // 自动降级到纯文本模型，而不是直接报错
      if (isImageDownloadError(visionError.message)) {
        log('warn', `[Stage1_Vision] 图片下载失败，降级到文本模型: ${visionError.message.slice(0, 150)}`);
      } else {
        log('warn', `[Stage1_Vision] 视觉模型全部失败，降级到文本模型: ${visionError.message.slice(0, 150)}`);
      }
    }
  }

  // 无图片或视觉模型失败时，使用文本模型
  const { payload, modelUsed } = await callDashScopeWithFallback({
    models: TEXT_MODELS,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    enableThinking: false,
    maxTokens: 1500,
    stepName: 'Stage1_Text',
  });
  return { semanticFacts: normalizeSemanticFacts(payload), modelUsed };
}

// ============================================================
// Stage 2: 一次性生成 tg/ru/zh 三语 localized understanding
// Prompt 与 ai-understanding-generate 完全一致
// ============================================================

async function generateUnifiedLocalizedUnderstanding({ semanticFacts, name, desc, specs, material, price }) {
  const prompt = `你是一名服务于塔吉克斯坦电商平台的本地化商品文案专家。请基于结构化商品事实，一次性输出塔吉克语、俄语和中文三套商品理解文案。

【商品信息】
- 名称：${name}
- 描述：${desc || '未提供'}
- 规格：${specs || '未提供'}
- 材质：${material || '未提供'}
- 价格：${price} сомони

【结构化商品事实】
${JSON.stringify(semanticFacts, null, 2)}

请只输出以下 JSON：
{
  "tg": {"product_name":"","target_people":"","selling_angle":"","how_to_use":"","best_scene":"","local_life_connection":"","recommended_badge":""},
  "ru": {"product_name":"","target_people":"","selling_angle":"","how_to_use":"","best_scene":"","local_life_connection":"","recommended_badge":""},
  "zh": {"product_name":"","target_people":"","selling_angle":"","how_to_use":"","best_scene":"","local_life_connection":"","recommended_badge":""}
}

要求：
1. product_name 是商品名称的本地化翻译（tg用塔吉克语、ru用俄语、zh用中文），简洁准确地描述商品，不超过30字。
2. tg 必须自然地道，面向塔吉克普通消费者，不要夹杂中文，避免俄语硬翻译腔。
3. ru 必须自然可信，适合塔吉克斯坦电商用户阅读。
4. zh 仅用于后台辅助理解。
5. how_to_use 至少自然包含一种使用步骤、参数亮点或场景细节。
6. best_scene 必须是具体画面，不要抽象概括。
7. recommended_badge 短而顺口，适合做角标。
8. 只输出 JSON，不要附加说明。
9. 控制每个字段长度，单字段不超过 120 字（product_name 不超过 30 字）。`;

  const { payload, modelUsed } = await callDashScopeWithFallback({
    models: TEXT_MODELS,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.35,
    enableThinking: false,
    maxTokens: 3500,
    stepName: 'Stage2_Localized',
  });

  return {
    localized: {
      tg: normalizeSingleLanguageUnderstanding(payload?.tg),
      ru: normalizeSingleLanguageUnderstanding(payload?.ru),
      zh: normalizeSingleLanguageUnderstanding(payload?.zh),
    },
    modelUsed,
  };
}

// ============================================================
// [C2] 从 AI 结果中提取三语商品信息（用于 name_i18n / description_i18n）
// ============================================================
function extractI18nProductInfo(semanticFacts, localized) {
  // [FIX-C4] 商品名：优先使用 AI 生成的本地化 product_name，降级到 product_type
  const productType = semanticFacts.product_type || '未命名商品';

  return {
    // 名称：优先使用 Stage 2 生成的本地化商品名，降级到中文 product_type
    name_zh: localized.zh.product_name || productType,
    name_ru: localized.ru.product_name || productType,
    name_tg: localized.tg.product_name || productType,
    // 描述：使用 selling_angle（卖点）
    desc_zh: localized.zh.selling_angle || '',
    desc_ru: localized.ru.selling_angle || '',
    desc_tg: localized.tg.selling_angle || '',
    // 详情：使用 how_to_use（使用方法）
    details_zh: localized.zh.how_to_use || '',
    details_ru: localized.ru.how_to_use || '',
    details_tg: localized.tg.how_to_use || '',
  };
}

// ============================================================
// 数据入库：写入 inventory_products + product_categories + lotteries 同步
// 数据结构与 AIListingPage.saveTaskToInventory 完全对齐
// ============================================================
async function saveToInventory(item, semanticFacts, localized, aiUnderstanding) {
  const info = extractI18nProductInfo(semanticFacts, localized);
  const price = Number(item.price) || CONFIG.defaultPrice;
  const stock = Number(item.stock) || CONFIG.defaultStock;

  // 商品名：优先使用用户手动指定的名称，其次使用 AI 识别的 product_type
  const productName = item.product_name || info.name_zh || '未命名商品';

  // 与 AIListingPage.saveTaskToInventory 的 productData 结构完全一致
  const productData = {
    name: productName,
    name_i18n: {
      zh: info.name_zh || productName,
      ru: info.name_ru || '',
      tg: info.name_tg || '',
    },
    description: info.desc_zh || '',
    description_i18n: {
      zh: info.desc_zh || '',
      ru: info.desc_ru || '',
      tg: info.desc_tg || '',
    },
    specifications: item.specs || '',
    specifications_i18n: {
      zh: item.specs || '',
      ru: item.specs || '',
      tg: item.specs || '',
    },
    material: '',
    material_i18n: { zh: '', ru: '', tg: '' },
    details: info.details_zh || '',
    details_i18n: {
      zh: info.details_zh || '',
      ru: info.details_ru || '',
      tg: info.details_tg || '',
    },
    image_url: (item.image_urls && item.image_urls[0]) || '',
    image_urls: item.image_urls || [],  // Supabase JS SDK 自动将 JS 数组转为 PostgreSQL TEXT[]
    original_price: price,
    currency: CONFIG.defaultCurrency,
    stock: stock,
    reserved_stock: 0,
    sku: null,
    barcode: null,
    status: 'ACTIVE',
    ai_understanding: aiUnderstanding,
  };

  // 插入 inventory_products
  const { data: inserted, error: insertError } = await supabase
    .from('inventory_products')
    .insert(productData)
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`入库 inventory_products 失败: ${insertError.message}`);
  }

  const productId = inserted.id;

  // 创建分类关联（与 AIListingPage 一致：失败不影响主流程）
  if (item.category_id) {
    try {
      const { error: catError } = await supabase
        .from('product_categories')
        .insert({
          product_id: productId,
          category_id: item.category_id,
        });
      if (catError) {
        log('warn', `[${item.id}] 分类关联创建失败: ${catError.message}`);
      }
    } catch (e) {
      log('warn', `[${item.id}] 分类关联异常: ${e.message}`);
    }
  }

  // 同步 lotteries 表的 ai_understanding（与 ai-understanding-generate 一致）
  try {
    await supabase
      .from('lotteries')
      .update({ ai_understanding: aiUnderstanding })
      .eq('inventory_product_id', productId);
  } catch (e) {
    log('warn', `[${item.id}] 同步 lotteries 失败（非致命）: ${e.message}`);
  }

  // [C1] 写入审计日志 — 字段名与 admin_audit_logs 表结构完全匹配
  try {
    await supabase.from('admin_audit_logs').insert({
      admin_id: null,                    // 批量脚本无 admin session，NULL 是允许的
      action: 'BATCH_CREATE_PRODUCT',    // 大写风格与项目中 AI_CREATE_PRODUCT 一致
      target_type: 'inventory_product',  // 与 AIListingPage 一致
      target_id: productId,
      target_table: 'inventory_products',
      new_data: productData,
      details: {
        source: 'batch-listing-processor',
        batch_item_id: item.id,
        batch_id: item.batch_id,
        product_name: productName,
        ai_model_used: aiUnderstanding.model_used,
      },
      source: 'edge_function',           // 使用项目定义的 source 枚举值
      status: 'success',
    });
  } catch (e) {
    log('warn', `[${item.id}] 审计日志写入失败（非致命）: ${e.message}`);
  }

  return productId;
}

// ============================================================
// 处理单个商品任务
// ============================================================
async function processItem(item) {
  const itemId = item.id;
  const startTime = Date.now();

  log('info', `[${itemId}] 开始处理`, {
    images: item.image_urls?.length || 0,
    name: item.product_name || '(待识别)',
    retry: item.retry_count || 0,
  });

  try {
    // 更新状态为 ai_analyzing
    await supabase
      .from('batch_upload_items')
      .update({
        status: 'ai_analyzing',
        processing_started_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', itemId);

    // Stage 1: 生成 semantic_facts
    log('info', `[${itemId}] Stage 1: 生成 semantic_facts...`);
    const { semanticFacts, modelUsed: visionModel } = await generateSemanticFacts({
      imageUrls: item.image_urls || [],
      name: item.product_name || '未知商品',
      desc: '',
      specs: item.specs || '',
      material: '',
      price: Number(item.price) || CONFIG.defaultPrice,
    });
    log('info', `[${itemId}] Stage 1 完成 (${visionModel}): ${semanticFacts.product_type}`);

    // 更新状态为 ai_generating
    await supabase
      .from('batch_upload_items')
      .update({ status: 'ai_generating' })
      .eq('id', itemId);

    // Stage 2: 生成三语 localized understanding
    log('info', `[${itemId}] Stage 2: 生成三语文案...`);
    const { localized, modelUsed: textModel } = await generateUnifiedLocalizedUnderstanding({
      semanticFacts,
      name: item.product_name || semanticFacts.product_type || '未知商品',
      desc: '',
      specs: item.specs || '',
      material: '',
      price: Number(item.price) || CONFIG.defaultPrice,
    });
    log('info', `[${itemId}] Stage 2 完成 (${textModel})`);

    // 构建规范的 LocalizedAIUnderstanding 结构
    const aiUnderstanding = buildLocalizedUnderstanding({
      tg: localized.tg,
      ru: localized.ru,
      zh: localized.zh,
      semanticFacts,
      generated_by: 'batch-listing-processor(v3)',
      model_used: `${visionModel} -> ${textModel}`,
    });

    // 更新状态为 saving
    await supabase
      .from('batch_upload_items')
      .update({ status: 'saving' })
      .eq('id', itemId);

    // 数据入库
    log('info', `[${itemId}] 正在写入 inventory_products...`);
    const productId = await saveToInventory(item, semanticFacts, localized, aiUnderstanding);

    const duration = Date.now() - startTime;
    log('info', `[${itemId}] 入库成功: product_id=${productId} (${duration}ms)`);

    // 更新为成功
    await supabase
      .from('batch_upload_items')
      .update({
        status: 'success',
        inventory_product_id: productId,
        // 回填 AI 识别的商品名（如果原来没有指定）
        product_name: item.product_name || semanticFacts.product_type || '未命名商品',
        ai_result: {
          semantic_facts: semanticFacts,
          localized,
          models_used: { vision: visionModel, text: textModel },
        },
        ai_understanding: aiUnderstanding,
        processing_completed_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    totalSuccess++;
    return { success: true, productId };
  } catch (error) {
    const errMsg = (error.message || String(error)).slice(0, 2000);
    const duration = Date.now() - startTime;
    log('error', `[${itemId}] 处理失败 (${duration}ms): ${errMsg}`);
    // 计算退避时间
    // retry_count=0 → 30s, 1 → 120s, 2 → 480s, 上限 30 分钟
    const currentRetry = (item.retry_count || 0) + 1;
    const backoffMs = Math.min(30000 * Math.pow(4, item.retry_count || 0), 1800000);
    const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
    const isFinalFailure = currentRetry >= CONFIG.maxRetryCount;
    // 更新错误状态——需要 try-catch 保护，因为此时可能是网络断开导致的错误
    try {
      await supabase
        .from('batch_upload_items')
        .update({
          status: 'error',
          error_message: errMsg,
          retry_count: currentRetry,
          next_retry_at: isFinalFailure ? null : nextRetryAt,
          processing_completed_at: new Date().toISOString(),
        })
        .eq('id', itemId);
    } catch (updateErr) {
      log('error', `[${itemId}] 更新错误状态也失败（任务将成为孤儿，等待恢复）: ${updateErr.message}`);
    }

    // 最终失败时写入审计日志
    if (isFinalFailure) {
      try {
        await supabase.from('admin_audit_logs').insert({
          admin_id: null,
          action: 'BATCH_CREATE_PRODUCT_FAILED',
          target_type: 'batch_upload_item',
          target_id: itemId,
          target_table: 'batch_upload_items',
          details: {
            source: 'batch-listing-processor',
            batch_id: item.batch_id,
            product_name: item.product_name,
            retry_count: currentRetry,
          },
          source: 'edge_function',
          status: 'failed',
          error_message: errMsg.slice(0, 500),
          duration_ms: duration,
        });
      } catch (e) {
        // 审计日志失败不影响主流程
      }
    }

    totalError++;
    return { success: false, error: errMsg };
  } finally {
    totalProcessed++;
  }
}

// ============================================================
// 原子化任务拉取与锁定
// ============================================================

/**
 * 拉取并锁定待处理的任务。
 *
 * 1. 查询 queued 状态的任务（按创建时间排序）
 * 2. 查询 error 状态且退避时间已过的任务（按 next_retry_at 排序）
 * 3. 逐个尝试原子锁定（UPDATE WHERE status IN ('queued','error')）
 *    如果锁定失败说明已被其他进程抢占，静默跳过
 */
async function claimNextItems(limit) {
  const now = new Date().toISOString();
  const selectFields = 'id, batch_id, image_urls, category_id, product_name, price, stock, specs, retry_count';

  // 查询 queued 任务
  const { data: queuedItems, error: queuedError } = await supabase
    .from('batch_upload_items')
    .select(selectFields)
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (queuedError) {
    throw new Error(`查询 queued 任务失败: ${queuedError.message}`);
  }

  // 查询可重试的 error 任务
  const remainingSlots = limit - (queuedItems?.length || 0);
  let retryItems = [];
  if (remainingSlots > 0) {
    const { data, error } = await supabase
      .from('batch_upload_items')
      .select(selectFields)
      .eq('status', 'error')
      .lt('retry_count', CONFIG.maxRetryCount)
      .lte('next_retry_at', now)
      .order('next_retry_at', { ascending: true })
      .limit(remainingSlots);

    if (!error && data) {
      retryItems = data;
    }
  }

  const allCandidates = [...(queuedItems || []), ...retryItems];
  if (allCandidates.length === 0) return [];

  // 逐个尝试原子锁定
  const claimed = [];
  for (const item of allCandidates) {
    if (claimed.length >= limit) break;

    const { data: locked, error: lockError } = await supabase
      .from('batch_upload_items')
      .update({ status: 'processing' })
      .eq('id', item.id)
      .in('status', ['queued', 'error'])
      .select('id')
      .single();

    if (!lockError && locked) {
      claimed.push(item);
    }
    // 锁定失败 = 已被其他进程抢占，静默跳过
  }

  return claimed;
}

// ============================================================
// 主循环：轮询并处理任务
// ============================================================
async function pollAndProcess() {
  if (isShuttingDown) return;

  const availableSlots = CONFIG.concurrency - activeCount;
  if (availableSlots <= 0) return;

  try {
    const items = await claimNextItems(availableSlots);
    consecutivePollErrors = 0; // 重置连续错误计数
    lastPollTime = new Date().toISOString();

    if (items.length === 0) return;

    log('info', `拾取 ${items.length} 个任务，开始处理...`);

    // 并发处理（fire-and-forget，通过 activeCount 控制并发上限）
    for (const item of items) {
      activeCount++;
      processItem(item).finally(() => {
        activeCount--;
      });
    }
  } catch (error) {
    consecutivePollErrors++;
    log('error', `轮询异常 (连续第 ${consecutivePollErrors} 次): ${error.message}`);

    // [m6] 连续错误时指数退避，避免疯狂重试
    if (consecutivePollErrors >= 3) {
      const backoffMs = Math.min(5000 * Math.pow(2, consecutivePollErrors - 3), 300000); // 最大 5 分钟
      log('warn', `连续 ${consecutivePollErrors} 次轮询失败，等待 ${Math.round(backoffMs / 1000)}s 后重试`);
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
}

// ============================================================
// [m5] HTTP 健康检查端点
// ============================================================
function startHealthServer() {
  const server = createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      const status = {
        service: 'dodo-batch-listing-processor',
        version: 'v3',
        status: isShuttingDown ? 'shutting_down' : 'running',
        uptime: process.uptime(),
        active_tasks: activeCount,
        stats: {
          total_processed: totalProcessed,
          total_success: totalSuccess,
          total_error: totalError,
        },
        last_poll: lastPollTime,
        consecutive_poll_errors: consecutivePollErrors,
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(CONFIG.healthPort, '0.0.0.0', () => {
    log('info', `健康检查端点: http://0.0.0.0:${CONFIG.healthPort}/health`);
  });

  server.on('error', (err) => {
    // 端口被占用时不影响主服务
    log('warn', `健康检查端口 ${CONFIG.healthPort} 启动失败: ${err.message}`);
  });

  return server;
}

// ============================================================
// [M1] 孤儿任务恢复（带时间条件，防止多实例互踩）
// ============================================================
async function recoverOrphanTasks() {
  const orphanThreshold = new Date(Date.now() - CONFIG.orphanTimeoutMs).toISOString();

  try {
    // 只恢复 processing_started_at 超过阈值的任务
    // 这样不会影响其他正在运行的 processor 实例
    // [FIX-M1] 恢复孤儿任务时同时重置 processing_started_at，
    // 防止下次孤儿检测时因旧时间戳导致误判
    const { data: orphans, error } = await supabase
      .from('batch_upload_items')
      .update({
        status: 'queued',
        error_message: '处理超时，任务重新排队',
        processing_started_at: null,
      })
      .in('status', ['processing', 'ai_analyzing', 'ai_generating', 'saving'])
      .lt('processing_started_at', orphanThreshold)
      .select('id');

    if (error) {
      log('warn', `孤儿任务查询失败: ${error.message}`);
      return;
    }

    if (orphans && orphans.length > 0) {
      log('info', `恢复了 ${orphans.length} 个孤儿任务（处理超时 > ${CONFIG.orphanTimeoutMs / 1000}s）`);
    }
  } catch (e) {
    log('warn', `孤儿任务恢复异常: ${e.message}`);
  }
}

// ============================================================
// 启动与优雅关闭
// ============================================================
async function start() {
  log('info', '========================================');
  log('info', 'DODO-TJ 批量商品上架处理服务 v3.1（审查修复版）');
  log('info', `Supabase: ${CONFIG.supabaseUrl}`);
  log('info', `DashScope API Key: ${CONFIG.dashscopeApiKey ? '已配置' : '未配置'}`);
  log('info', `并发数: ${CONFIG.concurrency}`);
  log('info', `轮询间隔: ${CONFIG.pollIntervalMs}ms`);
  log('info', `最大重试: ${CONFIG.maxRetryCount}`);
  log('info', `AI 超时: ${CONFIG.aiRequestTimeoutMs}ms`);
  log('info', `孤儿超时: ${CONFIG.orphanTimeoutMs / 1000}s`);
  log('info', '========================================');

  // 前置检查
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseServiceKey) {
    log('error', '请在 .env 中配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  if (!CONFIG.dashscopeApiKey) {
    log('error', '请在 .env 中配置 DASHSCOPE_API_KEY（阿里云百炼 API Key）');
    process.exit(1);
  }

  // 检查数据库连接和表是否存在
  try {
    const { error } = await supabase
      .from('batch_upload_tasks')
      .select('id')
      .limit(1);

    if (error) {
      if (error.message.includes('does not exist') || error.code === '42P01') {
        log('error', '数据库表不存在！请先在 Supabase Dashboard SQL Editor 中执行：');
        log('error', '  001_batch_upload_tables.sql');
        process.exit(1);
      }
      throw error;
    }
    log('info', '数据库连接正常');
  } catch (err) {
    log('error', `数据库连接失败: ${err.message}`);
    process.exit(1);
  }

  // 恢复孤儿任务
  await recoverOrphanTasks();

  // 启动健康检查
  const healthServer = startHealthServer();

  // 启动轮询
  const pollTimer = setInterval(pollAndProcess, CONFIG.pollIntervalMs);

  // 立即执行一次
  await pollAndProcess();

  // 优雅关闭
  const shutdown = async (signal) => {
    if (isShuttingDown) return; // 防止重复触发
    log('info', `收到 ${signal}，正在优雅关闭...`);
    isShuttingDown = true;
    clearInterval(pollTimer);
    healthServer.close();

    // 等待活跃任务完成（最多 60 秒）
    const maxWait = 60000;
    const startTime = Date.now();
    while (activeCount > 0 && Date.now() - startTime < maxWait) {
      log('info', `等待 ${activeCount} 个活跃任务完成...`);
      await new Promise(r => setTimeout(r, 2000));
    }

    if (activeCount > 0) {
      log('warn', `仍有 ${activeCount} 个任务未完成，强制退出`);
    }

    log('info', `服务已关闭 (处理: ${totalProcessed}, 成功: ${totalSuccess}, 失败: ${totalError})`);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 捕获未处理的 Promise 拒绝
  process.on('unhandledRejection', (reason) => {
    log('error', `未处理的 Promise 拒绝: ${reason}`);
  });

  log('info', '处理服务已启动，等待任务...');
}

start().catch((err) => {
  log('error', `启动失败: ${err.message}`);
  process.exit(1);
});
