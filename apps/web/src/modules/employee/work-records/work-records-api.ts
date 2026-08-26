export type AttendanceStatus = 'normal' | 'late' | 'early_leave' | 'missing'

interface SourceState {
  readonly date: string
  readonly source: 'mock' | 'wecom'
  readonly connectionStatus: 'demo' | 'connected' | 'error'
  readonly generatedAt: string
}

export interface EmployeeReportsSnapshot extends SourceState {
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
}

export interface EmployeeAttendanceSnapshot extends SourceState {
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

async function readSnapshot<T>(path: string, date: string, label: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${path}?date=${encodeURIComponent(date)}`, { credentials: 'same-origin', ...(signal ? { signal } : {}) })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { readonly error?: unknown }
    throw new Error(typeof body.error === 'string' ? body.error : `${label}加载失败（HTTP ${response.status}）。`)
  }
  return response.json() as Promise<T>
}

export function readEmployeeReports(date: string, signal?: AbortSignal): Promise<EmployeeReportsSnapshot> {
  return readSnapshot('/api/employee/reports', date, '工作汇报', signal)
}

export function readEmployeeAttendance(date: string, signal?: AbortSignal): Promise<EmployeeAttendanceSnapshot> {
  return readSnapshot('/api/employee/attendance', date, '考勤数据', signal)
}
