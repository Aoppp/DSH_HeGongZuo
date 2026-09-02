import type { Pool } from 'pg'

export type SubmissionState = 'submitted' | 'missing' | 'delayed'

export interface SubmissionEmployee {
  readonly id: string
  readonly name: string
  readonly department: string
  readonly departmentLevel2: string | null
  readonly state: SubmissionState
  readonly reportCount: number
}

export interface SubmissionDashboard {
  readonly date: string
  readonly expected: number
  readonly submitted: number
  readonly missing: number
  readonly delayed: number
  readonly employees: readonly SubmissionEmployee[]
  readonly departments: readonly { name: string; expected: number; submitted: number; missing: number; delayed: number }[]
}

export interface CalendarDay {
  readonly date: string
  readonly expected: number
  readonly submitted: number
  readonly missing: number
  readonly delayed: number
  readonly status: 'complete' | 'delayed' | 'missing' | 'empty'
}

export interface EmployeeReportProfile {
  readonly id: string
  readonly name: string
  readonly department: string
  readonly departmentLevel2: string | null
  readonly submittedDays: number
  readonly delayedCount: number
  readonly currentStreak: number
}

export interface QualityFinding {
  readonly type: 'duplicate' | 'future_report_date' | 'missing_identity' | 'empty_content' | 'unmatched_employee'
  readonly recordId: string
  readonly date: string
  readonly employee: string
  readonly department: string | null
  readonly detail: string
}

interface DashboardRow {
  readonly id: string
  readonly display_name: string
  readonly department_name: string
  readonly department_level2: string | null
  readonly report_count: string
  readonly delayed: boolean
}

function dateText(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(value)
}

function expectedEmployeesSql(dateParameter: string): string {
  return `SELECT id, display_name, department_name, department_level2
    FROM employees
    WHERE hire_date <= ${dateParameter}::date
      AND (departure_date IS NULL OR departure_date >= ${dateParameter}::date)
      AND status <> 'on_leave'
      AND (status <> 'inactive' OR departure_date >= ${dateParameter}::date)
      AND extract(isodow FROM ${dateParameter}::date) <= 5`
}

export class DailyReportAnalyticsRepository {
  constructor(private readonly pool: Pool) {}

  async dashboard(date: string): Promise<SubmissionDashboard> {
    const result = await this.pool.query<DashboardRow>(`WITH expected AS (${expectedEmployeesSql('$1')}), reports AS (
        SELECT employee.id, count(*)::text AS report_count,
          bool_or((report.submitted_at AT TIME ZONE 'Asia/Shanghai')::date > report.report_date) AS delayed
        FROM employee_work_daily_reports AS report
        JOIN employees AS employee ON employee.wecom_user_id = report.author_user_id
        WHERE report.report_date = $1::date
        GROUP BY employee.id
      )
      SELECT expected.*, coalesce(reports.report_count, '0') AS report_count, coalesce(reports.delayed, false) AS delayed
      FROM expected LEFT JOIN reports ON reports.id = expected.id
      ORDER BY expected.department_name, expected.department_level2 NULLS FIRST, expected.display_name`, [date])
    const employees = result.rows.map((row): SubmissionEmployee => {
      const reportCount = Number(row.report_count)
      return {
        id: row.id, name: row.display_name, department: row.department_name, departmentLevel2: row.department_level2,
        state: reportCount === 0 ? 'missing' : row.delayed ? 'delayed' : 'submitted', reportCount,
      }
    })
    const groups = new Map<string, SubmissionEmployee[]>()
    for (const employee of employees) groups.set(employee.department, [...(groups.get(employee.department) ?? []), employee])
    return {
      date, expected: employees.length, submitted: employees.filter((item) => item.state !== 'missing').length,
      missing: employees.filter((item) => item.state === 'missing').length,
      delayed: employees.filter((item) => item.state === 'delayed').length,
      employees,
      departments: [...groups].map(([name, items]) => ({
        name, expected: items.length, submitted: items.filter((item) => item.state !== 'missing').length,
        missing: items.filter((item) => item.state === 'missing').length,
        delayed: items.filter((item) => item.state === 'delayed').length,
      })),
    }
  }

  async calendar(month: string): Promise<readonly CalendarDay[]> {
    const result = await this.pool.query<{
      date: string | Date; expected: string; submitted: string; delayed: string
    }>(`WITH days AS (
        SELECT generate_series($1::date, ($1::date + interval '1 month - 1 day')::date, interval '1 day')::date AS date
      ), expected AS (
        SELECT days.date, count(employee.id)::text AS expected
        FROM days LEFT JOIN employees AS employee
          ON employee.hire_date <= days.date
          AND (employee.departure_date IS NULL OR employee.departure_date >= days.date)
          AND employee.status <> 'on_leave'
          AND (employee.status <> 'inactive' OR employee.departure_date >= days.date)
          AND extract(isodow FROM days.date) <= 5
        GROUP BY days.date
      ), submitted AS (
        SELECT report.report_date AS date, count(DISTINCT employee.id)::text AS submitted,
          count(DISTINCT employee.id) FILTER (WHERE (report.submitted_at AT TIME ZONE 'Asia/Shanghai')::date > report.report_date)::text AS delayed
        FROM employee_work_daily_reports AS report
        JOIN employees AS employee ON employee.wecom_user_id = report.author_user_id
        WHERE report.report_date >= $1::date AND report.report_date < $1::date + interval '1 month'
        GROUP BY report.report_date
      )
      SELECT days.date::text AS date, expected.expected, coalesce(submitted.submitted, '0') AS submitted,
        coalesce(submitted.delayed, '0') AS delayed
      FROM days JOIN expected USING (date) LEFT JOIN submitted USING (date) ORDER BY days.date`, [`${month}-01`])
    return result.rows.map((row) => {
      const expected = Number(row.expected), submitted = Number(row.submitted), delayed = Number(row.delayed)
      const missing = Math.max(0, expected - submitted)
      return { date: dateText(row.date), expected, submitted, missing, delayed, status: expected === 0 && submitted === 0 ? 'empty' : missing > 0 ? 'missing' : delayed > 0 ? 'delayed' : 'complete' }
    })
  }

  async employeeProfiles(): Promise<readonly EmployeeReportProfile[]> {
    const result = await this.pool.query<{
      id: string; display_name: string; department_name: string; department_level2: string | null
      submitted_days: string; delayed_count: string; report_dates: unknown
    }>(`SELECT employee.id, employee.display_name, employee.department_name, employee.department_level2,
        count(DISTINCT report.report_date)::text AS submitted_days,
        count(DISTINCT report.report_date) FILTER (WHERE (report.submitted_at AT TIME ZONE 'Asia/Shanghai')::date > report.report_date)::text AS delayed_count,
        coalesce(jsonb_agg(DISTINCT report.report_date::text) FILTER (WHERE report.report_date IS NOT NULL), '[]'::jsonb) AS report_dates
      FROM employees AS employee
      LEFT JOIN employee_work_daily_reports AS report ON report.author_user_id = employee.wecom_user_id
      GROUP BY employee.id ORDER BY employee.display_name`)
    return result.rows.map((row) => {
      const dates = Array.isArray(row.report_dates) ? (row.report_dates as string[]).sort().reverse() : []
      const submitted = new Set(dates)
      let streak = 0
      if (dates[0]) {
        const cursor = new Date(`${dates[0]}T00:00:00Z`)
        while (submitted.has(cursor.toISOString().slice(0, 10))) {
          streak += 1
          do { cursor.setUTCDate(cursor.getUTCDate() - 1) } while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6)
        }
      }
      return {
        id: row.id, name: row.display_name, department: row.department_name, departmentLevel2: row.department_level2,
        submittedDays: Number(row.submitted_days), delayedCount: Number(row.delayed_count), currentStreak: streak,
      }
    })
  }

  async quality(startDate: string, endDate: string): Promise<readonly QualityFinding[]> {
    const result = await this.pool.query<{
      type: QualityFinding['type']; record_id: string; date: string | Date; employee: string; department: string | null; detail: string
    }>(`WITH base AS (
        SELECT report.*, employee.id AS employee_id
        FROM employee_work_daily_reports AS report
        LEFT JOIN employees AS employee ON employee.wecom_user_id = report.author_user_id
        WHERE report.report_date BETWEEN $1::date AND $2::date
      ), duplicate_records AS (
        SELECT author_user_id, report_date, count(*) AS total
        FROM base WHERE author_user_id IS NOT NULL GROUP BY author_user_id, report_date HAVING count(*) > 1
      )
      SELECT 'duplicate'::text AS type, base.record_id, base.report_date::text AS date, base.author_name AS employee,
        base.department_name AS department, '同一员工当天存在 ' || duplicate_records.total || ' 份日报' AS detail
      FROM base JOIN duplicate_records USING (author_user_id, report_date)
      UNION ALL SELECT 'future_report_date', record_id, report_date::text, author_name, department_name, '汇报日期晚于实际提交日期'
        FROM base WHERE report_date > (submitted_at AT TIME ZONE 'Asia/Shanghai')::date
      UNION ALL SELECT 'missing_identity', record_id, report_date::text, coalesce(nullif(btrim(author_name), ''), '未记录'), department_name, '缺少填写人或提交时部门'
        FROM base WHERE author_user_id IS NULL OR btrim(author_name) = '' OR department_name IS NULL OR btrim(department_name) = ''
      UNION ALL SELECT 'empty_content', record_id, report_date::text, author_name, department_name, '日报内容为空'
        FROM base WHERE nullif(btrim(today_summary), '') IS NULL AND nullif(btrim(tomorrow_plan), '') IS NULL AND nullif(btrim(other_items), '') IS NULL
      UNION ALL SELECT 'unmatched_employee', record_id, report_date::text, author_name, department_name, '企业微信成员未关联员工档案'
        FROM base WHERE employee_id IS NULL
      ORDER BY date DESC, employee, record_id`, [startDate, endDate])
    return result.rows.map((row) => ({ type: row.type, recordId: row.record_id, date: dateText(row.date), employee: row.employee, department: row.department, detail: row.detail }))
  }

}
