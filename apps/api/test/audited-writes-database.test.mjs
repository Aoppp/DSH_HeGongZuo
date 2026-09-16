import assert from 'node:assert/strict'
import test from 'node:test'
import { EmployeeWriteService } from '../dist/modules/employee/employee-write-service.js'
import { parseEmployeeInput } from '../dist/modules/employee/employee-input.js'
import { MeetingWriteService } from '../dist/modules/meetings/meeting-write-service.js'

test('真实SQL：档案、离职日期、简历和审计一起提交，审计失败不留下业务修改', { skip: process.env.HEGONGZUO_TEST_DATABASE !== '1' }, async () => {
  const { database } = await import('../dist/database.js')
  const client = await database.connect()
  let rejectAudit = false
  const connection = {
    query: (sql, values) => {
      if (rejectAudit && sql.startsWith('INSERT INTO platform_audit_logs')) return Promise.reject(new Error('模拟审计失败'))
      return client.query(sql, values)
    },
    release() {},
  }
  const isolatedPool = { connect: async () => connection }
  try {
    // 会话级临时表/序列遮蔽同名生产对象，连接关闭即清除；不会消耗生产编号。
    await client.query(`CREATE TEMP TABLE employees (LIKE public.employees INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
      CREATE TEMP SEQUENCE employee_id_seq;
      CREATE TEMP TABLE platform_audit_logs (actor_account_id text,actor_display_name text,action text,target_type text,target_id text,detail jsonb);
      CREATE TEMP TABLE meeting_records (LIKE public.meeting_records INCLUDING DEFAULTS INCLUDING CONSTRAINTS);`)
    const service = new EmployeeWriteService(isolatedPool)
    const actor = { id: 'test-actor', displayName: '测试' }
    const base = { displayName: '测试员工', departmentName: '测试部门', jobTitle: '测试岗位', workPhone: '13800138000', employmentType: 'full_time', status: 'active', hireDate: '2026-01-01' }
    const employee = await service.create(parseEmployeeInput(base), actor)
    for (const resume of [undefined, null, { fileName: 'test.pdf', mimeType: 'application/pdf', base64: Buffer.from('test').toString('base64') }]) {
      const updated = await service.update(employee.id, parseEmployeeInput({ ...base, status: 'inactive', departureDate: '2026-09-02', departureReason: '测试原因', resume }), actor)
      assert.equal(updated.departureDate, '2026-09-02')
      assert.equal(updated.departureReason, '测试原因')
    }
    const restored = await service.update(employee.id, parseEmployeeInput(base), actor)
    assert.equal(restored.departureDate, null)
    assert.equal(restored.departureReason, null)
    rejectAudit = true
    await assert.rejects(service.update(employee.id, parseEmployeeInput({ ...base, displayName: '不应保存' }), actor), /模拟审计失败/)
    assert.equal((await client.query('SELECT display_name FROM employees WHERE id=$1', [employee.id])).rows[0].display_name, '测试员工')
    await assert.rejects(service.create(parseEmployeeInput({ ...base, displayName: '不应新增' }), actor), /模拟审计失败/)
    assert.equal((await client.query('SELECT count(*)::int AS count FROM employees')).rows[0].count, 1)
    await client.query(`INSERT INTO meeting_records (id,idempotency_hash,title,mode,started_at,ended_at,summary,transcript,participants)
      VALUES ('26001',repeat('0',64),'测试会议','chinese','2026-09-01 10:00+08','2026-09-01 11:00+08','原摘要','原文','[]')`)
    await assert.rejects(new MeetingWriteService(isolatedPool).updateSummary('26001', '不应保存的摘要', actor), /模拟审计失败/)
    assert.equal((await client.query("SELECT summary FROM meeting_records WHERE id='26001'")).rows[0].summary, '原摘要')
  } finally {
    await client.query('ROLLBACK')
    client.release(true)
    await database.end()
  }
})
