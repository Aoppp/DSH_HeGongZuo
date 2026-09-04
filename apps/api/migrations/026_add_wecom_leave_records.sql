CREATE TABLE IF NOT EXISTS employee_wecom_leave_records (
  approval_no varchar(160) NOT NULL,
  segment_index integer NOT NULL,
  employee_id varchar(32) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  wecom_user_id varchar(160) NOT NULL,
  leave_type text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  raw_data jsonb NOT NULL CHECK (jsonb_typeof(raw_data) = 'object'),
  content_hash char(64) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (approval_no, segment_index)
);

CREATE INDEX IF NOT EXISTS employee_wecom_leave_records_employee_time_idx
  ON employee_wecom_leave_records (employee_id, starts_at, ends_at);
