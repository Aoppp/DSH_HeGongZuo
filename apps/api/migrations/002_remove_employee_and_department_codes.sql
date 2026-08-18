ALTER TABLE employees DROP COLUMN IF EXISTS employee_no;
ALTER TABLE employees DROP COLUMN IF EXISTS department_code;
ALTER TABLE employees ALTER COLUMN work_email DROP NOT NULL;

