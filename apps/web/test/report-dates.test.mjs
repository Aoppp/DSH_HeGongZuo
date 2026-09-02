import assert from 'node:assert/strict'
import test from 'node:test'

import { shanghaiCalendarDate, shiftCalendarDate } from '../src/modules/employee/reports/report-dates.ts'

test('提交看板日期按上海时区计算', () => {
  assert.equal(shanghaiCalendarDate(new Date('2026-09-01T16:30:00Z')), '2026-09-02')
})

test('提交看板可切换前一天和下一天', () => {
  assert.equal(shiftCalendarDate('2026-09-01', -1), '2026-08-31')
  assert.equal(shiftCalendarDate('2026-09-01', 1), '2026-09-02')
})
