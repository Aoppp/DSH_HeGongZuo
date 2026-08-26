import assert from 'node:assert/strict'
import test from 'node:test'

import { MockEmployeeWorkRecordsSource } from '../dist/modules/employee/work-records/mock-work-records-source.js'
import { isCalendarDate } from '../dist/modules/employee/work-records/work-records-source.js'

test('考勤与汇报演示数据保持统一结构和动态汇报字段', async () => {
  const snapshot = await new MockEmployeeWorkRecordsSource().snapshot('2026-08-26')
  assert.equal(snapshot.connectionStatus, 'demo')
  assert.equal(snapshot.reports.submitted, snapshot.reports.records.length)
  assert.equal(snapshot.attendance.exceptions, snapshot.attendance.records.filter((record) => record.status !== 'normal').length)
  assert.ok(snapshot.reports.records.every((record) => record.fields.length > 0))
})

test('考勤与汇报仅接受真实日历日期', () => {
  assert.equal(isCalendarDate('2026-08-26'), true)
  assert.equal(isCalendarDate('2026-02-30'), false)
  assert.equal(isCalendarDate('26-08-26'), false)
})
