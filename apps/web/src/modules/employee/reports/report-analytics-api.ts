export type SubmissionState = 'submitted' | 'missing' | 'delayed'

export interface SubmissionEmployee {
  readonly id: string; readonly name: string; readonly department: string; readonly departmentLevel2: string | null
  readonly state: SubmissionState; readonly reportCount: number
}
export interface SubmissionDashboard {
  readonly date: string; readonly expected: number; readonly submitted: number; readonly missing: number; readonly delayed: number
  readonly employees: readonly SubmissionEmployee[]
  readonly departments: readonly { name: string; expected: number; submitted: number; missing: number; delayed: number }[]
}
export interface CalendarDay { readonly date: string; readonly expected: number; readonly submitted: number; readonly missing: number; readonly delayed: number; readonly status: 'complete' | 'delayed' | 'missing' | 'empty' }
export interface EmployeeReportProfile { readonly id: string; readonly name: string; readonly department: string; readonly departmentLevel2: string | null; readonly submittedDays: number; readonly delayedCount: number; readonly currentStreak: number; readonly commonWork: readonly string[] }
export interface DepartmentReportSummary { readonly department: string; readonly startDate: string; readonly endDate: string; readonly completed: readonly ReportSummaryItem[]; readonly plans: readonly ReportSummaryItem[]; readonly issues: readonly ReportSummaryItem[]; readonly missingEmployees: readonly string[]; readonly delayedEmployees: readonly string[]; readonly expectedSubmissions: number; readonly submittedSubmissions: number; readonly completionRate: number }
export interface ReportSummaryItem { readonly employee: string; readonly text: string; readonly date: string }
export interface QualityFinding { readonly type: 'duplicate' | 'future_report_date' | 'missing_identity' | 'empty_content' | 'unmatched_employee'; readonly recordId: string; readonly date: string; readonly employee: string; readonly department: string | null; readonly detail: string }
export interface ReportSummaryRecord { readonly id: number; readonly periodType: 'week' | 'month'; readonly startDate: string; readonly endDate: string; readonly department: string | null; readonly content: { readonly title?: string; readonly sections?: readonly DepartmentReportSummary[] }; readonly status: 'draft' | 'confirmed'; readonly createdAt: string; readonly confirmedAt: string | null }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'same-origin' })
  const body = await response.json().catch(() => ({})) as { error?: string; data?: T }
  if (!response.ok) throw new Error(body.error || `日报统计读取失败（HTTP ${response.status}）。`)
  return body.data as T
}

function query(view: string, parameters: Record<string, string>): Promise<unknown> {
  const search = new URLSearchParams({ view, ...parameters })
  return request(`/api/daily-report-analytics?${search}`)
}

export const readSubmissionDashboard = (date: string) => query('dashboard', { date }) as Promise<SubmissionDashboard>
export const readReportCalendar = (month: string) => query('calendar', { month }) as Promise<readonly CalendarDay[]>
export const readEmployeeReportProfiles = (startDate: string, endDate: string) => query('employees', { startDate, endDate }) as Promise<readonly EmployeeReportProfile[]>
export const readDepartmentReportSummary = (department: string, startDate: string, endDate: string) => query('department', { department, startDate, endDate }) as Promise<DepartmentReportSummary>
export const readReportQuality = (startDate: string, endDate: string) => query('quality', { startDate, endDate }) as Promise<readonly QualityFinding[]>
export const readGeneratedSummaries = () => query('summaries', {}) as Promise<readonly ReportSummaryRecord[]>

export async function createGeneratedSummary(input: { periodType: 'week' | 'month'; startDate: string; endDate: string; department: string }): Promise<ReportSummaryRecord> {
  const response = await fetch('/api/daily-report-analytics/summaries', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  const body = await response.json().catch(() => ({})) as { error?: string; summary?: ReportSummaryRecord }
  if (!response.ok || !body.summary) throw new Error(body.error || '日报汇总生成失败。')
  return body.summary
}

export async function confirmGeneratedSummary(id: number): Promise<ReportSummaryRecord> {
  const response = await fetch(`/api/daily-report-analytics/summaries/${id}/confirm`, { method: 'POST', credentials: 'same-origin' })
  const body = await response.json().catch(() => ({})) as { error?: string; summary?: ReportSummaryRecord }
  if (!response.ok || !body.summary) throw new Error(body.error || '日报汇总确认失败。')
  return body.summary
}
