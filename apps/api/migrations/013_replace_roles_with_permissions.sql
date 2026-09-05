-- 功能访问由账号权限统一决定；职位仅用于组织展示及管理驾驶舱的 CEO 限制。
ALTER TABLE account_module_permissions DROP CONSTRAINT IF EXISTS account_module_permissions_permission_id_check;
ALTER TABLE account_module_permissions ADD CONSTRAINT account_module_permissions_permission_id_check
  CHECK (permission_id IN ('employee-data', 'employee-query', 'employee-work-records', 'employee-attendance', 'employee-reports', 'recruitment-management', 'meeting-records', 'finance-management', 'project-management', 'management-cockpit', 'platform-administration'));

-- 保留既有开发者的管理能力；迁移器会重复执行历史脚本，因此须兼容 role 已移除的状态。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'accounts' AND column_name = 'role'
  ) THEN
    INSERT INTO account_module_permissions (account_id, permission_id)
    SELECT id, 'platform-administration' FROM accounts WHERE role = 'developer'
    ON CONFLICT (account_id, permission_id) DO NOTHING;
  END IF;
END $$;

INSERT INTO account_module_permissions (account_id, permission_id)
SELECT id, 'management-cockpit' FROM accounts WHERE position = 'CEO'
ON CONFLICT (account_id, permission_id) DO NOTHING;

ALTER TABLE accounts DROP COLUMN IF EXISTS role;
