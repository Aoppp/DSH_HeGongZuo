import type { Pool } from 'pg'

import type { WorkDailyAttachment } from './work-daily-record.js'

export interface DailyReport {
  readonly record_id: string
  readonly employee: {
    readonly user_id: string | null
    readonly name: string
  }
  readonly department: {
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

interface DailyReportRow {
  readonly record_id: string
  readonly author_user_id: string | null
  readonly author_name: string
  readonly department_id: string | null
  readonly department_name: string | null
  readonly report_date: string | Date
  readonly submitted_at: string | Date
  readonly today_summary: string | null
  readonly tomorrow_plan: string | null
  readonly other_items: string | null
  readonly attachments: unknown
  readonly wecom_updated_at: string | Date
}

const selectedColumns = `record_id, author_user_id, author_name, department_id, department_name,
  report_date::text AS report_date, submitted_at, today_summary, tomorrow_plan, other_items, attachments, wecom_updated_at`

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
    employee: { user_id: row.author_user_id, name: row.author_name },
    department: { id: row.department_id, name: row.department_name },
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
    conditions.push(`(author_user_id = ${parameter} OR lower(author_name) = lower(${parameter}))`)
  }
  if (filters.department) {
    const parameter = value(filters.department)
    conditions.push(`(department_id = ${parameter} OR lower(department_name) = lower(${parameter}))`)
  }
  if (filters.startDate) conditions.push(`report_date >= ${value(filters.startDate)}::date`)
  if (filters.endDate) conditions.push(`report_date <= ${value(filters.endDate)}::date`)
  if (filters.keyword) {
    const parameter = value(`%${filters.keyword}%`)
    conditions.push(`(today_summary ILIKE ${parameter} OR tomorrow_plan ILIKE ${parameter} OR other_items ILIKE ${parameter})`)
  }
  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values }
}

export class DailyReportRepository {
  constructor(private readonly pool: Pool) {}

  async list(filters: DailyReportFilters): Promise<DailyReportPage> {
    const query = whereClause(filters)
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM employee_work_daily_reports ${query.sql}`,
      query.values,
    )
    const total = Number(countResult.rows[0]?.total ?? 0)
    const values = [...query.values, filters.pageSize, (filters.page - 1) * filters.pageSize]
    const rows = await this.pool.query<DailyReportRow>(`SELECT ${selectedColumns}
      FROM employee_work_daily_reports ${query.sql}
      ORDER BY report_date DESC, submitted_at DESC, record_id
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
      FROM employee_work_daily_reports WHERE record_id = $1`, [recordId])
    return result.rows[0] ? mapRow(result.rows[0]) : null
  }
}
