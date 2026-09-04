export type WorkRecordSourceKind = 'mock' | 'wecom'

export interface WorkReportField {
  readonly label: string
  readonly value: string
}

export interface WorkReportRecord {
  readonly id: string
  readonly externalUserId: string
  readonly employeeName: string
  readonly departmentName: string
  readonly templateName: string
  readonly submittedAt: string
  readonly fields: readonly WorkReportField[]
}

export type AttendanceStatus = 'normal' | 'late' | 'late_severe' | 'early_leave' | 'missing' | 'leave'

export interface AttendanceCheckinDetail {
  readonly type: string
  readonly time: string
  readonly standardTime: string
  readonly status: AttendanceStatus
  readonly exceptionType: string | null
  readonly location: string | null
}

export interface AttendanceRecord {
  readonly id: string
  readonly externalUserId: string
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
}

export interface WorkRecordsSnapshot {
  readonly date: string
  readonly source: WorkRecordSourceKind
  readonly connectionStatus: 'demo' | 'connected' | 'error'
  readonly generatedAt: string
  readonly reports: {
    readonly expected: number
    readonly submitted: number
    readonly missing: number
    readonly records: readonly WorkReportRecord[]
  }
  readonly attendance: {
    readonly expected: number
    readonly normal: number
    readonly exceptions: number
    readonly records: readonly AttendanceRecord[]
  }
}

export interface EmployeeWorkRecordsSource {
  snapshot(date: string): Promise<WorkRecordsSnapshot>
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
