/**
 * DODO-TJ 批量商品上架 — 图片上传与任务创建工具 (v4)
 *
 * 使用方式：
 *   node upload-images.mjs <图片目录> [选项]
 *
 * 选项：
 *   --category <分类ID>    预设商品分类（homepage_categories.id）
 *   --price <价格>         默认价格 (默认: 39.90)
 *   --stock <库存>         默认库存 (默认: 100)
 *   --batch-name <名称>    批次名称
 *   --concurrency <数量>   图片上传并发数 (默认: 3)
 *
 * 图片组织方式：
 *   方式一（自动模式）：所有图片放在同一目录，每张图片视为一个独立商品
 *   方式二（分组模式）：每个子目录代表一个商品，子目录内的多张图片属于同一商品
 *
 * 示例：
 *   node upload-images.mjs ./photos
 *   node upload-images.mjs ./photos --category abc123 --price 29.90
 *   node upload-images.mjs ./photos --batch-name "2026-04-25 新品" --concurrency 5
 *
 * v3 修复：
 *   [C1] 审计日志字段名修正（target_table/target_type/target_id/source/status）
 *   [+]  增加图片上传重试（单张最多重试 2 次）
 *   [+]  增加分批插入子项（每批 50 个，避免单次 INSERT 过大）
 *
 * v4 极限压缩优化：
 *   [+]  使用 sharp 对图片进行极限压缩（WebP 格式，质量 72%，最大 1200px）
 *   [+]  上传前自动压缩，大幅降低存储成本
 *   [+]  添加 sharp 依赖到 package.json
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';

// 动态导入 sharp（可能未安装时降级为不压缩）
let sharp = null;
try {
  sharp = (await import('sharp')).default;
  console.log('[压缩] sharp 已加载，将对图片进行极限压缩');
} catch (e) {
  console.warn('[压缩] sharp 未安装，将直接上传原图。请运行: npm install sharp');
}

// ============================================================
// 压缩配置
// ============================================================
const COMPRESS_MAX_DIM = 1200;    // 最大宽度/高度 1200px
const COMPRESS_QUALITY = 72;      // WebP 质量 72%（极限压缩）

// ============================================================
// 配置
// ============================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const UPLOAD_BUCKET = 'inventory-products';
const UPLOAD_FOLDER = 'batch-upload';
const MAX_UPLOAD_RETRIES = 2;
const BATCH_INSERT_SIZE = 50;

// ============================================================
// 解析命令行参数
// ============================================================
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    imageDir: null,
    categoryId: null,
    price: parseFloat(process.env.DEFAULT_PRICE || '39.90'),
    stock: parseInt(process.env.DEFAULT_STOCK || '100', 10),
    batchName: `批量上架_${new Date().toISOString().slice(0, 10)}`,
    concurrency: 3,
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
      case '--concurrency':
        result.concurrency = parseInt(args[++i], 10);
        break;
      default:
        if (!args[i].startsWith('--')) {
          result.imageDir = args[i];
        }
    }
  }

  return result;
}

// ============================================================
// 扫描图片文件
// ============================================================
function scanImages(dir) {
  const groups = [];
  const entries = readdirSync(dir).sort();

  // 检查是否有子目录（分组模式）
  const subdirs = entries.filter(e => {
    try {
      return statSync(join(dir, e)).isDirectory();
    } catch {
      return false;
    }
  });

  if (subdirs.length > 0) {
    // 分组模式：每个子目录是一个商品
    console.log(`检测到 ${subdirs.length} 个子目录，使用分组模式`);
    for (const subdir of subdirs) {
      const subPath = join(dir, subdir);
      const files = readdirSync(subPath)
        .filter(f => ALLOWED_EXTENSIONS.has(extname(f).toLowerCase()))
        .sort()
        .map(f => join(subPath, f));

      if (files.length > 0) {
        groups.push({ name: subdir, files });
      }
    }
  } else {
    // 自动模式：每张图片是一个独立商品
    const files = entries.filter(f => ALLOWED_EXTENSIONS.has(extname(f).toLowerCase()));
    console.log(`检测到 ${files.length} 张图片，使用自动模式（每张图片 = 一个商品）`);
    for (const file of files) {
      groups.push({
        name: basename(file, extname(file)),
        files: [join(dir, file)],
      });
    }
  }

  return groups;
}

// ============================================================
// 极限压缩图片
// ============================================================
async function compressImage(fileBuffer, filePath) {
  if (!sharp) {
    // sharp 未安装，返回原始 buffer
    return { buffer: fileBuffer, ext: extname(filePath).toLowerCase().replace('.', ''), contentType: getMimeType(filePath) };
  }

  const ext = extname(filePath).toLowerCase();
  
  // GIF 不压缩（保留动画）
  if (ext === '.gif') {
    return { buffer: fileBuffer, ext: 'gif', contentType: 'image/gif' };
  }

  try {
    const originalSize = fileBuffer.length;
    
    // 使用 sharp 进行极限压缩：缩放 + WebP 格式 + 低质量
    const compressedBuffer = await sharp(fileBuffer)
      .resize(COMPRESS_MAX_DIM, COMPRESS_MAX_DIM, {
        fit: 'inside',           // 等比缩放，不裁剪
        withoutEnlargement: true // 不放大小图
      })
      .webp({
        quality: COMPRESS_QUALITY,  // 72% 质量
        effort: 6,                  // 最大压缩努力（0-6）
        smartSubsample: true,       // 智能子采样
      })
      .toBuffer();

    const ratio = ((1 - compressedBuffer.length / originalSize) * 100).toFixed(1);
    process.stdout.write(`C(${ratio}%) `);
    
    return { buffer: compressedBuffer, ext: 'webp', contentType: 'image/webp' };
  } catch (e) {
    console.warn(`\n  [压缩警告] ${basename(filePath)}: ${e.message}，使用原图`);
    return { buffer: fileBuffer, ext: ext.replace('.', ''), contentType: getMimeType(filePath) };
  }
}

function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  const mimeMap = { '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
  return mimeMap[ext] || 'image/jpeg';
}

// ============================================================
// 上传单张图片到 Supabase Storage（带压缩和重试）
// ============================================================
async function uploadImage(filePath) {
  const fileBuffer = readFileSync(filePath);
  
  // 极限压缩
  const { buffer: uploadBuffer, ext, contentType } = await compressImage(fileBuffer, filePath);

  const fileName = `${UPLOAD_FOLDER}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  let lastError;
  for (let attempt = 0; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    if (attempt > 0) {
      const waitMs = 1000 * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, waitMs));
    }

    const { error: uploadError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .upload(fileName, uploadBuffer, {
        cacheControl: '31536000',
        upsert: false,
        contentType: contentType,
      });

    if (!uploadError) {
      const { data: { publicUrl } } = supabase.storage.from(UPLOAD_BUCKET).getPublicUrl(fileName);
      return publicUrl;
    }

    lastError = uploadError;
    if (attempt < MAX_UPLOAD_RETRIES) {
      process.stdout.write('R'); // 标记重试
    }
  }

  throw new Error(`上传失败 (${basename(filePath)}): ${lastError.message}`);
}

// ============================================================
// 分批插入子项
// ============================================================
async function batchInsertItems(items) {
  for (let i = 0; i < items.length; i += BATCH_INSERT_SIZE) {
    const chunk = items.slice(i, i + BATCH_INSERT_SIZE);
    const { error } = await supabase
      .from('batch_upload_items')
      .insert(chunk);

    if (error) {
      throw new Error(`批量插入子项失败 (第 ${i + 1}-${i + chunk.length} 项): ${error.message}`);
    }
  }
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  const args = parseArgs();

  if (!args.imageDir) {
    console.log(`
使用方式：
  node upload-images.mjs <图片目录> [选项]

选项：
  --category <分类ID>    预设商品分类（homepage_categories.id）
  --price <价格>         默认价格 (默认: ${args.price})
  --stock <库存>         默认库存 (默认: ${args.stock})
  --batch-name <名称>    批次名称
  --concurrency <数量>   图片上传并发数 (默认: 3)

图片组织方式：
  方式一：所有图片放在同一目录 → 每张图片 = 一个商品
  方式二：每个子目录 = 一个商品 → 子目录内多张图片属于同一商品

示例：
  node upload-images.mjs ./photos
  node upload-images.mjs ./photos --category abc123 --price 29.90
  node upload-images.mjs ./photos --batch-name "新品上架" --concurrency 5
`);
    process.exit(1);
  }

  if (!existsSync(args.imageDir)) {
    console.error(`目录不存在: ${args.imageDir}`);
    process.exit(1);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('请在 .env 中配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // 扫描图片
  const groups = scanImages(args.imageDir);
  if (groups.length === 0) {
    console.error('未找到任何图片文件（支持: .jpg .jpeg .png .webp .gif）');
    process.exit(1);
  }

  const totalImages = groups.reduce((sum, g) => sum + g.files.length, 0);
  console.log(`\n准备上传 ${groups.length} 个商品 (共 ${totalImages} 张图片)...`);
  console.log(`[压缩配置] 格式: WebP, 质量: ${COMPRESS_QUALITY}%, 最大尺寸: ${COMPRESS_MAX_DIM}px\n`);

  // 创建批次任务
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

  console.log(`批次已创建: ${batch.id} (${args.batchName})\n`);

  // 逐组上传图片
  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;
  const pendingItems = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const progress = `[${String(i + 1).padStart(String(groups.length).length, ' ')}/${groups.length}]`;

    try {
      process.stdout.write(`${progress} "${group.name}" (${group.files.length} 张) `);

      // 上传所有图片（含压缩）
      const imageUrls = [];
      for (const filePath of group.files) {
        const url = await uploadImage(filePath);
        imageUrls.push(url);
        process.stdout.write('.');
      }
      console.log(' OK');

      // 收集子项数据（稍后批量插入）
      pendingItems.push({
        batch_id: batch.id,
        image_urls: imageUrls,
        category_id: args.categoryId || null,
        product_name: group.name,
        price: args.price,
        stock: args.stock,
        status: 'queued',
      });

      successCount++;
    } catch (error) {
      console.log(` FAIL: ${error.message}`);
      errorCount++;
    }
  }

  // 批量插入子项到数据库
  if (pendingItems.length > 0) {
    console.log(`\n正在创建 ${pendingItems.length} 个任务项...`);
    try {
      await batchInsertItems(pendingItems);
      console.log('任务项创建完成');
    } catch (error) {
      console.error(`任务项创建失败: ${error.message}`);
      // 尝试逐个插入作为降级
      console.log('尝试逐个插入...');
      let fallbackSuccess = 0;
      for (const item of pendingItems) {
        const { error: itemError } = await supabase
          .from('batch_upload_items')
          .insert(item);
        if (itemError) {
          console.error(`  插入失败: ${itemError.message}`);
          errorCount++;
          successCount--;
        } else {
          fallbackSuccess++;
        }
      }
      console.log(`逐个插入完成: ${fallbackSuccess}/${pendingItems.length}`);
    }
  }

  // [C1] 写入审计日志 — 字段名与 admin_audit_logs 表结构完全匹配
  try {
    await supabase.from('admin_audit_logs').insert({
      admin_id: null,
      action: 'BATCH_UPLOAD_IMAGES',
      target_type: 'batch_upload_task',
      target_id: batch.id,
      target_table: 'batch_upload_tasks',
      new_data: {
        batch_name: args.batchName,
        total_items: groups.length,
        success_items: successCount,
        error_items: errorCount,
        category_id: args.categoryId,
        price: args.price,
        compression: `WebP q${COMPRESS_QUALITY} max${COMPRESS_MAX_DIM}px`,
      },
      details: {
        source: 'upload-images-cli',
        total_images: totalImages,
        sharp_available: !!sharp,
      },
      source: 'edge_function',
      status: 'success',
      duration_ms: Date.now() - startTime,
    });
  } catch (e) {
    // 审计日志失败不影响主流程
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n========================================`);
  console.log(`上传完成！(耗时 ${duration}s)`);
  console.log(`  批次 ID:   ${batch.id}`);
  console.log(`  批次名称:  ${args.batchName}`);
  console.log(`  压缩配置:  WebP q${COMPRESS_QUALITY} max${COMPRESS_MAX_DIM}px`);
  console.log(`  成功:      ${successCount} 个商品`);
  if (errorCount > 0) {
    console.log(`  失败:      ${errorCount} 个商品`);
  }
  console.log(`========================================`);
  console.log(`\n任务已加入队列，请确保 processor.mjs 正在运行。`);
  console.log(`  启动处理器: node processor.mjs`);
  console.log(`  查看进度:   node manage-tasks.mjs status ${batch.id}`);
}

main().catch((err) => {
  console.error(`执行失败: ${err.message}`);
  process.exit(1);
});
