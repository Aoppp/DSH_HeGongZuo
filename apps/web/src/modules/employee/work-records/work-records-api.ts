export type AttendanceStatus = 'normal' | 'late' | 'early_leave' | 'missing'

export interface WorkRecordsSnapshot {
  readonly date: string
  readonly source: 'mock' | 'wecom'
  readonly connectionStatus: 'demo' | 'connected' | 'error'
  readonly generatedAt: string
  readonly reports: {
    readonly expected: number
    readonly submitted: number
    readonly missing: number
    readonly records: readonly {
      readonly id: string
      readonly employeeName: string
      readonly departmentName: string
      readonly templateName: string
      readonly submittedAt: string
      readonly fields: readonly { readonly label: string; readonly value: string }[]
    }[]
  }
  readonly attendance: {
    readonly expected: number
    readonly normal: number
    readonly exceptions: number
    readonly records: readonly {
      readonly id: string
      readonly employeeName: string
      readonly departmentName: string
      readonly scheduledStart: string
      readonly scheduledEnd: string
      readonly checkInAt: string | null
      readonly checkOutAt: string | null
      readonly status: AttendanceStatus
      readonly location: string | null
    }[]
  }
}

export async function readWorkRecords(date: string, signal?: AbortSignal): Promise<WorkRecordsSnapshot> {
  const response = await fetch(`/api/employee/work-records?date=${encodeURIComponent(date)}`, { credentials: 'same-origin', ...(signal ? { signal } : {}) })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { readonly error?: unknown }
    throw new Error(typeof body.error === 'string' ? body.error : `考勤与汇报加载失败（HTTP ${response.status}）。`)
  }
  return response.json() as Promise<WorkRecordsSnapshot>
}
