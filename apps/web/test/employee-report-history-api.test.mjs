import assert from 'node:assert/strict'
import test from 'node:test'

import { readDailyReports } from '../src/modules/employee/reports/daily-reports-api.ts'

test('员工历史日报按员工编号和页码读取', async () => {
  const originalFetch = globalThis.fetch
  let request
  globalThis.fetch = async (input, init) => {
    request = { input: String(input), init }
    return new Response(JSON.stringify({ reports: [], linked: true, total: 0, page: 2, pageSize: 20, totalPages: 0 }), { status: 200 })
  }
  try {
    await readDailyReports({ startDate: '', endDate: '', department: '', employee: 'EMP/0001', keyword: '' }, 2, 20)
    assert.equal(request.input, '/api/daily-reports?page=2&pageSize=20&employee=EMP%2F0001')
    assert.equal(request.init.credentials, 'same-origin')
  } finally {
    globalThis.fetch = originalFetch
  }
})
