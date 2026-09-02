import assert from 'node:assert/strict'
import test from 'node:test'

import { readEmployeeReportHistory } from '../src/modules/employee/data/employee-report-history-api.ts'

test('员工历史日报按员工编号和页码读取', async () => {
  const originalFetch = globalThis.fetch
  let request
  globalThis.fetch = async (input, init) => {
    request = { input: String(input), init }
    return new Response(JSON.stringify({ reports: [], linked: true, total: 0, page: 2, pageSize: 20, totalPages: 0 }), { status: 200 })
  }
  try {
    await readEmployeeReportHistory('EMP/0001', 2)
    assert.equal(request.input, '/api/employees/EMP%2F0001/daily-reports?page=2&pageSize=20')
    assert.equal(request.init.credentials, 'same-origin')
  } finally {
    globalThis.fetch = originalFetch
  }
})
