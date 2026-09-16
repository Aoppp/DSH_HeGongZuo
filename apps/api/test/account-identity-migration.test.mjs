import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('真实 PostgreSQL：改名保留空间，删除后同名账号不继承空间，标识不可更改复用', { skip: process.env.HEGONGZUO_TEST_DATABASE !== '1' }, async () => {
  const { pool } = await import('../scripts/database.mjs')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const schema = `hg_identity_test_${randomUUID().replaceAll('-', '')}`
    await client.query(`CREATE SCHEMA ${schema}`)
    await client.query(`SET LOCAL search_path TO ${schema}`)
    await client.query('CREATE TABLE accounts (id varchar(32) PRIMARY KEY, account_id varchar(64) UNIQUE NOT NULL)')
    await client.query("INSERT INTO accounts VALUES ('ACC-0007', 'original')")
    const migration = (await readFile(new URL('../migrations/039_stable_account_runtime_identity.sql', import.meta.url), 'utf8')).replace(/^BEGIN;\s*/m, '').replace(/^COMMIT;\s*/m, '')
    await client.query(migration)
    await client.query(migration)
    await client.query("UPDATE accounts SET account_id='renamed' WHERE id='ACC-0007'")
    assert.equal((await client.query("SELECT runtime_key FROM accounts WHERE id='ACC-0007'")).rows[0].runtime_key, 'original')
    await client.query('SAVEPOINT immutable')
    await assert.rejects(client.query("UPDATE accounts SET runtime_key='different' WHERE id='ACC-0007'"), /immutable/)
    await client.query('ROLLBACK TO SAVEPOINT immutable')
    await client.query("DELETE FROM accounts WHERE id='ACC-0007'")
    const next = (await client.query("INSERT INTO accounts(id,account_id) VALUES ('ACC-0008','original') RETURNING runtime_key")).rows[0].runtime_key
    assert.notEqual(next, 'original')
    assert.match(next, /^u[a-f0-9]{31}$/)
    await client.query('SAVEPOINT reused')
    await assert.rejects(client.query("INSERT INTO accounts(id,account_id,runtime_key) VALUES ('ACC-0009','another','original')"), /duplicate/)
    await client.query('ROLLBACK TO SAVEPOINT reused')
    const first = (await client.query("SELECT nextval('account_id_sequence') AS value")).rows[0].value
    const second = (await client.query("SELECT nextval('account_id_sequence') AS value")).rows[0].value
    assert.equal(Number(first), 8)
    assert.equal(Number(second), 9)
  } finally {
    await client.query('ROLLBACK')
    client.release()
    await pool.end()
  }
})
