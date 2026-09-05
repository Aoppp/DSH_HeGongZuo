CREATE TABLE IF NOT EXISTS recruitment_jobs (
  id bigserial PRIMARY KEY,
  title varchar(160) NOT NULL,
  department varchar(160) NOT NULL DEFAULT '',
  responsibilities text NOT NULL DEFAULT '',
  required_conditions text NOT NULL DEFAULT '',
  preferred_conditions text NOT NULL DEFAULT '',
  exclusion_conditions text NOT NULL DEFAULT '',
  work_location varchar(240) NOT NULL DEFAULT '',
  education_requirement varchar(240) NOT NULL DEFAULT '',
  experience_requirement varchar(240) NOT NULL DEFAULT '',
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by_account_id varchar(32) REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recruitment_candidates (
  id bigserial PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES recruitment_jobs(id) ON DELETE CASCADE,
  file_name varchar(500) NOT NULL,
  mime_type varchar(160) NOT NULL,
  file_data bytea NOT NULL,
  extracted_text text NOT NULL DEFAULT '',
  screening_bucket varchar(24) NOT NULL DEFAULT 'review' CHECK (screening_bucket IN ('priority','review','unrelated')),
  screening_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','eliminated','restored')),
  uploaded_by_account_id varchar(32) REFERENCES accounts(id) ON DELETE SET NULL,
  updated_by_account_id varchar(32) REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recruitment_candidates_job_idx ON recruitment_candidates(job_id, screening_bucket, status, id DESC);

ALTER TABLE account_module_permissions DROP CONSTRAINT IF EXISTS account_module_permissions_permission_id_check;
ALTER TABLE account_module_permissions ADD CONSTRAINT account_module_permissions_permission_id_check
  CHECK (permission_id IN ('employee-data', 'employee-query', 'employee-attendance', 'employee-reports', 'recruitment-management', 'meeting-records', 'finance-management', 'project-management', 'management-cockpit', 'platform-administration'));

INSERT INTO account_module_permissions (account_id, permission_id)
SELECT id, 'recruitment-management' FROM accounts WHERE position IN ('CEO', '开发者')
ON CONFLICT (account_id, permission_id) DO NOTHING;
