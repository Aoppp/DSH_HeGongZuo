import assert from 'node:assert/strict'
import test from 'node:test'
import { PostgresAttendanceSource } from '../dist/modules/employee/attendance/postgres-attendance-source.js'
import { WeComCheckinRepository } from '../dist/modules/employee/attendance/wecom-checkin-repository.js'
import { WeComLeaveRepository } from '../dist/modules/employee/attendance/wecom-leave-repository.js'

test('真实SQL：跨天请假不覆盖未请假的半天，同步日志和断点原子更新', { skip: process.env.HEGONGZUO_TEST_DATABASE !== '1' }, async () => {
  const { database } = await import('../dist/database.js')
  const client = await database.connect()
  try {
    await client.query('BEGIN')
    await client.query(`CREATE TEMP TABLE employees (id text,display_name text,department_name text,hire_date date,departure_date date) ON COMMIT DROP;
      CREATE TEMP TABLE employee_wecom_schedules (employee_id text,schedule_date date,schedule_id text) ON COMMIT DROP;
      CREATE TEMP TABLE employee_wecom_checkins (id int,employee_id text,checkin_time timestamptz,checkin_type text,exception_type text,location_title text,location_detail text,lat numeric,lng numeric,standard_checkin_time timestamptz) ON COMMIT DROP;
      CREATE TEMP TABLE employee_wecom_leaves (employee_id text,sp_status int,duration int,start_time timestamptz,end_time timestamptz) ON COMMIT DROP;
      INSERT INTO employees VALUES ('test','测试','部门','2026-01-01',NULL);
      INSERT INTO employee_wecom_schedules VALUES ('test','2026-09-01','1'),('test','2026-09-02','1'),('test','2026-09-03','1');
      INSERT INTO employee_wecom_leaves VALUES ('test',2,28800,'2026-09-01 14:00+08','2026-09-02 12:00+08');`)
    const source = new PostgresAttendanceSource(client)
    const first = (await source.snapshot('2026-09-01')).attendance.records[0]
    const last = (await source.snapshot('2026-09-02')).attendance.records[0]
    assert.equal(first.checkInState, 'missing')
    assert.equal(first.checkOutState, 'leave')
    assert.equal(last.checkInState, 'leave')
    assert.equal(last.checkOutState, 'missing')
    await client.query(`UPDATE employee_wecom_leaves SET start_time='2026-09-01 09:00+08',end_time='2026-09-01 17:00+08'`)
    const full = (await source.snapshot('2026-09-01')).attendance.records[0]
    assert.equal(full.checkInState, 'leave')
    assert.equal(full.checkOutState, 'leave')
    await client.query(`UPDATE employee_wecom_leaves SET start_time='2026-09-01 09:00+08',end_time='2026-09-02 09:00+08'`)
    assert.equal((await source.snapshot('2026-09-02')).attendance.records[0].checkInState, 'missing')

    for (const kind of ['checkin', 'leave']) {
      await client.query(`CREATE TEMP TABLE employee_wecom_${kind}_sync_runs (LIKE public.employee_wecom_${kind}_sync_runs INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP;
        CREATE TEMP TABLE employee_wecom_${kind}_sync_checkpoints (LIKE public.employee_wecom_${kind}_sync_checkpoints INCLUDING DEFAULTS INCLUDING INDEXES) ON COMMIT DROP;
        INSERT INTO employee_wecom_${kind}_sync_runs (id,source,start_date,end_date) VALUES (1,'incremental','2026-09-01','2026-09-02')`)
      const repository = kind === 'checkin' ? new WeComCheckinRepository(client) : new WeComLeaveRepository(client)
      const stats = { employees: 1, pulled: 0, inserted: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, approvals: 0, upserted: 0 }
      await repository.finishRun(1, 'succeeded', stats, '2026-09-02T00:00:00Z', null)
      assert.equal((await repository.checkpoint()), '2026-09-02T00:00:00.000Z')
      await client.query('SAVEPOINT invalid_finish')
      await assert.rejects(repository.finishRun(1, 'succeeded', { ...stats, failed: -1 }, '2026-09-03T00:00:00Z', null))
      await client.query('ROLLBACK TO SAVEPOINT invalid_finish')
      assert.equal((await repository.checkpoint()), '2026-09-02T00:00:00.000Z')
      await repository.finishRun(1, 'failed', stats, null, '测试失败')
      assert.equal((await repository.checkpoint()), '2026-09-02T00:00:00.000Z')
    }
  } finally {
    await client.query('ROLLBACK')
    client.release()
    await database.end()
  }
})
