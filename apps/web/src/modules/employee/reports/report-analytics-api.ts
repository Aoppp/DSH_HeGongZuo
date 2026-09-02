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
export interface EmployeeReportProfile { readonly id: string; readonly name: string; readonly department: string; readonly departmentLevel2: string | null; readonly submittedDays: number; readonly delayedCount: number; readonly currentStreak: number }
export interface QualityFinding { readonly type: 'duplicate' | 'future_report_date' | 'missing_identity' | 'empty_content' | 'unmatched_employee'; readonly recordId: string; readonly date: string; readonly employee: string; readonly department: string | null; readonly detail: string }

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
export const readEmployeeReportProfiles = () => query('employees', {}) as Promise<readonly EmployeeReportProfile[]>
export const readReportQuality = (startDate: string, endDate: string) => query('quality', { startDate, endDate }) as Promise<readonly QualityFinding[]>
