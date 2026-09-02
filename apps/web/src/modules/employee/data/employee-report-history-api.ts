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

export async function readEmployeeReportHistory(employeeId: string, page: number, signal?: AbortSignal): Promise<EmployeeReportHistoryPage> {
  const search = new URLSearchParams({ page: String(page), pageSize: '20' })
  const response = await fetch(`/api/employees/${encodeURIComponent(employeeId)}/daily-reports?${search}`, {
    credentials: 'same-origin',
    ...(signal ? { signal } : {}),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: unknown }
    throw new Error(typeof body.error === 'string' ? body.error : `历史日报读取失败（HTTP ${response.status}）。`)
  }
  return response.json() as Promise<EmployeeReportHistoryPage>
}
