-- 平台管理：模块启停状态与可追溯的管理操作记录。
CREATE TABLE IF NOT EXISTS platform_module_settings (
  module_id varchar(64) PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_by_account_id varchar(32) REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id bigserial PRIMARY KEY,
  actor_account_id varchar(32) REFERENCES accounts(id) ON DELETE SET NULL,
  action varchar(80) NOT NULL,
  target_type varchar(80) NOT NULL,
  target_id varchar(120) NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_audit_logs_created_at_idx
  ON platform_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_logs_actor_idx
  ON platform_audit_logs (actor_account_id, created_at DESC);
