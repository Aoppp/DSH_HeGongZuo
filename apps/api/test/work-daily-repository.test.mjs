import assert from 'node:assert/strict'
import test from 'node:test'

import { WorkDailyRepository } from '../dist/modules/employee/work-reports/work-daily-repository.js'

test('最新日报同步记录按数字主键倒序读取', async () => {
  let statement = ''
  const pool = { query: async (sql) => { statement = sql; return { rows: [] } } }
  await new WorkDailyRepository(pool).latestRun()
  assert.match(statement, /ORDER BY employee_work_daily_sync_runs\.id DESC/)
})
