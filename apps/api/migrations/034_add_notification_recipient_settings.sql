CREATE TABLE IF NOT EXISTS platform_notification_settings (
  notification_type varchar(40) PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_by_account_id varchar(40) REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_notification_settings_type_check CHECK (notification_type IN ('contract', 'daily_report', 'attendance'))
);

CREATE TABLE IF NOT EXISTS platform_notification_recipients (
  notification_type varchar(40) NOT NULL REFERENCES platform_notification_settings(notification_type) ON DELETE CASCADE,
  account_id varchar(40) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (notification_type, account_id)
);
