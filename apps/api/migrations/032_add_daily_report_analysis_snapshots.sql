CREATE TABLE IF NOT EXISTS daily_report_analysis_snapshots (
  id bigserial PRIMARY KEY,
  start_date date NOT NULL,
  end_date date NOT NULL,
  content text NOT NULL,
  report_references jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(report_references) = 'array'),
  report_count integer NOT NULL CHECK (report_count >= 0),
  created_by_account_id varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date <= end_date)
);
CREATE INDEX IF NOT EXISTS daily_report_analysis_snapshots_range_idx ON daily_report_analysis_snapshots (start_date, end_date, created_at DESC, id DESC);
