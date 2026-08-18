-- 移除直属经理字段：员工档案数据不含汇报关系，直属经理概念不再使用
ALTER TABLE employees DROP COLUMN IF EXISTS manager_id CASCADE;
DROP INDEX IF EXISTS employees_manager_id_idx;
