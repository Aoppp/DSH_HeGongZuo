-- 会议记录与员工档案保持独立；记录创建后仅允许读取。
ALTER TABLE account_module_permissions DROP CONSTRAINT IF EXISTS account_module_permissions_permission_id_check;
ALTER TABLE account_module_permissions ADD CONSTRAINT account_module_permissions_permission_id_check
  CHECK (permission_id IN ('employee-data', 'employee-query', 'employee-work-records', 'employee-attendance', 'employee-reports', 'meeting-records', 'finance-management', 'project-management', 'management-cockpit', 'platform-administration'));

CREATE TABLE IF NOT EXISTS meeting_records (
  id varchar(8) PRIMARY KEY CHECK (id ~ '^[0-9]{5,}$'),
  idempotency_hash char(64) NOT NULL UNIQUE,
  title varchar(200) NOT NULL,
  mode varchar(16) NOT NULL CHECK (mode IN ('chinese', 'bilingual')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL CHECK (ended_at > started_at),
  summary text,
  transcript text NOT NULL,
  participants jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(participants) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_records_started_at_idx ON meeting_records (started_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS meeting_upload_credentials (
  id varchar(32) PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE,
  token_hint varchar(24) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- 现有 CEO 与平台管理员获得初始查看权限；其他账号由账号管理按需分配。
INSERT INTO account_module_permissions (account_id, permission_id)
SELECT DISTINCT accounts.id, 'meeting-records'
FROM accounts
LEFT JOIN account_module_permissions administration
  ON administration.account_id = accounts.id AND administration.permission_id = 'platform-administration'
WHERE accounts.position = 'CEO' OR administration.account_id IS NOT NULL
ON CONFLICT (account_id, permission_id) DO NOTHING;

-- 迁移完成后移除过渡权限值。
DELETE FROM account_module_permissions WHERE permission_id = 'employee-work-records';
ALTER TABLE account_module_permissions DROP CONSTRAINT IF EXISTS account_module_permissions_permission_id_check;
ALTER TABLE account_module_permissions ADD CONSTRAINT account_module_permissions_permission_id_check
  CHECK (permission_id IN ('employee-data', 'employee-query', 'employee-attendance', 'employee-reports', 'meeting-records', 'finance-management', 'project-management', 'management-cockpit', 'platform-administration'));
