CREATE TABLE IF NOT EXISTS employee_wecom_schedules (
  employee_id varchar(32) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  wecom_user_id varchar(160) NOT NULL,
  schedule_date date NOT NULL,
  schedule_id varchar(160) NOT NULL,
  schedule_name text,
  group_id varchar(160),
  group_name text,
  raw_data jsonb NOT NULL CHECK (jsonb_typeof(raw_data) = 'object'),
  content_hash char(64) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, schedule_date)
);
CREATE INDEX IF NOT EXISTS employee_wecom_schedules_date_idx ON employee_wecom_schedules (schedule_date, employee_id);
