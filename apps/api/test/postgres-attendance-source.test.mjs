import assert from 'node:assert/strict'
import test from 'node:test'

import { PostgresAttendanceSource } from '../dist/modules/employee/attendance/postgres-attendance-source.js'

test('考勤页面读取已同步记录，并按员工汇总上下班打卡和企业微信异常状态', async () => {
  const source = new PostgresAttendanceSource({ query: async () => ({ rows: [
    { id: '1', employee_id: 'EMP-0001', display_name: '张三', department_name: '研发部', checkin_time: new Date('2026-09-03T00:01:00Z'), checkin_type: '上班打卡', exception_type: '正常', location_title: '公司', standard_checkin_time: new Date('2026-09-03T00:00:00Z') },
    { id: '2', employee_id: 'EMP-0001', display_name: '张三', department_name: '研发部', checkin_time: new Date('2026-09-03T10:10:00Z'), checkin_type: '下班打卡', exception_type: '早退', location_title: '公司', standard_checkin_time: new Date('2026-09-03T10:00:00Z') },
  ] }) })
  const snapshot = await source.snapshot('2026-09-03')
  assert.equal(snapshot.source, 'wecom')
  assert.deepEqual(snapshot.attendance, {
    expected: 1, normal: 0, exceptions: 1,
    records: [{ id: 'EMP-0001-2026-09-03', externalUserId: 'EMP-0001', employeeName: '张三', departmentName: '研发部', scheduledStart: '08:00', scheduledEnd: '18:00', checkInAt: '2026-09-03T00:01:00.000Z', checkOutAt: '2026-09-03T10:10:00.000Z', status: 'early_leave', location: '公司', checkInLocation: '公司', checkOutLocation: '公司', details: [
      { type: '上班打卡', time: '2026-09-03T00:01:00.000Z', standardTime: '08:00', status: 'normal', exceptionType: '正常', location: '公司' },
      { type: '下班打卡', time: '2026-09-03T10:10:00.000Z', standardTime: '18:00', status: 'early_leave', exceptionType: '早退', location: '公司' },
    ] }],
  })
})
