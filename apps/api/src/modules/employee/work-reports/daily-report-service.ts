import { isCalendarDate } from '../work-records/work-records-source.js'

import type { DailyReport, DailyReportFilters, DailyReportPage, EmployeeReportHistoryPage } from './daily-report-repository.js'

export interface DailyReportStore {
  list(filters: DailyReportFilters): Promise<DailyReportPage>
  get(recordId: string): Promise<DailyReport | null>
  employeeHistory(employeeId: string, page: number, pageSize: number): Promise<EmployeeReportHistoryPage | null>
}

export class DailyReportValidationError extends Error {}

function optionalParameter(parameters: URLSearchParams, name: string, maximumLength: number): string | undefined {
  const value = parameters.get(name)?.trim()
  if (!value) return undefined
  if (value.length > maximumLength) throw new DailyReportValidationError(`${name} 查询参数过长。`)
  return value
}

function positiveInteger(parameters: URLSearchParams, name: string, defaultValue: number, maximum: number): number {
  const raw = parameters.get(name)
  if (raw === null || raw === '') return defaultValue
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new DailyReportValidationError(`${name} 必须是 1 至 ${maximum} 之间的整数。`)
  }
  return value
}

export function parseDailyReportFilters(parameters: URLSearchParams): DailyReportFilters {
  const employee = optionalParameter(parameters, 'employee', 160)
  const department = optionalParameter(parameters, 'department', 240)
  const startDate = optionalParameter(parameters, 'startDate', 10)
  const endDate = optionalParameter(parameters, 'endDate', 10)
  const keyword = optionalParameter(parameters, 'keyword', 200)
  if (startDate && !isCalendarDate(startDate)) throw new DailyReportValidationError('startDate 日期格式无效。')
  if (endDate && !isCalendarDate(endDate)) throw new DailyReportValidationError('endDate 日期格式无效。')
  if (startDate && endDate && startDate > endDate) throw new DailyReportValidationError('startDate 不能晚于 endDate。')
  return {
    ...(employee ? { employee } : {}),
    ...(department ? { department } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(keyword ? { keyword } : {}),
    page: positiveInteger(parameters, 'page', 1, 1_000_000),
    pageSize: positiveInteger(parameters, 'pageSize', 20, 100),
  }
}

export class DailyReportService {
  constructor(private readonly store: DailyReportStore) {}

  list(parameters: URLSearchParams): Promise<DailyReportPage> {
    return this.store.list(parseDailyReportFilters(parameters))
  }

  get(recordId: string): Promise<DailyReport | null> {
    const id = recordId.trim()
    if (!id || id.length > 160) throw new DailyReportValidationError('日报编号无效。')
    return this.store.get(id)
  }

  employeeHistory(employeeId: string, parameters: URLSearchParams): Promise<EmployeeReportHistoryPage | null> {
    const id = employeeId.trim()
    if (!id || id.length > 80) throw new DailyReportValidationError('员工编号无效。')
    return this.store.employeeHistory(
      id,
      positiveInteger(parameters, 'page', 1, 1_000_000),
      positiveInteger(parameters, 'pageSize', 20, 50),
    )
  }
}
