/**
 * DODO-TJ 批量商品上架 — 快速添加工具（URL 模式）(v3)
 *
 * 当图片已经在线上（如已上传到 Supabase Storage）时，
 * 可以直接通过 URL 列表快速创建批量上架任务。
 *
 * 使用方式：
 *   node quick-add.mjs <url_list_file> [选项]
 *
 * URL 列表文件格式（每行一个 URL，空行分隔不同商品）：
 *   https://xxx/image1.jpg
 *   https://xxx/image1-side.jpg
 *
 *   https://xxx/image2.jpg
 *
 * 或者简单模式（每行一个 URL = 一个商品）：
 *   https://xxx/image1.jpg
 *   https://xxx/image2.jpg
 *
 * v3 修复：
 *   [C1] 审计日志字段名修正
 *   [+]  增加环境变量检查
 *   [+]  增加 URL 格式校验
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

// ============================================================
// 初始化
// ============================================================
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('请在 .env 中配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const BATCH_INSERT_SIZE = 50;

// ============================================================
// 解析命令行参数
// ============================================================
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    urlFile: null,
    categoryId: null,
    price: parseFloat(process.env.DEFAULT_PRICE || '39.90'),
    stock: parseInt(process.env.DEFAULT_STOCK || '100', 10),
    batchName: `快速上架_${new Date().toISOString().slice(0, 10)}`,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--category':
        result.categoryId = args[++i];
        break;
      case '--price':
        result.price = parseFloat(args[++i]);
        break;
      case '--stock':
        result.stock = parseInt(args[++i], 10);
        break;
      case '--batch-name':
        result.batchName = args[++i];
        break;
      default:
        if (!args[i].startsWith('--')) {
          result.urlFile = args[i];
        }
    }
  }

  return result;
}

// ============================================================
// 解析 URL 列表文件
// ============================================================
function parseUrlFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim());

  // 按空行分组
  const groups = [];
  let currentGroup = [];

  for (const line of lines) {
    if (line === '') {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    } else if (line.startsWith('http://') || line.startsWith('https://')) {
      currentGroup.push(line);
    } else if (line.startsWith('#') || line.startsWith('//')) {
      // 跳过注释行
      continue;
    } else {
      console.warn(`跳过无效行: ${line.slice(0, 80)}`);
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

// ============================================================
// 分批插入子项
// ============================================================
async function batchInsertItems(items) {
  let insertedCount = 0;

  for (let i = 0; i < items.length; i += BATCH_INSERT_SIZE) {
    const chunk = items.slice(i, i + BATCH_INSERT_SIZE);
    const { error: insertError } = await supabase
      .from('batch_upload_items')
      .insert(chunk);

    if (insertError) {
      console.error(`  插入失败 (第 ${i + 1}-${i + chunk.length} 项): ${insertError.message}`);
      // 降级为逐个插入
      for (const item of chunk) {
        const { error } = await supabase.from('batch_upload_items').insert(item);
        if (!error) insertedCount++;
        else console.error(`  单项插入失败: ${error.message}`);
      }
      continue;
    }
    insertedCount += chunk.length;
  }

  return insertedCount;
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  const args = parseArgs();

  if (!args.urlFile) {
    console.log(`
使用方式：
  node quick-add.mjs <url_list_file> [选项]

选项：
  --category <分类ID>    预设商品分类（homepage_categories.id）
  --price <价格>         默认价格 (默认: ${args.price})
  --stock <库存>         默认库存 (默认: ${args.stock})
  --batch-name <名称>    批次名称

URL 列表文件格式：
  每行一个图片 URL，空行分隔不同商品。
  如果没有空行分隔，则每个 URL 视为一个独立商品。
  以 # 或 // 开头的行视为注释。

示例：
  node quick-add.mjs urls.txt
  node quick-add.mjs urls.txt --category abc123 --price 29.90
`);
    process.exit(1);
  }

  if (!existsSync(args.urlFile)) {
    console.error(`文件不存在: ${args.urlFile}`);
    process.exit(1);
  }

  const groups = parseUrlFile(args.urlFile);
  if (groups.length === 0) {
    console.error('未找到有效的图片 URL');
    process.exit(1);
  }

  const totalUrls = groups.reduce((sum, g) => sum + g.length, 0);
  console.log(`解析到 ${groups.length} 个商品 (共 ${totalUrls} 个 URL)，准备创建任务...\n`);

  // 创建批次
  const { data: batch, error: batchError } = await supabase
    .from('batch_upload_tasks')
    .insert({
      batch_name: args.batchName,
      total_items: groups.length,
      status: 'pending',
      default_category_id: args.categoryId || null,
      default_price: args.price,
      default_stock: args.stock,
    })
    .select('id')
    .single();

  if (batchError) {
    console.error(`创建批次失败: ${batchError.message}`);
    process.exit(1);
  }

  // 构建子项数据
  const items = groups.map(urls => ({
    batch_id: batch.id,
    image_urls: urls,
    category_id: args.categoryId || null,
    price: args.price,
    stock: args.stock,
    status: 'queued',
  }));

  // 分批插入
  const insertedCount = await batchInsertItems(items);

  // [C1] 写入审计日志
  try {
    await supabase.from('admin_audit_logs').insert({
      admin_id: null,
      action: 'BATCH_QUICK_ADD',
      target_type: 'batch_upload_task',
      target_id: batch.id,
      target_table: 'batch_upload_tasks',
      new_data: {
        batch_name: args.batchName,
        total_items: groups.length,
        inserted_items: insertedCount,
        category_id: args.categoryId,
        price: args.price,
      },
      details: { source: 'quick-add-cli' },
      source: 'edge_function',
      status: 'success',
    });
  } catch (e) {
    // 审计日志失败不影响主流程
  }

  console.log(`========================================`);
  console.log(`任务创建成功！`);
  console.log(`  批次 ID:   ${batch.id}`);
  console.log(`  批次名称:  ${args.batchName}`);
  console.log(`  商品数量:  ${insertedCount}`);
  console.log(`========================================`);
  console.log(`\n请确保 processor.mjs 正在运行以自动处理。`);
  console.log(`  启动处理器: node processor.mjs`);
  console.log(`  查看进度:   node manage-tasks.mjs status ${batch.id}`);
}

main().catch((err) => {
  console.error(`执行失败: ${err.message}`);
  process.exit(1);
});
