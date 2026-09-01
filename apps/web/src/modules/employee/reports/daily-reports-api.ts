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
  readonly employee: { readonly user_id: string | null; readonly name: string }
  readonly department: { readonly id: string | null; readonly name: string | null }
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

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...(signal ? { signal } : {}) })
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
  return request(`/api/daily-reports?${createDailyReportSearch(filters, page, pageSize)}`, signal)
}

export function readDailyReport(id: string, signal?: AbortSignal): Promise<DailyReport> {
  return request<{ report: DailyReport }>(`/api/daily-reports/${encodeURIComponent(id)}`, signal).then((result) => result.report)
}
