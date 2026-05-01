-- ============================================================
-- 批量上架助手：新增 understanding_only 控制位
-- ============================================================
-- 与 DODO-TJ-frontend/supabase/migrations/20260502000001_batch_understanding_only.sql
-- 保持完全一致，便于在生产服务器直接 psql 执行。
-- ============================================================
ALTER TABLE batch_upload_tasks
  ADD COLUMN IF NOT EXISTS understanding_only BOOLEAN NOT NULL DEFAULT TRUE;
COMMENT ON COLUMN batch_upload_tasks.understanding_only IS
  '批次默认模式：true=仅AI商品理解（不抠图/不生成海报，使用原图入库）；false=完整AI理解+抠图+海报生成（未来扩展）';
ALTER TABLE batch_upload_items
  ADD COLUMN IF NOT EXISTS understanding_only BOOLEAN NOT NULL DEFAULT TRUE;
COMMENT ON COLUMN batch_upload_items.understanding_only IS
  '单商品模式：true=仅AI商品理解；false=完整AI理解+抠图+海报生成。继承自批次主表，子项可覆盖。';
UPDATE batch_upload_tasks SET understanding_only = TRUE WHERE understanding_only IS NULL;
UPDATE batch_upload_items SET understanding_only = TRUE WHERE understanding_only IS NULL;
