import assert from 'node:assert/strict'
import test from 'node:test'

import { createDailyReportSearch } from '../src/modules/employee/reports/daily-reports-api.ts'

test('日报查询只发送已填写的筛选条件和分页参数', () => {
  const search = createDailyReportSearch({
    startDate: '2026-08-01', endDate: '2026-08-31', department: ' 研发部 ', employee: ' 张三 ', keyword: ' 联调 ',
  }, 2, 50)
  assert.equal(search.get('startDate'), '2026-08-01')
  assert.equal(search.get('endDate'), '2026-08-31')
  assert.equal(search.get('department'), '研发部')
  assert.equal(search.get('employee'), '张三')
  assert.equal(search.get('keyword'), '联调')
  assert.equal(search.get('page'), '2')
  assert.equal(search.get('pageSize'), '50')
})

test('空筛选条件不会传入日报接口', () => {
  const search = createDailyReportSearch({ startDate: '', endDate: '', department: ' ', employee: '', keyword: '' }, 1, 20)
  assert.deepEqual([...search.entries()], [['page', '1'], ['pageSize', '20']])
})
