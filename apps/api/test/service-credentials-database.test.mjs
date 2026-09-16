import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ServiceCredentialsService } from '../dist/modules/platform/service-credentials/service.js'

test('真实SQL：配置与脱敏审计原子保存，版本冲突/审计失败不覆盖旧密钥，生效请求持久化', { skip: process.env.HEGONGZUO_TEST_DATABASE !== '1' }, async () => {
  const { database } = await import('../dist/database.js')
  const client = await database.connect()
  const root = await mkdtemp(path.join(os.tmpdir(), 'hg-credential-db-'))
  let rejectAudit = false
  const connection = {
    query(sql, values) {
      if (rejectAudit && sql.startsWith('INSERT INTO platform_audit_logs')) throw new Error('fixture audit failure')
      return client.query(sql, values)
    }, release() {},
  }
  const isolated = { query: connection.query, connect: async () => connection }
  const service = new ServiceCredentialsService(isolated, root)
  const actor = { id: 'fixture-actor', displayName: '测试管理员' }
  const firstKey = 'fixture-first-service-credential-only'
  const nextKey = 'fixture-second-service-credential-only'
  try {
    const migration = await readFile(new URL('../migrations/040_platform_service_credentials.sql', import.meta.url), 'utf8')
    await client.query(migration.replace('CREATE TABLE IF NOT EXISTS platform_service_credentials', 'CREATE TEMP TABLE platform_service_credentials'))
    await client.query('CREATE TEMP TABLE platform_audit_logs (actor_account_id text,actor_display_name text,action text,target_type text,target_id text,detail jsonb)')
    await service.save('daily-report',firstKey,null,actor)
    const current = await service.store.effective('daily-report')
    assert.equal(current.key,firstKey)
    assert.ok(!(await client.query('SELECT encrypted_key FROM platform_service_credentials')).rows[0].encrypted_key.includes(firstKey))
    await assert.rejects(service.save('daily-report',nextKey,null,actor), /已被其他管理员更新/)
    rejectAudit=true
    await assert.rejects(service.save('daily-report',nextKey,current.revision,actor), /audit failure/)
    assert.equal((await service.store.effective('daily-report')).key,firstKey)
    rejectAudit=false
    await service.save('daily-report',nextKey,current.revision,actor)
    assert.equal((await service.store.effective('daily-report')).key,nextKey)
    await service.save('assistant',firstKey,null,actor)
    const assistant = await service.store.row('assistant')
    assert.equal(assistant.apply_status,'pending')
    assert.equal(assistant.restart_requested,false)
    assert.equal((await readFile(path.join(root,'.runtime/service-credential-tasks/apply.request'),'utf8')).trim(),'apply')
    await service.apply(assistant.revision,true,actor)
    const applied = await service.store.row('assistant')
    assert.equal(applied.restart_requested,true)
    assert.notEqual(applied.apply_request_id,assistant.apply_request_id)
    assert.equal(String(applied.updated_at),String(assistant.updated_at))
    const audit = JSON.stringify((await client.query('SELECT * FROM platform_audit_logs')).rows)
    assert.ok(!audit.includes(firstKey) && !audit.includes(nextKey) && !audit.includes('encrypted_key'))
    assert.equal((await client.query('SELECT count(*)::int AS total FROM platform_audit_logs')).rows[0].total,4)
  } finally { await client.query('ROLLBACK'); client.release(true); await database.end(); await rm(root,{recursive:true,force:true}) }
})
