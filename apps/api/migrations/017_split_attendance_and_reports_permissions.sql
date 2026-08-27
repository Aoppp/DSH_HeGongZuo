-- 将原“考勤与汇报”权限平滑拆分为两个可独立分配的权限。
ALTER TABLE account_module_permissions DROP CONSTRAINT IF EXISTS account_module_permissions_permission_id_check;
ALTER TABLE account_module_permissions ADD CONSTRAINT account_module_permissions_permission_id_check
  CHECK (permission_id IN ('employee-data', 'employee-query', 'employee-work-records', 'employee-attendance', 'employee-reports', 'meeting-records', 'finance-management', 'project-management', 'management-cockpit', 'platform-administration'));

INSERT INTO account_module_permissions (account_id, permission_id)
SELECT account_id, replacement.permission_id
FROM account_module_permissions
CROSS JOIN (VALUES ('employee-attendance'), ('employee-reports')) AS replacement(permission_id)
WHERE account_module_permissions.permission_id = 'employee-work-records'
ON CONFLICT (account_id, permission_id) DO NOTHING;

DELETE FROM account_module_permissions WHERE permission_id = 'employee-work-records';

ALTER TABLE account_module_permissions DROP CONSTRAINT IF EXISTS account_module_permissions_permission_id_check;
ALTER TABLE account_module_permissions ADD CONSTRAINT account_module_permissions_permission_id_check
  CHECK (permission_id IN ('employee-data', 'employee-query', 'employee-attendance', 'employee-reports', 'meeting-records', 'finance-management', 'project-management', 'management-cockpit', 'platform-administration'));
