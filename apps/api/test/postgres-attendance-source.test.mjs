import assert from 'node:assert/strict'
import test from 'node:test'

import { PostgresAttendanceSource } from '../dist/modules/employee/attendance/postgres-attendance-source.js'

test('考勤页面读取已同步记录，并按员工汇总上下班打卡和企业微信异常状态', async () => {
  const source = new PostgresAttendanceSource({ query: async () => ({ rows: [
    { id: '1', schedule_date: '2026-09-03', employee_id: 'EMP-0001', display_name: '张三', department_name: '研发部', checkin_time: new Date('2026-09-03T00:01:00Z'), checkin_type: '上班打卡', exception_type: '正常', location_title: '公司', standard_checkin_time: new Date('2026-09-03T00:00:00Z') },
    { id: '2', schedule_date: '2026-09-03', employee_id: 'EMP-0001', display_name: '张三', department_name: '研发部', checkin_time: new Date('2026-09-03T10:10:00Z'), checkin_type: '下班打卡', exception_type: '早退', location_title: '公司', standard_checkin_time: new Date('2026-09-03T10:00:00Z') },
  ] }) })
  const snapshot = await source.snapshot('2026-09-03')
  assert.equal(snapshot.source, 'wecom')
  assert.deepEqual(snapshot.attendance, {
    expected: 1, normal: 0, exceptions: 1,
    records: [{ id: 'EMP-0001-2026-09-03', externalUserId: 'EMP-0001', employeeName: '张三', departmentName: '研发部', date: '2026-09-03', scheduledStart: '—', scheduledEnd: '—', checkInAt: '2026-09-03T00:01:00.000Z', checkOutAt: '2026-09-03T10:10:00.000Z', status: 'early_leave', location: '公司', checkInLocation: '公司', checkOutLocation: '公司', details: [
      { type: '上班打卡', time: '2026-09-03T00:01:00.000Z', standardTime: '08:00', status: 'normal', exceptionType: '正常', location: '公司' },
      { type: '下班打卡', time: '2026-09-03T10:10:00.000Z', standardTime: '18:00', status: 'early_leave', exceptionType: '早退', location: '公司' },
    ] }],
  })
})

test('上下班打卡缺失任意一项均为缺卡，实际时间保持空值', async () => {
  const source = new PostgresAttendanceSource({ query: async () => ({ rows: [
    { id: '1', schedule_date: '2026-09-03', employee_id: 'EMP-0001', display_name: '张三', department_name: '研发部', checkin_time: new Date('2026-09-03T01:00:00Z'), checkin_type: '上班打卡', exception_type: '正常', location_title: '公司', standard_checkin_time: null },
  ] }) })
  const [record] = (await source.snapshot('2026-09-03')).attendance.records
  assert.equal(record.status, 'missing')
  assert.equal(record.checkOutAt, null)
  assert.equal(record.scheduledStart, '—')
  assert.equal(record.scheduledEnd, '—')
})

test('9点后15分钟内为普通迟到，超过15分钟为严重迟到', async () => {
  const rows = [
    { id: '1', schedule_date: '2026-09-03', employee_id: 'EMP-0001', display_name: '张三', department_name: '研发部', checkin_time: new Date('2026-09-03T01:10:00Z'), checkin_type: '上班打卡', exception_type: '正常', location_title: '公司', standard_checkin_time: null },
    { id: '2', schedule_date: '2026-09-03', employee_id: 'EMP-0001', display_name: '张三', department_name: '研发部', checkin_time: new Date('2026-09-03T10:00:00Z'), checkin_type: '下班打卡', exception_type: '正常', location_title: '公司', standard_checkin_time: null },
    { id: '3', schedule_date: '2026-09-03', employee_id: 'EMP-0002', display_name: '李四', department_name: '研发部', checkin_time: new Date('2026-09-03T01:16:00Z'), checkin_type: '上班打卡', exception_type: '正常', location_title: '公司', standard_checkin_time: null },
    { id: '4', schedule_date: '2026-09-03', employee_id: 'EMP-0002', display_name: '李四', department_name: '研发部', checkin_time: new Date('2026-09-03T10:00:00Z'), checkin_type: '下班打卡', exception_type: '正常', location_title: '公司', standard_checkin_time: null },
  ]
  const records = (await new PostgresAttendanceSource({ query: async () => ({ rows }) }).snapshot('2026-09-03')).attendance.records
  assert.equal(records.find((record) => record.externalUserId === 'EMP-0001').status, 'late')
  assert.equal(records.find((record) => record.externalUserId === 'EMP-0002').status, 'late_severe')
})

test('员工历史查询限定员工，异常排行按迟到次数优先排序', async () => {
  const calls = []
  const rows = [
    { id: '1', schedule_date: '2026-09-03', employee_id: 'EMP-0001', display_name: '张三', department_name: '研发部', checkin_time: new Date('2026-09-03T01:16:00Z'), checkin_type: '上班打卡', exception_type: '正常', location_title: '公司', standard_checkin_time: null },
    { id: '2', schedule_date: '2026-09-03', employee_id: 'EMP-0001', display_name: '张三', department_name: '研发部', checkin_time: new Date('2026-09-03T10:00:00Z'), checkin_type: '下班打卡', exception_type: '正常', location_title: '公司', standard_checkin_time: null },
    { id: null, schedule_date: '2026-09-03', employee_id: 'EMP-0002', display_name: '李四', department_name: '研发部', checkin_time: null, checkin_type: null, exception_type: null, location_title: null, standard_checkin_time: null },
  ]
  const source = new PostgresAttendanceSource({ query: async (sql, values) => { calls.push({ sql, values }); return { rows } } })
  await source.employeeHistory('EMP-0001')
  assert.match(calls[0].sql, /employee\.id = \$3/)
  assert.equal(calls[0].values[2], 'EMP-0001')
  const rankings = await source.anomalyRankings('2026-09')
  assert.equal(rankings[0].employeeName, '张三')
  assert.equal(rankings[0].lateCount, 1)
  assert.equal(rankings[0].severeLateCount, 1)
  assert.equal(rankings[1].missingCount, 1)
})

test('历史考勤按查询日期与入离职日期判断，不受员工当前状态影响', async () => {
  let statement = ''
  const source = new PostgresAttendanceSource({ query: async (sql) => { statement = sql; return { rows: [] } } })
  await source.snapshot('2026-08-01')
  assert.match(statement, /employee\.hire_date <= schedule\.schedule_date/)
  assert.match(statement, /employee\.departure_date IS NULL OR employee\.departure_date >= schedule\.schedule_date/)
  assert.doesNotMatch(statement, /employee\.status <> 'inactive'/)
})
