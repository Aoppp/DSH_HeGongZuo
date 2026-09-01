-- 企业微信智能表格日报与同步运行日志。
-- 与员工档案分表存储，record_id 是企业微信侧的稳定唯一标识。
CREATE TABLE IF NOT EXISTS employee_work_daily_reports (
  record_id varchar(160) PRIMARY KEY,
  author_user_id varchar(160),
  author_name varchar(160) NOT NULL,
  department_id varchar(160),
  department_name varchar(240),
  submitted_at timestamptz NOT NULL,
  report_date date NOT NULL,
  today_summary text,
  tomorrow_plan text,
  other_items text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachments) = 'array'),
  wecom_created_at timestamptz NOT NULL,
  wecom_updated_at timestamptz NOT NULL,
  raw_values jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_values) = 'object'),
  content_hash char(64) NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_work_daily_reports_date_idx
  ON employee_work_daily_reports (report_date DESC, submitted_at DESC, record_id);
CREATE INDEX IF NOT EXISTS employee_work_daily_reports_author_idx
  ON employee_work_daily_reports (author_user_id, report_date DESC);
CREATE INDEX IF NOT EXISTS employee_work_daily_reports_updated_idx
  ON employee_work_daily_reports (wecom_updated_at DESC, record_id);

CREATE TABLE IF NOT EXISTS employee_work_daily_sync_runs (
  id bigserial PRIMARY KEY,
  source varchar(32) NOT NULL CHECK (source IN ('history', 'wecom')),
  status varchar(16) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'skipped')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  pulled_count integer NOT NULL DEFAULT 0 CHECK (pulled_count >= 0),
  inserted_count integer NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
  updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  unchanged_count integer NOT NULL DEFAULT 0 CHECK (unchanged_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  error_message text
);

CREATE INDEX IF NOT EXISTS employee_work_daily_sync_runs_started_idx
  ON employee_work_daily_sync_runs (started_at DESC, id DESC);
