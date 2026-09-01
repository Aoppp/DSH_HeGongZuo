export interface DailyReportAttachment {
  readonly name: string
  readonly url: string
  readonly type: string | null
  readonly extension: string | null
  readonly size: number | null
  readonly documentType: number | null
}

export interface DailyReport {
  readonly record_id: string
  readonly employee: { readonly user_id: string | null; readonly employee_id: string | null; readonly name: string; readonly matched: boolean }
  readonly department: { readonly name: string | null; readonly level2: string | null }
  readonly source_department: { readonly id: string | null; readonly name: string | null }
  readonly report_date: string
  readonly submit_time: string
  readonly today_summary: string | null
  readonly tomorrow_plan: string | null
  readonly other: string | null
  readonly attachments: readonly DailyReportAttachment[]
  readonly update_time: string
}

export interface DailyReportFilters {
  readonly startDate: string
  readonly endDate: string
  readonly department: string
  readonly employee: string
  readonly keyword: string
}

export interface DailyReportPage {
  readonly reports: readonly DailyReport[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
  readonly totalPages: number
}

export interface DailyReportSyncRun {
  readonly id: number
  readonly source: 'history' | 'wecom'
  readonly status: 'running' | 'succeeded' | 'partial' | 'failed' | 'skipped'
  readonly startedAt: string
  readonly finishedAt: string | null
  readonly stats: { readonly pulled: number; readonly inserted: number; readonly updated: number; readonly unchanged: number; readonly failed: number }
}

export interface DailyReportSyncState {
  readonly queued: boolean
  readonly run: DailyReportSyncRun | null
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'same-origin' })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: unknown }
    throw new Error(typeof body.error === 'string' ? body.error : `日报读取失败（HTTP ${response.status}）。`)
  }
  return response.json() as Promise<T>
}

export function createDailyReportSearch(filters: DailyReportFilters, page: number, pageSize: number): URLSearchParams {
  const search = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (filters.startDate) search.set('startDate', filters.startDate)
  if (filters.endDate) search.set('endDate', filters.endDate)
  if (filters.department.trim()) search.set('department', filters.department.trim())
  if (filters.employee.trim()) search.set('employee', filters.employee.trim())
  if (filters.keyword.trim()) search.set('keyword', filters.keyword.trim())
  return search
}

export function readDailyReports(filters: DailyReportFilters, page: number, pageSize: number, signal?: AbortSignal): Promise<DailyReportPage> {
  return request(`/api/daily-reports?${createDailyReportSearch(filters, page, pageSize)}`, signal ? { signal } : {})
}

export function readDailyReport(id: string, signal?: AbortSignal): Promise<DailyReport> {
  return request<{ report: DailyReport }>(`/api/daily-reports/${encodeURIComponent(id)}`, signal ? { signal } : {}).then((result) => result.report)
}

export function readDailyReportSyncState(signal?: AbortSignal): Promise<DailyReportSyncState> {
  return request('/api/daily-reports/sync', signal ? { signal } : {})
}

export function startDailyReportSync(): Promise<{ readonly accepted: boolean; readonly state: DailyReportSyncState }> {
  return request('/api/daily-reports/sync', { method: 'POST' })
}
