ALTER TABLE account_module_permissions DROP CONSTRAINT IF EXISTS account_module_permissions_permission_id_check;
ALTER TABLE account_module_permissions ADD CONSTRAINT account_module_permissions_permission_id_check
  CHECK (permission_id IN ('employee-data', 'employee-query', 'finance-management', 'project-management', 'management-cockpit', 'platform-administration'));
