import { isCalendarDate } from '../work-records/work-records-source.js'
import type { DailyReportAnalyticsRepository } from './daily-report-analytics-repository.js'

export class DailyReportAnalyticsValidationError extends Error {}

function date(value: unknown, name: string): string {
  if (typeof value !== 'string' || !isCalendarDate(value)) throw new DailyReportAnalyticsValidationError(`${name} 日期格式无效。`)
  return value
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
    if (view === 'employees') return this.repository.employeeProfiles()
    if (view === 'quality') { const dates = range(parameters); return this.repository.quality(dates.startDate, dates.endDate) }
    throw new DailyReportAnalyticsValidationError('未知的日报统计视图。')
  }
}
