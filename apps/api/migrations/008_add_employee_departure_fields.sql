-- 离职档案字段；同一人员可有多段任职记录，因此不再以身份证号作为全局唯一约束
ALTER TABLE employees ADD COLUMN IF NOT EXISTS departure_date date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS departure_reason text;
DROP INDEX IF EXISTS employees_id_number_key;
CREATE INDEX IF NOT EXISTS employees_departure_date_idx ON employees(departure_date);
