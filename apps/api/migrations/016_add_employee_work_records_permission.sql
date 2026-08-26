-- 考勤与汇报是独立的员工数据权限；已有档案维护账号升级后保持完整员工管理范围。
ALTER TABLE account_module_permissions DROP CONSTRAINT IF EXISTS account_module_permissions_permission_id_check;
ALTER TABLE account_module_permissions ADD CONSTRAINT account_module_permissions_permission_id_check
  CHECK (permission_id IN ('employee-data', 'employee-query', 'employee-work-records', 'employee-attendance', 'employee-reports', 'finance-management', 'project-management', 'management-cockpit', 'platform-administration'));

INSERT INTO account_module_permissions (account_id, permission_id)
SELECT account_id, 'employee-work-records'
FROM account_module_permissions
WHERE permission_id = 'employee-data'
ON CONFLICT (account_id, permission_id) DO NOTHING;
