CREATE TABLE IF NOT EXISTS employee_work_report_summaries (
  id bigserial PRIMARY KEY,
  period_type varchar(16) NOT NULL CHECK (period_type IN ('week', 'month')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  department_name varchar(120),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  created_by varchar(64) NOT NULL REFERENCES accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by varchar(64) REFERENCES accounts(id),
  confirmed_at timestamptz,
  CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS employee_work_report_summaries_period_idx
  ON employee_work_report_summaries (start_date DESC, end_date DESC, id DESC);
