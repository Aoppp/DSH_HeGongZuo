-- 审计记录长期保留；以时间和编号进行键集分页，避免操作记录增长后使用 OFFSET 扫描大量历史行。
ALTER TABLE platform_audit_logs
  ADD COLUMN IF NOT EXISTS actor_display_name varchar(120);

CREATE INDEX IF NOT EXISTS platform_audit_logs_timeline_idx
  ON platform_audit_logs (created_at DESC, id DESC);
