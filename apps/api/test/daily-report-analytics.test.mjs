import assert from 'node:assert/strict'
import test from 'node:test'

import { DailyReportAnalyticsRepository } from '../dist/modules/employee/work-reports/daily-report-analytics-repository.js'
import { DailyReportAnalyticsService } from '../dist/modules/employee/work-reports/daily-report-analytics-service.js'

test('提交看板按员工去重并区分已提交、未提交和延后提交', async () => {
  const pool = { query: async () => ({ rows: [
    { id: 'EMP-0001', display_name: '张三', department_name: '研发中心', department_level2: '研发部', report_count: '2', delayed: false },
    { id: 'EMP-0002', display_name: '李四', department_name: '研发中心', department_level2: null, report_count: '1', delayed: true },
    { id: 'EMP-0003', display_name: '王五', department_name: '支持中心', department_level2: null, report_count: '0', delayed: false },
  ] }) }
  const result = await new DailyReportAnalyticsRepository(pool).dashboard('2026-09-01')
  assert.deepEqual({ expected: result.expected, submitted: result.submitted, missing: result.missing, delayed: result.delayed }, { expected: 3, submitted: 2, missing: 1, delayed: 1 })
  assert.equal(result.departments.find((item) => item.name === '研发中心')?.submitted, 2)
  assert.equal(result.employees[0].reportCount, 2)
})

test('日历以未提交优先，其次标记延后和全部提交', async () => {
  const pool = { query: async () => ({ rows: [
    { date: '2026-09-01', expected: '3', submitted: '3', delayed: '0' },
    { date: '2026-09-02', expected: '3', submitted: '3', delayed: '1' },
    { date: '2026-09-03', expected: '3', submitted: '2', delayed: '1' },
    { date: '2026-09-05', expected: '0', submitted: '0', delayed: '0' },
  ] }) }
  const result = await new DailyReportAnalyticsRepository(pool).calendar('2026-09')
  assert.deepEqual(result.map((item) => item.status), ['complete', 'delayed', 'missing', 'empty'])
})

test('员工日报档案仅查询在职员工，历史日报与数据检查仍保留历史记录', async () => {
  let statement = ''
  const pool = { query: async (sql) => { statement = sql; return { rows: [] } } }
  await new DailyReportAnalyticsRepository(pool).employeeProfiles()
  assert.match(statement, /WHERE employee\.status <> 'inactive'/)
})

test('统计服务校验视图所需日期与月份参数', async () => {
  const repository = { dashboard: async (date) => ({ date }), calendar: async (month) => ({ month }), employeeProfiles: async () => ['all'] }
  const service = new DailyReportAnalyticsService(repository)
  assert.deepEqual(await service.read(new URLSearchParams({ view: 'dashboard', date: '2026-09-01' })), { date: '2026-09-01' })
  assert.deepEqual(await service.read(new URLSearchParams({ view: 'calendar', month: '2026-09' })), { month: '2026-09' })
  assert.deepEqual(await service.read(new URLSearchParams({ view: 'employees' })), ['all'])
  await assert.rejects(() => service.read(new URLSearchParams({ view: 'calendar', month: '2026-13' })), /month/)
})
