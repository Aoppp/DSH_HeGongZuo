CREATE TABLE IF NOT EXISTS account_notification_preferences (
  account_id varchar(40) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  notification_type varchar(40) NOT NULL CHECK (notification_type IN ('contract', 'daily_report', 'attendance')),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, notification_type)
);

INSERT INTO account_notification_preferences (account_id, notification_type, enabled)
SELECT account_id, notification_type, true FROM platform_notification_recipients
ON CONFLICT (account_id, notification_type) DO NOTHING;
