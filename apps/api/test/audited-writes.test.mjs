import assert from 'node:assert/strict'
import test from 'node:test'
import { inTransaction } from '../dist/storage/transaction.js'
import { EmployeeWriteService } from '../dist/modules/employee/employee-write-service.js'
import { MeetingWriteService } from '../dist/modules/meetings/meeting-write-service.js'
import { PlatformManagementService } from '../dist/modules/platform/platform-management.js'
import { parseEmployeeInput } from '../dist/modules/employee/employee-input.js'

const actor = { id: 'ACC-1', displayName: '测试管理员' }
const base = { displayName: '测试', departmentName: '部门', jobTitle: '岗位', workPhone: '13800138000', hireDate: '2026-01-01', status: 'active', employmentType: 'full_time' }
const row = { id: 'EMP-0083', display_name: '测试', department_name: '部门', job_title: '岗位', work_phone: '13800138000', hire_date: '2026-01-01', status: 'active', employment_type: 'full_time' }
function harness({ failAudit = false, failCommit = false } = {}) {
  const calls = []
  const connection = {
    query: async (sql, values) => {
      calls.push({ sql, values })
      if (failAudit && sql.startsWith('INSERT INTO platform_audit_logs')) throw new Error('审计写入失败')
      if (failCommit && sql === 'COMMIT') throw new Error('提交失败')
      if (sql.includes("nextval('employee_id_seq')")) return { rows: [{ value: '83' }] }
      if (sql.startsWith('SELECT') && sql.includes('FROM employees WHERE id')) return { rows: [row] }
      if (sql.startsWith('INSERT INTO employees') || sql.startsWith('UPDATE employees')) return { rows: [{ ...row, display_name: '已更新' }] }
      if (sql.startsWith('SELECT * FROM meeting_records')) return { rows: [{ id: '26001', summary: '旧内容' }] }
      if (sql.startsWith('UPDATE meeting_records')) return { rows: [{ id: '26001', summary: '新内容' }] }
      return { rows: [] }
    },
    release: () => calls.push({ sql: 'RELEASE' }),
  }
  return { calls, pool: { connect: async () => connection } }
}

test('新增员工嵌套仓储不提前提交，审计失败整体回滚', async () => {
  const { pool, calls } = harness({ failAudit: true })
  await assert.rejects(new EmployeeWriteService(pool).create(parseEmployeeInput(base), actor), /审计写入失败/)
  assert.equal(calls.filter((call) => call.sql === 'BEGIN').length, 1)
  assert.equal(calls.filter((call) => call.sql === 'COMMIT').length, 0)
  assert.deepEqual(calls.slice(-2).map((call) => call.sql), ['ROLLBACK', 'RELEASE'])
})

test('编辑员工先锁定原档案，审计成功才提交，提交错误不冒充成功', async () => {
  const { pool, calls } = harness()
  await new EmployeeWriteService(pool).update(row.id, parseEmployeeInput({ ...base, displayName: '已更新' }), actor)
  assert.match(calls[1].sql, /FOR UPDATE$/)
  assert.match(calls[3].sql, /INSERT INTO platform_audit_logs/)
  assert.deepEqual(calls.slice(-2).map((call) => call.sql), ['COMMIT', 'RELEASE'])
  const failure = harness({ failCommit: true })
  await assert.rejects(inTransaction(failure.pool, async () => true), /提交失败/)
  assert.deepEqual(failure.calls.slice(-2).map((call) => call.sql), ['ROLLBACK', 'RELEASE'])
})

test('离职日期早于入职或非法日期不会写入，恢复在职清除旧离职字段', async () => {
  const { pool, calls } = harness()
  const service = new EmployeeWriteService(pool)
  await assert.rejects(service.depart(row.id, '2025-12-31', '测试', actor), /早于入职/)
  await assert.rejects(service.depart(row.id, '2026-02-30', '测试', actor), /无效/)
  assert.equal(calls.some((call) => call.sql.startsWith('UPDATE employees')), false)
  await service.update(row.id, parseEmployeeInput(base), actor)
  const update = calls.find((call) => call.sql.startsWith('UPDATE employees'))
  assert.match(update.sql, /departure_date = CASE WHEN \$8 <> 'inactive' THEN NULL/)
  assert.match(update.sql, /departure_reason = CASE WHEN \$8 <> 'inactive' THEN NULL/)
})

test('带简历与不带简历的档案保存都包含离职字段，无参数错位', async () => {
  for (const resume of [undefined, null, { fileName: '测试.pdf', mimeType: 'application/pdf', base64: Buffer.from('test').toString('base64') }]) {
    const { pool, calls } = harness()
    await new EmployeeWriteService(pool).update(row.id, parseEmployeeInput({ ...base, status: 'inactive', departureDate: '2026-09-01', departureReason: '原因', resume }), actor)
    const update = calls.find((call) => call.sql.startsWith('UPDATE employees'))
    assert.deepEqual(update.values.slice(-2), ['2026-09-01', '原因'])
    assert.equal(update.values.length, resume === undefined ? 38 : 41)
    assert.match(update.sql, new RegExp(`coalesce\\(\\$${update.values.length - 1}::date`))
  }
})

test('会议摘要和平台模块写入遇到审计失败均回滚', async () => {
  for (const operation of [
    (pool) => new MeetingWriteService(pool).updateSummary('26001', '新内容', actor),
    (pool) => new PlatformManagementService(pool).setModuleEnabled('employee-data', false, actor.id, actor.displayName),
  ]) {
    const { pool, calls } = harness({ failAudit: true })
    await assert.rejects(operation(pool), /审计写入失败/)
    assert.equal(calls.some((call) => call.sql === 'COMMIT'), false)
    assert.deepEqual(calls.slice(-2).map((call) => call.sql), ['ROLLBACK', 'RELEASE'])
  }
})
