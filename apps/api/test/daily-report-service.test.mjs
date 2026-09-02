import assert from 'node:assert/strict'
import test from 'node:test'

import { DailyReportRepository } from '../dist/modules/employee/work-reports/daily-report-repository.js'
import { DailyReportService, parseDailyReportFilters } from '../dist/modules/employee/work-reports/daily-report-service.js'

function parameters(values) {
  return new URLSearchParams(values)
}

test('员工查询使用员工标识或姓名', () => {
  assert.equal(parseDailyReportFilters(parameters({ employee: '张三' })).employee, '张三')
})

test('部门查询使用部门标识或名称', () => {
  assert.equal(parseDailyReportFilters(parameters({ department: '研发部' })).department, '研发部')
})

test('支持单日和日期范围查询', () => {
  assert.deepEqual(parseDailyReportFilters(parameters({ startDate: '2026-08-01', endDate: '2026-08-31' })), {
    startDate: '2026-08-01', endDate: '2026-08-31', page: 1, pageSize: 20,
  })
  assert.throws(() => parseDailyReportFilters(parameters({ startDate: '2026-09-01', endDate: '2026-08-01' })), /startDate/)
})

test('分页默认值、指定值和上限有效', () => {
  assert.deepEqual(parseDailyReportFilters(parameters({ page: '3', pageSize: '50' })), { page: 3, pageSize: 50 })
  assert.throws(() => parseDailyReportFilters(parameters({ pageSize: '101' })), /pageSize/)
})

test('关键词参数交由仓储搜索三个正文字段', async () => {
  let received
  const store = {
    list: async (filters) => {
      received = filters
      return { reports: [], total: 0, page: filters.page, pageSize: filters.pageSize, totalPages: 0 }
    },
    get: async () => null,
  }
  await new DailyReportService(store).list(parameters({ keyword: '联调', page: '2' }))
  assert.equal(received.keyword, '联调')
  assert.equal(received.page, 2)
})

test('仓储组合员工、部门、日期、关键词和分页条件', async () => {
  const calls = []
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values })
      return calls.length === 1 ? { rows: [{ total: '21' }] } : { rows: [] }
    },
  }
  const result = await new DailyReportRepository(pool).list({
    employee: '张三', department: '研发部', startDate: '2026-08-01', endDate: '2026-08-31', keyword: '联调', page: 2, pageSize: 10,
  })
  assert.match(calls[1].sql, /author_user_id/)
  assert.match(calls[1].sql, /department_id/)
  assert.match(calls[1].sql, /LEFT JOIN employees/)
  assert.match(calls[1].sql, /today_summary ILIKE/)
  assert.deepEqual(calls[1].values, ['张三', '研发部', '2026-08-01', '2026-08-31', '%联调%', 10, 10])
  assert.equal(result.totalPages, 3)
})

test('单条详情返回统一字段且不暴露原始同步数据', async () => {
  const pool = {
    query: async () => ({ rows: [{
      record_id: 'record-001', author_user_id: 'zhangsan', author_name: '张三', employee_id: 'EMP-0001', employee_name: '张三',
      employee_department_name: '研发中心', employee_department_level2: '研发一部', source_department_id: 'd1', source_department_name: '化学合成',
      report_date: new Date('2026-08-07T16:00:00Z'), submitted_at: new Date('2026-08-08T02:00:00Z'), today_summary: '完成联调', tomorrow_plan: '测试', other_items: null,
      attachments: [{ name: 'a.pdf', url: 'https://example.test/a.pdf' }], wecom_updated_at: new Date('2026-08-08T03:00:00Z'),
    }] }),
  }
  const report = await new DailyReportRepository(pool).get('record-001')
  assert.equal(report.record_id, 'record-001')
  assert.deepEqual(report.employee, { user_id: 'zhangsan', employee_id: 'EMP-0001', name: '张三', matched: true })
  assert.deepEqual(report.department, { name: '研发中心', level2: '研发一部' })
  assert.deepEqual(report.source_department, { id: 'd1', name: '化学合成' })
  assert.equal(report.report_date, '2026-08-08')
  assert.equal(report.other, null)
  assert.equal(report.update_time, '2026-08-08T03:00:00.000Z')
  assert.equal('raw_values' in report, false)
})

test('日报详情通过服务查询并校验编号', async () => {
  let received = ''
  const expected = { record_id: 'record-001' }
  const service = new DailyReportService({
    list: async () => ({ reports: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    get: async (id) => { received = id; return expected },
    employeeHistory: async () => null,
  })
  assert.equal(await service.get(' record-001 '), expected)
  assert.equal(received, 'record-001')
  assert.throws(() => service.get(' '), /日报编号/)
})

test('员工历史日报限制分页大小', async () => {
  let received
  const service = new DailyReportService({
    list: async () => ({ reports: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    get: async () => null,
    employeeHistory: async (employeeId, page, pageSize) => {
      received = { employeeId, page, pageSize }
      return { reports: [], linked: true, total: 0, page, pageSize, totalPages: 0 }
    },
  })
  await service.employeeHistory(' EMP-0001 ', parameters({ page: '2', pageSize: '20' }))
  assert.deepEqual(received, { employeeId: 'EMP-0001', page: 2, pageSize: 20 })
  assert.throws(() => service.employeeHistory('EMP-0001', parameters({ pageSize: '51' })), /pageSize/)
})

test('员工历史日报只返回日期和工作内容', async () => {
  let calls = 0
  const pool = {
    query: async () => {
      calls += 1
      if (calls === 1) return { rows: [{ wecom_user_id: 'wecom-001' }] }
      if (calls === 2) return { rows: [{ total: '1' }] }
      return { rows: [{ record_id: 'report-1', report_date: '2026-09-02', today_summary: '  完成数据整理  ' }] }
    },
  }
  const history = await new DailyReportRepository(pool).employeeHistory('EMP-0001', 1, 20)
  assert.deepEqual(history.reports, [{ id: 'report-1', date: '2026-09-02', content: '完成数据整理' }])
  assert.equal(history.linked, true)
})
