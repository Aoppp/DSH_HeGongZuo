-- 账号系统：平台账号与会话
CREATE TABLE IF NOT EXISTS accounts (
  id varchar(32) PRIMARY KEY,
  account_id varchar(64) NOT NULL UNIQUE,
  display_name varchar(120) NOT NULL,
  password_hash text NOT NULL,
  role varchar(32) NOT NULL CHECK (role IN ('owner', 'developer')),
  status varchar(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash varchar(64) PRIMARY KEY,
  account_id varchar(32) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_account_id_idx ON sessions(account_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
