ALTER TABLE platform_notifications ADD COLUMN IF NOT EXISTS resolved_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS platform_notifications_account_active_idx ON platform_notifications (account_id, resolved_at, created_at DESC, id DESC);
