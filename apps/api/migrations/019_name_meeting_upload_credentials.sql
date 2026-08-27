-- 支持为不同会议设备创建、识别和撤销独立上传凭证。
ALTER TABLE meeting_upload_credentials
  ADD COLUMN IF NOT EXISTS name varchar(80) NOT NULL DEFAULT '线下会议电脑';

CREATE INDEX IF NOT EXISTS meeting_upload_credentials_active_idx
  ON meeting_upload_credentials (active, created_at DESC);
