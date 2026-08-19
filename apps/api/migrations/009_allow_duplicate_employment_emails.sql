-- 员工表按任职记录保存；返聘或多段任职可能复用同一企业邮箱
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_work_email_key;
