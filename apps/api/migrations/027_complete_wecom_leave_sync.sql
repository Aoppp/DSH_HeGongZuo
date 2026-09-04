DO $$
BEGIN
  IF to_regclass('employee_wecom_leave_records') IS NOT NULL AND to_regclass('employee_wecom_leaves') IS NULL THEN
    ALTER TABLE employee_wecom_leave_records RENAME TO employee_wecom_leaves;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_wecom_leaves' AND column_name='approval_no') THEN
    ALTER TABLE employee_wecom_leaves RENAME COLUMN approval_no TO sp_no;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_wecom_leaves' AND column_name='starts_at') THEN
    ALTER TABLE employee_wecom_leaves RENAME COLUMN starts_at TO start_time;
    ALTER TABLE employee_wecom_leaves RENAME COLUMN ends_at TO end_time;
    ALTER TABLE employee_wecom_leaves RENAME COLUMN duration_seconds TO duration;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_wecom_leaves' AND column_name='segment_index') THEN
    EXECUTE 'DELETE FROM employee_wecom_leaves older USING employee_wecom_leaves newer
      WHERE older.sp_no = newer.sp_no AND older.segment_index > newer.segment_index';
  END IF;
END $$;

ALTER TABLE employee_wecom_leaves DROP CONSTRAINT IF EXISTS employee_wecom_leave_records_pkey;
ALTER TABLE employee_wecom_leaves DROP COLUMN IF EXISTS segment_index;
ALTER TABLE employee_wecom_leaves ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE employee_wecom_leaves ADD COLUMN IF NOT EXISTS sp_status integer NOT NULL DEFAULT 2;
ALTER TABLE employee_wecom_leaves ADD COLUMN IF NOT EXISTS apply_time timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='employee_wecom_leaves'::regclass AND contype='p') THEN
    ALTER TABLE employee_wecom_leaves ADD PRIMARY KEY (sp_no);
  END IF;
END $$;

DROP INDEX IF EXISTS employee_wecom_leave_records_employee_time_idx;
CREATE INDEX IF NOT EXISTS employee_wecom_leaves_employee_time_idx ON employee_wecom_leaves (employee_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS employee_wecom_leaves_status_time_idx ON employee_wecom_leaves (sp_status, start_time, end_time);

CREATE TABLE IF NOT EXISTS employee_wecom_leave_sync_checkpoints (
  name varchar(32) PRIMARY KEY,
  checkpoint_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_wecom_leave_sync_runs (
  id bigserial PRIMARY KEY,
  source varchar(32) NOT NULL CHECK (source IN ('history', 'incremental')),
  status varchar(16) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  start_date date NOT NULL,
  end_date date NOT NULL,
  approval_count integer NOT NULL DEFAULT 0 CHECK (approval_count >= 0),
  upserted_count integer NOT NULL DEFAULT 0 CHECK (upserted_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  checkpoint_before timestamptz,
  checkpoint_after timestamptz,
  error_message text
);
CREATE INDEX IF NOT EXISTS employee_wecom_leave_sync_runs_started_idx ON employee_wecom_leave_sync_runs (started_at DESC, id DESC);
