-- ============================================================
-- DODO-TJ 批量商品上架 — 数据库迁移脚本 v3
-- ============================================================
--
-- 执行方式：在 Supabase Dashboard → SQL Editor 中粘贴执行
-- 可重复执行（幂等设计）
--
-- 创建表：
--   batch_upload_tasks   — 批量上架任务主表（一个批次）
--   batch_upload_items   — 批量上架子项表（一个商品）
--
-- v3 修复清单：
--   [C1] 触发器使用 DROP + CREATE 实现幂等（PostgreSQL 不支持 IF NOT EXISTS）
--   [M1] 孤儿恢复增加 processing_started_at 时间条件的注释说明
--   [M4] 触发器保护 cancelled 状态不被子项变更覆盖
--   [M8] next_retry_at 字段支持指数退避重试
--   [RPC] 包含完整的 admin_mutate 白名单更新 SQL（可选执行）
-- ============================================================

-- ============================================================
-- 1. 批量上架任务主表
-- ============================================================
CREATE TABLE IF NOT EXISTS batch_upload_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID REFERENCES admin_users(id),     -- 可为 NULL（CLI 脚本无 admin session）
  batch_name      TEXT NOT NULL DEFAULT '',
  total_items     INTEGER NOT NULL DEFAULT 0,
  processed_items INTEGER NOT NULL DEFAULT 0,
  success_items   INTEGER NOT NULL DEFAULT 0,
  error_items     INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  default_category_id UUID,                            -- 不加外键约束，避免分类表不存在时报错
  default_price   NUMERIC(10,2),
  default_stock   INTEGER DEFAULT 100,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. 批量上架子项表
-- ============================================================
CREATE TABLE IF NOT EXISTS batch_upload_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                UUID NOT NULL REFERENCES batch_upload_tasks(id) ON DELETE CASCADE,
  image_urls              TEXT[] NOT NULL DEFAULT '{}',
  category_id             UUID,                        -- 不加外键约束，同上
  product_name            TEXT,
  price                   NUMERIC(10,2),
  stock                   INTEGER DEFAULT 100,
  specs                   TEXT,
  status                  TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'ai_analyzing', 'ai_generating', 'saving', 'success', 'error', 'skipped')),
  inventory_product_id    UUID,                        -- 入库后回填，指向 inventory_products.id
  ai_result               JSONB,                       -- AI 中间结果（semantic_facts + localized）
  ai_understanding        JSONB,                       -- 最终的 LocalizedAIUnderstanding 结构
  error_message           TEXT,
  retry_count             INTEGER NOT NULL DEFAULT 0,
  max_retries             INTEGER NOT NULL DEFAULT 3,
  next_retry_at           TIMESTAMPTZ DEFAULT now(),   -- 指数退避：下次允许重试的时间
  processing_started_at   TIMESTAMPTZ,                 -- 开始处理时间（用于孤儿检测）
  processing_completed_at TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. 索引
-- ============================================================

-- 队列查询索引：加速 processor 拉取 queued/error 任务
CREATE INDEX IF NOT EXISTS idx_batch_items_queue
  ON batch_upload_items (status, next_retry_at, created_at)
  WHERE status IN ('queued', 'error');

-- 批次关联索引
CREATE INDEX IF NOT EXISTS idx_batch_items_batch_id
  ON batch_upload_items (batch_id);

-- 主表状态索引
CREATE INDEX IF NOT EXISTS idx_batch_tasks_status
  ON batch_upload_tasks (status);

-- ============================================================
-- 4. 自动更新 updated_at 触发器
-- ============================================================
-- 使用专用函数名 batch_upload_update_updated_at，避免覆盖项目中已有的同名函数

CREATE OR REPLACE FUNCTION batch_upload_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 幂等：先删除再创建（PostgreSQL CREATE TRIGGER 不支持 IF NOT EXISTS）
DROP TRIGGER IF EXISTS trg_batch_tasks_updated_at ON batch_upload_tasks;
CREATE TRIGGER trg_batch_tasks_updated_at
  BEFORE UPDATE ON batch_upload_tasks
  FOR EACH ROW EXECUTE FUNCTION batch_upload_update_updated_at();

DROP TRIGGER IF EXISTS trg_batch_items_updated_at ON batch_upload_items;
CREATE TRIGGER trg_batch_items_updated_at
  BEFORE UPDATE ON batch_upload_items
  FOR EACH ROW EXECUTE FUNCTION batch_upload_update_updated_at();

-- ============================================================
-- 5. 子项状态变更时自动更新主表计数
-- ============================================================
-- 当子项的 status 发生变化或新增子项时，自动统计并更新主表的计数字段。
-- 保护 cancelled 状态：如果主表已被取消，不会因子项变化而改回 processing。

CREATE OR REPLACE FUNCTION batch_upload_sync_task_counts()
RETURNS TRIGGER AS $$
DECLARE
  v_batch_id      UUID;
  v_task_status   TEXT;
  v_total         INTEGER;
  v_processed     INTEGER;
  v_success       INTEGER;
  v_error         INTEGER;
  v_new_status    TEXT;
BEGIN
  v_batch_id := COALESCE(NEW.batch_id, OLD.batch_id);

  -- 获取当前主表状态
  SELECT status INTO v_task_status
  FROM batch_upload_tasks
  WHERE id = v_batch_id
  FOR UPDATE;  -- 行锁，防止并发触发器互相覆盖

  -- 统计子项
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('success', 'error', 'skipped')),
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE status = 'error')
  INTO v_total, v_processed, v_success, v_error
  FROM batch_upload_items
  WHERE batch_id = v_batch_id;

  -- 决定新状态
  IF v_task_status = 'cancelled' THEN
    -- 已取消的批次，保持 cancelled 状态
    v_new_status := 'cancelled';
  ELSIF v_processed >= v_total AND v_total > 0 THEN
    IF v_error > 0 AND v_success = 0 THEN
      v_new_status := 'failed';
    ELSE
      v_new_status := 'completed';
    END IF;
  ELSIF v_processed > 0 THEN
    v_new_status := 'processing';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE batch_upload_tasks
  SET
    total_items     = v_total,
    processed_items = v_processed,
    success_items   = v_success,
    error_items     = v_error,
    status          = v_new_status
  WHERE id = v_batch_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 子项状态变更时触发
DROP TRIGGER IF EXISTS trg_batch_item_status_change ON batch_upload_items;
CREATE TRIGGER trg_batch_item_status_change
  AFTER UPDATE OF status ON batch_upload_items
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION batch_upload_sync_task_counts();

-- 新增子项时触发
DROP TRIGGER IF EXISTS trg_batch_item_insert ON batch_upload_items;
CREATE TRIGGER trg_batch_item_insert
  AFTER INSERT ON batch_upload_items
  FOR EACH ROW
  EXECUTE FUNCTION batch_upload_sync_task_counts();

-- 删除子项时触发（如手动清理）
DROP TRIGGER IF EXISTS trg_batch_item_delete ON batch_upload_items;
CREATE TRIGGER trg_batch_item_delete
  AFTER DELETE ON batch_upload_items
  FOR EACH ROW
  EXECUTE FUNCTION batch_upload_sync_task_counts();

-- ============================================================
-- 6. RLS 策略
-- ============================================================
-- 使用 service_role key 的请求自动绕过 RLS。
-- 这里启用 RLS 并只允许 service_role 访问，
-- 防止匿名用户或普通 authenticated 用户直接访问这些表。

ALTER TABLE batch_upload_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_upload_items ENABLE ROW LEVEL SECURITY;

-- 幂等：先删除再创建
DROP POLICY IF EXISTS "service_role_full_access_tasks" ON batch_upload_tasks;
CREATE POLICY "service_role_full_access_tasks"
  ON batch_upload_tasks FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_full_access_items" ON batch_upload_items;
CREATE POLICY "service_role_full_access_items"
  ON batch_upload_items FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 7. [可选] Admin RPC 白名单更新
-- ============================================================
-- 如果后续需要在 Admin 后台开发批量上架管理页面，
-- 取消下面的注释并执行，将新表添加到 admin_query / admin_count / admin_mutate 的白名单中。
-- 参考：前端仓库 docs/ADMIN_RPC_WHITELIST_GUIDE.md
--
-- 注意：独立处理脚本 (processor.mjs) 使用 service_role key 直接访问，
-- 不需要经过 RPC 白名单，因此脚本本身不受此限制。
-- 只有当 Admin 前端需要通过 adminQuery/adminInsert 等函数操作这些表时才需要更新。
--
-- DO $$
-- DECLARE
--   v_func_body TEXT;
-- BEGIN
--   -- 更新 admin_mutate
--   SELECT pg_get_functiondef(oid) INTO v_func_body
--   FROM pg_proc WHERE proname = 'admin_mutate' LIMIT 1;
--
--   IF v_func_body IS NOT NULL AND v_func_body NOT LIKE '%batch_upload_tasks%' THEN
--     v_func_body := replace(v_func_body,
--       '''promoter_daily_logs''',
--       '''promoter_daily_logs'', ''batch_upload_tasks'', ''batch_upload_items'''
--     );
--     EXECUTE v_func_body;
--     RAISE NOTICE 'admin_mutate 白名单已更新';
--   END IF;
--
--   -- 对 admin_query 和 admin_count 做同样的操作...
-- END $$;

-- ============================================================
-- 迁移完成
-- ============================================================
-- 执行后请验证：
--   SELECT count(*) FROM batch_upload_tasks;  -- 应返回 0
--   SELECT count(*) FROM batch_upload_items;   -- 应返回 0
