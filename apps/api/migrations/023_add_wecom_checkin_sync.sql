-- 企业微信打卡原始数据、同步检查点与运行日志。
CREATE TABLE IF NOT EXISTS employee_wecom_checkins (
  id bigserial PRIMARY KEY,
  employee_id varchar(32) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  wecom_user_id varchar(160) NOT NULL,
  wecom_record_key char(64) NOT NULL,
  checkin_time timestamptz NOT NULL,
  checkin_type varchar(64) NOT NULL,
  exception_type varchar(64),
  location_title text,
  location_detail text,
  notes text,
  wifiname text,
  wifi_mac varchar(128),
  device_id varchar(255),
  lat numeric,
  lng numeric,
  group_name text,
  group_id varchar(160),
  schedule_id varchar(160),
  standard_checkin_time timestamptz,
  raw_data jsonb NOT NULL CHECK (jsonb_typeof(raw_data) = 'object'),
  content_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_wecom_checkins_record_key_key UNIQUE (wecom_record_key)
);

CREATE INDEX IF NOT EXISTS employee_wecom_checkins_employee_time_idx
  ON employee_wecom_checkins (employee_id, checkin_time DESC, id DESC);
CREATE INDEX IF NOT EXISTS employee_wecom_checkins_wecom_user_time_idx
  ON employee_wecom_checkins (wecom_user_id, checkin_time DESC, id DESC);
CREATE INDEX IF NOT EXISTS employee_wecom_checkins_time_idx
  ON employee_wecom_checkins (checkin_time DESC, id DESC);

CREATE TABLE IF NOT EXISTS employee_wecom_checkin_sync_checkpoints (
  name varchar(80) PRIMARY KEY,
  checkpoint_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_wecom_checkin_sync_runs (
  id bigserial PRIMARY KEY,
  source varchar(32) NOT NULL CHECK (source IN ('history', 'incremental', 'manual')),
  status varchar(16) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'skipped')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  start_date date NOT NULL,
  end_date date NOT NULL,
  employee_count integer NOT NULL DEFAULT 0 CHECK (employee_count >= 0),
  pulled_count integer NOT NULL DEFAULT 0 CHECK (pulled_count >= 0),
  inserted_count integer NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
  updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  unchanged_count integer NOT NULL DEFAULT 0 CHECK (unchanged_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  checkpoint_before timestamptz,
  checkpoint_after timestamptz,
  error_message text
);

CREATE INDEX IF NOT EXISTS employee_wecom_checkin_sync_runs_started_idx
  ON employee_wecom_checkin_sync_runs (started_at DESC, id DESC);
