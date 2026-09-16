-- 服务密钥仅保存认证加密后的密文，解密主密钥保存在服务器受限目录。
CREATE TABLE IF NOT EXISTS platform_service_credentials (
  service_id varchar(32) PRIMARY KEY CHECK (service_id IN ('assistant', 'daily-report')),
  encrypted_key text NOT NULL,
  revision uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_name varchar(120) NOT NULL,
  apply_status varchar(16) NOT NULL CHECK (apply_status IN ('pending', 'succeeded', 'failed')),
  apply_request_id uuid NOT NULL,
  apply_requested_at timestamptz NOT NULL DEFAULT now(),
  restart_requested boolean NOT NULL DEFAULT false,
  applied_at timestamptz
);
