/**
 * DODO-TJ 批量商品上架 — 任务管理工具 (v3)
 *
 * 使用方式：
 *   node manage-tasks.mjs list                      # 查看所有批次
 *   node manage-tasks.mjs status <batch_id>         # 查看批次详情
 *   node manage-tasks.mjs retry <batch_id>          # 重试批次中所有失败的任务
 *   node manage-tasks.mjs retry-item <item_id>      # 重试单个任务
 *   node manage-tasks.mjs cancel <batch_id>         # 取消批次
 *   node manage-tasks.mjs purge <batch_id>          # 删除批次及所有子项
 *   node manage-tasks.mjs stats                     # 查看总体统计
 *
 * v3 修复：
 *   [+] 增加 purge 命令（彻底删除批次）
 *   [+] 增加环境变量检查
 *   [+] retryBatch 同时重置主表状态为 processing
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

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

// ============================================================
// 命令实现
// ============================================================

async function listBatches() {
  const { data, error } = await supabase
    .from('batch_upload_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error(`查询失败: ${error.message}`);
    return;
  }

  if (!data || data.length === 0) {
    console.log('暂无批量上架任务');
    return;
  }

  console.log('\n批量上架任务列表（最近 20 条）：');
  console.log('-'.repeat(110));
  console.log(
    'ID'.padEnd(38) +
    'Name'.padEnd(26) +
    'Status'.padEnd(14) +
    'Progress'.padEnd(18) +
    'Created',
  );
  console.log('-'.repeat(110));

  const statusLabel = {
    pending:    'PENDING',
    processing: 'RUNNING',
    completed:  'DONE',
    failed:     'FAILED',
    cancelled:  'CANCEL',
  };

  for (const batch of data) {
    const progress = `${batch.success_items || 0}ok ${batch.error_items || 0}err / ${batch.total_items}`;
    console.log(
      batch.id.padEnd(38) +
      (batch.batch_name || '').slice(0, 24).padEnd(26) +
      (statusLabel[batch.status] || batch.status).padEnd(14) +
      progress.padEnd(18) +
      new Date(batch.created_at).toLocaleString('zh-CN'),
    );
  }
  console.log('-'.repeat(110));
}

async function batchStatus(batchId) {
  const { data: batch, error: batchError } = await supabase
    .from('batch_upload_tasks')
    .select('*')
    .eq('id', batchId)
    .single();

  if (batchError || !batch) {
    console.error(`批次不存在: ${batchId}`);
    return;
  }

  console.log(`\n=== 批次详情 ===`);
  console.log(`ID:         ${batch.id}`);
  console.log(`名称:       ${batch.batch_name}`);
  console.log(`状态:       ${batch.status}`);
  console.log(`总数:       ${batch.total_items}`);
  console.log(`已处理:     ${batch.processed_items}`);
  console.log(`成功:       ${batch.success_items}`);
  console.log(`失败:       ${batch.error_items}`);
  console.log(`创建时间:   ${new Date(batch.created_at).toLocaleString('zh-CN')}`);
  console.log(`更新时间:   ${new Date(batch.updated_at).toLocaleString('zh-CN')}`);

  // 查询子项
  const { data: items, error: itemsError } = await supabase
    .from('batch_upload_items')
    .select('id, product_name, status, error_message, retry_count, inventory_product_id, processing_started_at, processing_completed_at')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true });

  if (itemsError || !items) {
    console.error(`查询子项失败: ${itemsError?.message}`);
    return;
  }

  console.log(`\n--- 子项列表 (${items.length}) ---`);

  const statusIcon = {
    queued:        'WAIT',
    processing:    'LOCK',
    ai_analyzing:  'AI-1',
    ai_generating: 'AI-2',
    saving:        'SAVE',
    success:       ' OK ',
    error:         'FAIL',
    skipped:       'SKIP',
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const icon = statusIcon[item.status] || '????';
    const name = (item.product_name || '(unnamed)').slice(0, 28).padEnd(30);
    const retryInfo = item.retry_count > 0 ? ` retry=${item.retry_count}` : '';
    const errorInfo = item.error_message ? ` err="${item.error_message.slice(0, 60)}"` : '';
    const productInfo = item.inventory_product_id ? ` pid=${item.inventory_product_id.slice(0, 8)}` : '';

    // 计算处理耗时
    let durationInfo = '';
    if (item.processing_started_at && item.processing_completed_at) {
      const ms = new Date(item.processing_completed_at) - new Date(item.processing_started_at);
      durationInfo = ` ${(ms / 1000).toFixed(1)}s`;
    }

    console.log(`  [${icon}] ${String(i + 1).padStart(3)}. ${name}${durationInfo}${retryInfo}${productInfo}${errorInfo}`);
  }
}

async function retryBatch(batchId) {
  // 重试时重置 retry_count 和 next_retry_at
  const { data, error } = await supabase
    .from('batch_upload_items')
    .update({
      status: 'queued',
      error_message: null,
      retry_count: 0,
      next_retry_at: new Date().toISOString(),
    })
    .eq('batch_id', batchId)
    .eq('status', 'error')
    .select('id');

  if (error) {
    console.error(`重试失败: ${error.message}`);
    return;
  }

  const count = data?.length || 0;

  if (count === 0) {
    console.log('没有需要重试的失败任务');
    return;
  }

  // 同时更新主表状态为 processing
  await supabase
    .from('batch_upload_tasks')
    .update({ status: 'processing' })
    .eq('id', batchId);

  console.log(`已将 ${count} 个失败任务重新加入队列`);
}

async function retryItem(itemId) {
  // 先查询确认任务存在且是 error 状态
  const { data: item, error: queryError } = await supabase
    .from('batch_upload_items')
    .select('id, batch_id, status')
    .eq('id', itemId)
    .single();

  if (queryError || !item) {
    console.error(`任务不存在: ${itemId}`);
    return;
  }

  if (item.status !== 'error') {
    console.error(`任务状态为 ${item.status}，只能重试 error 状态的任务`);
    return;
  }

  const { error } = await supabase
    .from('batch_upload_items')
    .update({
      status: 'queued',
      error_message: null,
      retry_count: 0,
      next_retry_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  if (error) {
    console.error(`重试失败: ${error.message}`);
    return;
  }

  // 确保主表状态为 processing
  await supabase
    .from('batch_upload_tasks')
    .update({ status: 'processing' })
    .eq('id', item.batch_id);

  console.log(`任务 ${itemId} 已重新加入队列`);
}

async function cancelBatch(batchId) {
  // 先更新主表为 cancelled（触发器会保护此状态）
  const { error: taskError } = await supabase
    .from('batch_upload_tasks')
    .update({ status: 'cancelled' })
    .eq('id', batchId);

  if (taskError) {
    console.error(`更新批次状态失败: ${taskError.message}`);
    return;
  }

  // 取消所有未处理的子项
  const { data: cancelled } = await supabase
    .from('batch_upload_items')
    .update({ status: 'skipped' })
    .eq('batch_id', batchId)
    .in('status', ['queued', 'error'])
    .select('id');

  console.log(`已取消批次 ${batchId}，跳过 ${cancelled?.length || 0} 个待处理任务`);
}

async function purgeBatch(batchId) {
  // 先查询确认批次存在
  const { data: batch, error: queryError } = await supabase
    .from('batch_upload_tasks')
    .select('id, batch_name, status, total_items')
    .eq('id', batchId)
    .single();

  if (queryError || !batch) {
    console.error(`批次不存在: ${batchId}`);
    return;
  }

  // 删除批次（子项通过 ON DELETE CASCADE 自动删除）
  const { error: deleteError } = await supabase
    .from('batch_upload_tasks')
    .delete()
    .eq('id', batchId);

  if (deleteError) {
    console.error(`删除失败: ${deleteError.message}`);
    return;
  }

  console.log(`已删除批次 "${batch.batch_name}" (${batch.total_items} 个子项)`);
}

async function showStats() {
  const { data: tasks, error: taskErr } = await supabase
    .from('batch_upload_tasks')
    .select('status');

  const { data: items, error: itemErr } = await supabase
    .from('batch_upload_items')
    .select('status');

  if (taskErr || itemErr) {
    console.error(`查询失败: ${taskErr?.message || itemErr?.message}`);
    return;
  }

  const taskStats = {};
  for (const t of (tasks || [])) {
    taskStats[t.status] = (taskStats[t.status] || 0) + 1;
  }

  const itemStats = {};
  for (const i of (items || [])) {
    itemStats[i.status] = (itemStats[i.status] || 0) + 1;
  }

  console.log('\n=== 总体统计 ===');
  console.log(`\n批次总数: ${(tasks || []).length}`);
  for (const [status, count] of Object.entries(taskStats).sort()) {
    console.log(`  ${status.padEnd(12)} ${count}`);
  }

  console.log(`\n任务总数: ${(items || []).length}`);
  for (const [status, count] of Object.entries(itemStats).sort()) {
    console.log(`  ${status.padEnd(16)} ${count}`);
  }
}

// ============================================================
// 入口
// ============================================================
const [command, ...cmdArgs] = process.argv.slice(2);

switch (command) {
  case 'list':
    await listBatches();
    break;
  case 'status':
    if (!cmdArgs[0]) { console.error('用法: manage-tasks.mjs status <batch_id>'); process.exit(1); }
    await batchStatus(cmdArgs[0]);
    break;
  case 'retry':
    if (!cmdArgs[0]) { console.error('用法: manage-tasks.mjs retry <batch_id>'); process.exit(1); }
    await retryBatch(cmdArgs[0]);
    break;
  case 'retry-item':
    if (!cmdArgs[0]) { console.error('用法: manage-tasks.mjs retry-item <item_id>'); process.exit(1); }
    await retryItem(cmdArgs[0]);
    break;
  case 'cancel':
    if (!cmdArgs[0]) { console.error('用法: manage-tasks.mjs cancel <batch_id>'); process.exit(1); }
    await cancelBatch(cmdArgs[0]);
    break;
  case 'purge':
    if (!cmdArgs[0]) { console.error('用法: manage-tasks.mjs purge <batch_id>'); process.exit(1); }
    await purgeBatch(cmdArgs[0]);
    break;
  case 'stats':
    await showStats();
    break;
  default:
    console.log(`
DODO-TJ 批量商品上架 — 任务管理工具

命令：
  list                   查看所有批次（最近 20 条）
  status <batch_id>      查看批次详情和子项列表
  retry <batch_id>       重试批次中所有失败的任务
  retry-item <item_id>   重试单个任务
  cancel <batch_id>      取消批次（跳过未处理的任务）
  purge <batch_id>       彻底删除批次及所有子项
  stats                  查看总体统计
`);
}
