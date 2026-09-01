import { isCalendarDate } from '../work-records/work-records-source.js'
import type { DailyReportAnalyticsRepository } from './daily-report-analytics-repository.js'

export class DailyReportAnalyticsValidationError extends Error {}

function date(value: unknown, name: string): string {
  if (typeof value !== 'string' || !isCalendarDate(value)) throw new DailyReportAnalyticsValidationError(`${name} 日期格式无效。`)
  return value
}

function text(value: unknown, maximum = 160): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new DailyReportAnalyticsValidationError('查询参数格式无效。')
  const normalized = value.trim()
  if (normalized.length > maximum) throw new DailyReportAnalyticsValidationError('查询参数过长。')
  return normalized || null
}

function range(parameters: URLSearchParams): { startDate: string; endDate: string } {
  const startDate = date(parameters.get('startDate'), 'startDate')
  const endDate = date(parameters.get('endDate'), 'endDate')
  if (startDate > endDate) throw new DailyReportAnalyticsValidationError('startDate 不能晚于 endDate。')
  return { startDate, endDate }
}

export class DailyReportAnalyticsService {
  constructor(private readonly repository: DailyReportAnalyticsRepository) {}

  async read(parameters: URLSearchParams): Promise<unknown> {
    const view = parameters.get('view')
    if (view === 'dashboard') return this.repository.dashboard(date(parameters.get('date'), 'date'))
    if (view === 'calendar') {
      const month = parameters.get('month') ?? ''
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new DailyReportAnalyticsValidationError('month 格式无效。')
      return this.repository.calendar(month)
    }
    if (view === 'employees') { const dates = range(parameters); return this.repository.employeeProfiles(dates.startDate, dates.endDate) }
    if (view === 'department') {
      const dates = range(parameters)
      const department = text(parameters.get('department'))
      if (!department) throw new DailyReportAnalyticsValidationError('请选择部门。')
      return this.repository.departmentSummary(department, dates.startDate, dates.endDate)
    }
    if (view === 'quality') { const dates = range(parameters); return this.repository.quality(dates.startDate, dates.endDate) }
    if (view === 'summaries') return this.repository.listSummaries()
    throw new DailyReportAnalyticsValidationError('未知的日报统计视图。')
  }

  async createSummary(value: unknown, actorId: string): Promise<unknown> {
    if (!value || typeof value !== 'object') throw new DailyReportAnalyticsValidationError('汇总参数无效。')
    const input = value as Record<string, unknown>
    const periodType = input.periodType
    if (periodType !== 'week' && periodType !== 'month') throw new DailyReportAnalyticsValidationError('汇总周期无效。')
    const startDate = date(input.startDate, 'startDate'), endDate = date(input.endDate, 'endDate')
    if (startDate > endDate) throw new DailyReportAnalyticsValidationError('开始日期不能晚于结束日期。')
    return this.repository.createSummary(periodType, startDate, endDate, text(input.department), actorId)
  }

  async confirmSummary(rawId: string, actorId: string): Promise<unknown | null> {
    const id = Number(rawId)
    if (!Number.isSafeInteger(id) || id < 1) throw new DailyReportAnalyticsValidationError('汇总编号无效。')
    return this.repository.confirmSummary(id, actorId)
  }
}
