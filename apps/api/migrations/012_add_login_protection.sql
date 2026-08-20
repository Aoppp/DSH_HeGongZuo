-- 登录安全：持久化账号失败计数与来源限流记录。
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0
    CHECK (failed_login_count >= 0),
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

CREATE TABLE IF NOT EXISTS login_attempts (
  id bigserial PRIMARY KEY,
  source_hash varchar(64) NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_source_attempted_idx
  ON login_attempts (source_hash, attempted_at DESC);

CREATE INDEX IF NOT EXISTS login_attempts_attempted_idx
  ON login_attempts (attempted_at);
