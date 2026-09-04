export type AttendanceStatus = 'normal' | 'late' | 'late_severe' | 'early_leave' | 'missing' | 'leave'

export interface AttendanceCheckinDetail {
  readonly type: string
  readonly time: string
  readonly standardTime: string
  readonly status: AttendanceStatus
  readonly exceptionType: string | null
  readonly location: string | null
}

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
      readonly externalUserId: string
      readonly date: string
      readonly employeeName: string
      readonly departmentName: string
      readonly scheduledStart: string
      readonly scheduledEnd: string
      readonly checkInAt: string | null
      readonly checkOutAt: string | null
      readonly checkInState?: 'recorded' | 'leave' | 'missing'
      readonly checkOutState?: 'recorded' | 'leave' | 'missing'
      readonly status: AttendanceStatus
      readonly location: string | null
      readonly checkInLocation?: string | null
      readonly checkOutLocation?: string | null
      readonly details?: readonly AttendanceCheckinDetail[]
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

export type AttendanceRecord = EmployeeAttendanceSnapshot['attendance']['records'][number]

export interface AttendanceAnomalyRanking {
  readonly employeeId: string
  readonly employeeName: string
  readonly departmentName: string
  readonly lateCount: number
  readonly severeLateCount: number
  readonly missingCount: number
  readonly earlyLeaveCount: number
  readonly total: number
}

async function readAttendanceView<T>(parameters: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/employee/attendance?${parameters}`, { credentials: 'same-origin', ...(signal ? { signal } : {}) })
  if (!response.ok) throw new Error(`考勤数据加载失败（HTTP ${response.status}）。`)
  return response.json() as Promise<T>
}

export function readEmployeeAttendanceHistory(employeeId: string, signal?: AbortSignal): Promise<{ readonly records: readonly AttendanceRecord[] }> {
  return readAttendanceView(new URLSearchParams({ view: 'history', employeeId }), signal)
}

export function readAttendanceAnomalies(month: string, signal?: AbortSignal): Promise<{ readonly month: string; readonly rankings: readonly AttendanceAnomalyRanking[] }> {
  return readAttendanceView(new URLSearchParams({ view: 'anomalies', month }), signal)
}
