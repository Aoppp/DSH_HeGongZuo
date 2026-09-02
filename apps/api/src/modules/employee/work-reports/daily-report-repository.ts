import type { Pool } from 'pg'

import type { WorkDailyAttachment } from './work-daily-record.js'

export interface DailyReport {
  readonly record_id: string
  readonly employee: {
    readonly user_id: string | null
    readonly employee_id: string | null
    readonly name: string
    readonly matched: boolean
  }
  readonly department: {
    readonly name: string | null
    readonly level2: string | null
  }
  readonly source_department: {
    readonly id: string | null
    readonly name: string | null
  }
  readonly report_date: string
  readonly submit_time: string
  readonly today_summary: string | null
  readonly tomorrow_plan: string | null
  readonly other: string | null
  readonly attachments: readonly WorkDailyAttachment[]
  readonly update_time: string
}

export interface DailyReportFilters {
  readonly employee?: string
  readonly department?: string
  readonly startDate?: string
  readonly endDate?: string
  readonly keyword?: string
  readonly page: number
  readonly pageSize: number
}

export interface DailyReportPage {
  readonly reports: readonly DailyReport[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
  readonly totalPages: number
}

export interface EmployeeReportHistoryItem {
  readonly id: string
  readonly date: string
  readonly content: string
}

export interface EmployeeReportHistoryPage {
  readonly reports: readonly EmployeeReportHistoryItem[]
  readonly linked: boolean
  readonly total: number
  readonly page: number
  readonly pageSize: number
  readonly totalPages: number
}

interface DailyReportRow {
  readonly record_id: string
  readonly author_user_id: string | null
  readonly author_name: string
  readonly employee_id: string | null
  readonly employee_name: string | null
  readonly employee_department_name: string | null
  readonly employee_department_level2: string | null
  readonly source_department_id: string | null
  readonly source_department_name: string | null
  readonly report_date: string | Date
  readonly submitted_at: string | Date
  readonly today_summary: string | null
  readonly tomorrow_plan: string | null
  readonly other_items: string | null
  readonly attachments: unknown
  readonly wecom_updated_at: string | Date
}

const selectedColumns = `report.record_id, report.author_user_id, report.author_name,
  employee.id AS employee_id, employee.display_name AS employee_name,
  employee.department_name AS employee_department_name,
  employee.department_level2 AS employee_department_level2,
  report.department_id AS source_department_id, report.department_name AS source_department_name,
  report.report_date::text AS report_date, report.submitted_at, report.today_summary,
  report.tomorrow_plan, report.other_items, report.attachments, report.wecom_updated_at`

const joinedReports = `employee_work_daily_reports AS report
  LEFT JOIN employees AS employee ON employee.wecom_user_id = report.author_user_id`

function isoTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('日报时间字段无效。')
  return date.toISOString()
}

function calendarDate(value: string | Date): string {
  if (value instanceof Date) return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(value)
  return value.slice(0, 10)
}

function normalizedAttachments(value: unknown): readonly WorkDailyAttachment[] {
  return Array.isArray(value) ? value as readonly WorkDailyAttachment[] : []
}

function mapRow(row: DailyReportRow): DailyReport {
  return {
    record_id: row.record_id,
    employee: {
      user_id: row.author_user_id,
      employee_id: row.employee_id,
      name: row.employee_name ?? row.author_name,
      matched: row.employee_id !== null,
    },
    department: {
      name: row.employee_department_name ?? row.source_department_name,
      level2: row.employee_department_level2,
    },
    source_department: { id: row.source_department_id, name: row.source_department_name },
    report_date: calendarDate(row.report_date),
    submit_time: isoTimestamp(row.submitted_at),
    today_summary: row.today_summary,
    tomorrow_plan: row.tomorrow_plan,
    other: row.other_items,
    attachments: normalizedAttachments(row.attachments),
    update_time: isoTimestamp(row.wecom_updated_at),
  }
}

function whereClause(filters: DailyReportFilters): { readonly sql: string; readonly values: unknown[] } {
  const conditions: string[] = []
  const values: unknown[] = []
  const value = (item: unknown): string => {
    values.push(item)
    return `$${values.length}`
  }

  if (filters.employee) {
    const parameter = value(filters.employee)
    conditions.push(`(report.author_user_id = ${parameter} OR lower(report.author_name) = lower(${parameter})
      OR employee.id = ${parameter} OR lower(employee.display_name) = lower(${parameter}))`)
  }
  if (filters.department) {
    const parameter = value(filters.department)
    conditions.push(`(report.department_id = ${parameter} OR lower(report.department_name) = lower(${parameter})
      OR lower(employee.department_name) = lower(${parameter}) OR lower(employee.department_level2) = lower(${parameter}))`)
  }
  if (filters.startDate) conditions.push(`report.report_date >= ${value(filters.startDate)}::date`)
  if (filters.endDate) conditions.push(`report.report_date <= ${value(filters.endDate)}::date`)
  if (filters.keyword) {
    const parameter = value(`%${filters.keyword}%`)
    conditions.push(`(report.today_summary ILIKE ${parameter} OR report.tomorrow_plan ILIKE ${parameter} OR report.other_items ILIKE ${parameter})`)
  }
  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values }
}

export class DailyReportRepository {
  constructor(private readonly pool: Pool) {}

  async list(filters: DailyReportFilters): Promise<DailyReportPage> {
    const query = whereClause(filters)
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM ${joinedReports} ${query.sql}`,
      query.values,
    )
    const total = Number(countResult.rows[0]?.total ?? 0)
    const values = [...query.values, filters.pageSize, (filters.page - 1) * filters.pageSize]
    const rows = await this.pool.query<DailyReportRow>(`SELECT ${selectedColumns}
      FROM ${joinedReports} ${query.sql}
      ORDER BY report.report_date DESC, report.submitted_at DESC, report.record_id
      LIMIT $${values.length - 1} OFFSET $${values.length}`, values)
    return {
      reports: rows.rows.map(mapRow),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: total === 0 ? 0 : Math.ceil(total / filters.pageSize),
    }
  }

  async get(recordId: string): Promise<DailyReport | null> {
    const result = await this.pool.query<DailyReportRow>(`SELECT ${selectedColumns}
      FROM ${joinedReports} WHERE report.record_id = $1`, [recordId])
    return result.rows[0] ? mapRow(result.rows[0]) : null
  }

  async employeeHistory(employeeId: string, page: number, pageSize: number): Promise<EmployeeReportHistoryPage | null> {
    const employee = await this.pool.query<{ wecom_user_id: string | null }>(
      `SELECT wecom_user_id FROM employees WHERE id = $1`, [employeeId],
    )
    if (!employee.rows[0]) return null
    const userId = employee.rows[0].wecom_user_id?.trim() || null
    if (!userId) return { reports: [], linked: false, total: 0, page, pageSize, totalPages: 0 }
    const count = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM employee_work_daily_reports WHERE author_user_id = $1`, [userId],
    )
    const total = Number(count.rows[0]?.total ?? 0)
    const rows = await this.pool.query<{ record_id: string; report_date: string | Date; today_summary: string | null }>(
      `SELECT record_id, report_date::text AS report_date, today_summary
       FROM employee_work_daily_reports
       WHERE author_user_id = $1
       ORDER BY report_date DESC, submitted_at DESC, record_id
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, (page - 1) * pageSize],
    )
    return {
      reports: rows.rows.map((report) => ({ id: report.record_id, date: calendarDate(report.report_date), content: report.today_summary?.trim() || '未填写工作内容' })),
      linked: true,
      total,
      page,
      pageSize,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    }
  }
}
