BEGIN;
-- 既有账号保留目录名称；新账号获得不可复用的随机空间标识。
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS runtime_key varchar(32);
UPDATE accounts SET runtime_key = account_id WHERE runtime_key IS NULL;
ALTER TABLE accounts ALTER COLUMN runtime_key SET DEFAULT ('u' || substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 31));
ALTER TABLE accounts ALTER COLUMN runtime_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_runtime_key_idx ON accounts(runtime_key);
CREATE TABLE IF NOT EXISTS account_runtime_identity_history (
  runtime_key varchar(32) PRIMARY KEY,
  allocated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO account_runtime_identity_history(runtime_key) SELECT runtime_key FROM accounts ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION reserve_account_runtime_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.runtime_key IS DISTINCT FROM OLD.runtime_key THEN
      RAISE EXCEPTION 'Account runtime identity is immutable';
    END IF;
  ELSE
    INSERT INTO account_runtime_identity_history(runtime_key) VALUES (NEW.runtime_key);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS accounts_runtime_identity_guard ON accounts;
CREATE TRIGGER accounts_runtime_identity_guard BEFORE INSERT OR UPDATE OF runtime_key ON accounts
FOR EACH ROW EXECUTE FUNCTION reserve_account_runtime_identity();
-- MAX(id)+1 在并发创建和删除后可能重复；序列不回收已用编号。
CREATE SEQUENCE IF NOT EXISTS account_id_sequence;
SELECT setval('account_id_sequence', GREATEST(
  (SELECT last_value FROM account_id_sequence),
  COALESCE((SELECT MAX(substring(id FROM '[0-9]+$')::bigint) FROM accounts), 0)
), true);
COMMIT;
