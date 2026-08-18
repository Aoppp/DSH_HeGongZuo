-- 员工个人档案字段（来源：data/王叔和在职.xlsx，82 名在职员工）
ALTER TABLE employees ADD COLUMN IF NOT EXISTS company_name varchar(120);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender varchar(8);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS id_number varchar(32);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS personal_email varchar(320);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS education varchar(32);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS major varchar(120);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS school varchar(120);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS graduation_date date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS marital_status varchar(8);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_children varchar(8);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hometown varchar(120);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact varchar(120);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_phone varchar(32);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS residential_address varchar(255);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS id_address varchar(255);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account varchar(32);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name varchar(120);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS archive_no varchar(32);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_level2 varchar(120);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS probation_months smallint;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS expected_regular_date date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS actual_regular_date date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_end_date date;

-- 工作地点改为可空：Excel 无工作地点列，正式数据导入时为 NULL
ALTER TABLE employees ALTER COLUMN work_location DROP NOT NULL;

-- 身份证部分唯一索引（含护照号变体）；银行卡刻意不加唯一约束（存在两人共用一张卡）
CREATE UNIQUE INDEX IF NOT EXISTS employees_id_number_key ON employees(id_number) WHERE id_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS employees_company_name_idx ON employees(company_name);
CREATE INDEX IF NOT EXISTS employees_contract_end_date_idx ON employees(contract_end_date);
