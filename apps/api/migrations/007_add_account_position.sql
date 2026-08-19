-- 账号职位：自由文本（如 CEO、财务经理），权限仍由 role 字段控制
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS position varchar(120) NOT NULL DEFAULT '';

-- 已有账号补职位（仅当为空时补，避免覆盖手动设置的值）
UPDATE accounts SET position = 'CEO' WHERE account_id = 'taochunlin' AND position = '';
UPDATE accounts SET position = '开发者' WHERE account_id = 'liuao' AND position = '';
