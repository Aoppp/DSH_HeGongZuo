import assert from 'node:assert/strict'
import test from 'node:test'
import { SyncedWorkRecordsSource } from '../dist/modules/employee/work-records/synced-work-records-source.js'

test('驾驶舱复用真实日报统计和考勤，不以日报条数充当人数', async () => {
  const dates = []
  const source = new SyncedWorkRecordsSource(
    { dashboard: async (date) => { dates.push(date); return { expected: 80, submitted: 65, missing: 15 } } },
    { analysisRecords: async (start, end) => { dates.push(start, end); return [{ record_id: 'R1', employee: { name: '测试', user_id: 'user' }, department: { name: '部门' }, submit_time: '2026-09-01T10:00:00Z', today_summary: '内容' }] } },
    { snapshot: async (date) => { dates.push(date); return { attendance: { expected: 82, normal: 70, exceptions: 8, records: [] } } } },
  )
  const result = await source.snapshot('2026-09-01')
  assert.deepEqual(dates, Array(4).fill('2026-09-01'))
  assert.equal(result.source, 'wecom')
  assert.equal(result.reports.submitted, 65)
  assert.equal(result.reports.records.length, 1)
  assert.equal(result.attendance.expected, 82)
})
