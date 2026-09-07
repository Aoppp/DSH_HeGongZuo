CREATE TABLE IF NOT EXISTS platform_notifications (
  id bigserial PRIMARY KEY,
  account_id varchar(40) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  notification_type varchar(40) NOT NULL REFERENCES platform_notification_settings(notification_type) ON DELETE CASCADE,
  source_key varchar(160) NOT NULL,
  title varchar(160) NOT NULL,
  content text NOT NULL,
  target_path varchar(300) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz NULL,
  UNIQUE (account_id, source_key)
);
CREATE INDEX IF NOT EXISTS platform_notifications_account_created_idx ON platform_notifications (account_id, created_at DESC, id DESC);
