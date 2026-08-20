-- 账号按业务模块分配权限；运行空间仅为已开通查询能力的账号创建。
CREATE TABLE IF NOT EXISTS account_module_permissions (
  account_id varchar(32) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  permission_id varchar(64) NOT NULL CHECK (permission_id IN ('employee-data', 'employee-query')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, permission_id)
);

CREATE INDEX IF NOT EXISTS account_module_permissions_permission_idx
  ON account_module_permissions(permission_id);

-- 已有账号保持原有员工管理访问范围，升级后不会丢失入口。
INSERT INTO account_module_permissions (account_id, permission_id)
SELECT id, permission_id
FROM accounts
CROSS JOIN (VALUES ('employee-data'), ('employee-query')) AS defaults(permission_id)
ON CONFLICT (account_id, permission_id) DO NOTHING;

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_status_check
  CHECK (status IN ('active', 'disabled', 'initializing', 'initialization_failed'));
