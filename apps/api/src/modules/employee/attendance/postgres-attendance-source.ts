import type { Pool } from 'pg'

import type { AttendanceCheckinDetail, AttendanceRecord, AttendanceStatus } from '../work-records/work-records-source.js'

export type ExtendedAttendanceStatus = AttendanceStatus | 'late_severe'

interface CheckinRow {
  readonly id: string | null
  readonly schedule_date: string | Date
  readonly employee_id: string
  readonly display_name: string
  readonly department_name: string
  readonly checkin_time: string | Date | null
  readonly checkin_type: string | null
  readonly exception_type: string | null
  readonly location_title: string | null
  readonly standard_checkin_time: string | Date | null
  readonly leave_full_day: boolean
  readonly leave_at_start: boolean
  readonly leave_at_end: boolean
}

export interface ExtendedAttendanceRecord {
  readonly id: string
  readonly externalUserId: string
  readonly employeeName: string
  readonly departmentName: string
  readonly date: string
  readonly scheduledStart: string
  readonly scheduledEnd: string
  readonly checkInAt: string | null
  readonly checkOutAt: string | null
  readonly checkInState: 'recorded' | 'leave' | 'missing'
  readonly checkOutState: 'recorded' | 'leave' | 'missing'
  readonly status: ExtendedAttendanceStatus
  readonly location: string | null
  readonly checkInLocation: string | null
  readonly checkOutLocation: string | null
  readonly details: readonly (Omit<AttendanceCheckinDetail, 'status'> & { readonly status: ExtendedAttendanceStatus })[]
}

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

function iso(value: string | Date): string { return (value instanceof Date ? value : new Date(value)).toISOString() }
function dateText(value: string | Date): string { return typeof value === 'string' ? value.slice(0, 10) : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(value) }
function time(value: string | Date | null): string { return value ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '—' }
function type(value: string): 'checkin' | 'checkout' | null { return value.includes('上班') ? 'checkin' : value.includes('下班') ? 'checkout' : null }
function rawStatus(value: string | null): ExtendedAttendanceStatus {
  if (value?.includes('早退')) return 'early_leave'
  if (value?.includes('缺卡')) return 'missing'
  if (value?.includes('迟到')) return 'late'
  return 'normal'
}
function checkinStatus(value: string | Date): ExtendedAttendanceStatus {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((item) => item.type === type)?.value ?? 0)
  const seconds = part('hour') * 3600 + part('minute') * 60 + part('second')
  if (seconds > 9 * 3600 + 15 * 60) return 'late_severe'
  if (seconds >= 9 * 3600 + 60) return 'late'
  return 'normal'
}

function localToday(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()) }
function previousDate(date: string): string { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() - 1); return value.toISOString().slice(0, 10) }
function finalStatus(record: ExtendedAttendanceRecord): ExtendedAttendanceStatus {
  if (record.checkInState === 'leave' || record.checkOutState === 'leave') return 'leave'
  if (!record.checkInAt || !record.checkOutAt) return 'missing'
  const statuses = record.details.map((detail) => detail.status)
  if (statuses.includes('missing')) return 'missing'
  if (statuses.includes('late_severe')) return 'late_severe'
  if (statuses.includes('early_leave')) return 'early_leave'
  if (statuses.includes('late')) return 'late'
  return 'normal'
}

export interface PostgresAttendanceSnapshot {
  readonly date: string
  readonly source: 'wecom'
  readonly connectionStatus: 'connected'
  readonly generatedAt: string
  readonly attendance: { readonly expected: number; readonly normal: number; readonly exceptions: number; readonly records: readonly ExtendedAttendanceRecord[] }
}

export class PostgresAttendanceSource {
  constructor(private readonly pool: Pool) {}

  private async records(startDate: string, endDate: string, employeeId?: string): Promise<ExtendedAttendanceRecord[]> {
    const values: unknown[] = [startDate, endDate]
    const employeeCondition = employeeId ? `AND employee.id = $${values.push(employeeId)}` : ''
    const result = await this.pool.query<CheckinRow>(`SELECT checkin.id::text, schedule.schedule_date::text, employee.id AS employee_id, employee.display_name,
      employee.department_name, checkin.checkin_time, checkin.checkin_type, checkin.exception_type,
      checkin.location_title, checkin.standard_checkin_time,
      EXISTS (SELECT 1 FROM employee_wecom_leave_records leave_record WHERE leave_record.employee_id=employee.id
        AND leave_record.duration_seconds >= 28800 AND leave_record.starts_at < ((schedule.schedule_date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')
        AND leave_record.ends_at >= (schedule.schedule_date::timestamp AT TIME ZONE 'Asia/Shanghai')) AS leave_full_day,
      EXISTS (SELECT 1 FROM employee_wecom_leave_records leave_record WHERE leave_record.employee_id=employee.id
        AND leave_record.starts_at <= ((schedule.schedule_date + time '09:00') AT TIME ZONE 'Asia/Shanghai')
        AND leave_record.ends_at >= ((schedule.schedule_date + time '09:00') AT TIME ZONE 'Asia/Shanghai')) AS leave_at_start,
      EXISTS (SELECT 1 FROM employee_wecom_leave_records leave_record WHERE leave_record.employee_id=employee.id
        AND leave_record.starts_at <= ((schedule.schedule_date + time '18:00') AT TIME ZONE 'Asia/Shanghai')
        AND leave_record.ends_at >= ((schedule.schedule_date + time '18:00') AT TIME ZONE 'Asia/Shanghai')) AS leave_at_end
      FROM employee_wecom_schedules AS schedule JOIN employees AS employee ON employee.id=schedule.employee_id
      LEFT JOIN employee_wecom_checkins AS checkin ON checkin.employee_id=employee.id
        AND checkin.checkin_time >= (schedule.schedule_date::timestamp AT TIME ZONE 'Asia/Shanghai')
        AND checkin.checkin_time < ((schedule.schedule_date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')
      WHERE schedule.schedule_date BETWEEN $1::date AND $2::date AND schedule.schedule_id <> '0'
        AND employee.hire_date <= schedule.schedule_date
        AND (employee.departure_date IS NULL OR employee.departure_date >= schedule.schedule_date)
        ${employeeCondition}
      ORDER BY schedule.schedule_date DESC, employee.display_name, checkin.checkin_time NULLS LAST, checkin.id`, values)
    const grouped = new Map<string, ExtendedAttendanceRecord>()
    for (const row of result.rows) {
      const date = dateText(row.schedule_date)
      const key = `${row.employee_id}-${date}`
      const checkinType = row.checkin_type ? type(row.checkin_type) : null
      const checkinTime = row.checkin_time ? iso(row.checkin_time) : null
      const detailStatus = checkinType === 'checkin' && row.checkin_time ? checkinStatus(row.checkin_time) : rawStatus(row.exception_type)
      const detail = checkinType && checkinTime ? { type: row.checkin_type!, time: checkinTime, standardTime: time(row.standard_checkin_time), status: detailStatus, exceptionType: row.exception_type, location: row.location_title } : null
      const current = grouped.get(key) ?? {
        id: key, externalUserId: row.employee_id, employeeName: row.display_name, departmentName: row.department_name, date,
        scheduledStart: '—', scheduledEnd: '—', checkInAt: null, checkOutAt: null,
        checkInState: row.leave_full_day || row.leave_at_start ? 'leave' as const : 'missing' as const,
        checkOutState: row.leave_full_day || row.leave_at_end ? 'leave' as const : 'missing' as const,
        status: 'missing' as const,
        location: null, checkInLocation: null, checkOutLocation: null, details: [],
      }
      const details = detail ? [...current.details, detail] : [...current.details]
      let checkInAt = current.checkInAt, checkOutAt = current.checkOutAt
      let checkInLocation = current.checkInLocation, checkOutLocation = current.checkOutLocation
      if (checkinType === 'checkin' && checkinTime && (!checkInAt || checkinTime < checkInAt)) { checkInAt = checkinTime; checkInLocation = row.location_title }
      if (checkinType === 'checkout' && checkinTime && (!checkOutAt || checkinTime > checkOutAt)) { checkOutAt = checkinTime; checkOutLocation = row.location_title }
      const next: ExtendedAttendanceRecord = {
        ...current, checkInAt, checkOutAt,
        checkInState: current.checkInState === 'leave' ? 'leave' : checkInAt ? 'recorded' : 'missing',
        checkOutState: current.checkOutState === 'leave' ? 'leave' : checkOutAt ? 'recorded' : 'missing',
        checkInLocation, checkOutLocation, location: current.location ?? row.location_title, details,
      }
      grouped.set(key, { ...next, status: finalStatus(next) })
    }
    return [...grouped.values()]
  }

  async snapshot(date: string): Promise<PostgresAttendanceSnapshot> {
    const records = date < localToday() ? await this.records(date, date) : []
    return { date, source: 'wecom', connectionStatus: 'connected', generatedAt: new Date().toISOString(), attendance: {
      expected: records.length, normal: records.filter((record) => record.status === 'normal').length,
      exceptions: records.filter((record) => record.status !== 'normal' && record.status !== 'leave').length, records,
    } }
  }

  async employeeHistory(employeeId: string): Promise<readonly ExtendedAttendanceRecord[]> {
    return this.records('2026-07-01', previousDate(localToday()), employeeId)
  }

  async anomalyRankings(month: string): Promise<readonly AttendanceAnomalyRanking[]> {
    const startDate = `${month}-01`
    const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)
    const endDate = [monthEnd, previousDate(localToday())].sort()[0]!
    const records = await this.records(startDate, endDate)
    const rankings = new Map<string, AttendanceAnomalyRanking>()
    for (const record of records) {
      if (record.status === 'normal' || record.status === 'leave') continue
      const current = rankings.get(record.externalUserId) ?? { employeeId: record.externalUserId, employeeName: record.employeeName, departmentName: record.departmentName, lateCount: 0, severeLateCount: 0, missingCount: 0, earlyLeaveCount: 0, total: 0 }
      const late = record.details.some((detail) => detail.status === 'late' || detail.status === 'late_severe')
      const severeLate = record.details.some((detail) => detail.status === 'late_severe')
      const earlyLeave = record.details.some((detail) => detail.status === 'early_leave')
      rankings.set(record.externalUserId, { ...current, lateCount: current.lateCount + Number(late), severeLateCount: current.severeLateCount + Number(severeLate), missingCount: current.missingCount + Number(record.status === 'missing'), earlyLeaveCount: current.earlyLeaveCount + Number(earlyLeave), total: current.total + 1 })
    }
    return [...rankings.values()].sort((left, right) => right.lateCount - left.lateCount || right.severeLateCount - left.severeLateCount || right.total - left.total || left.employeeName.localeCompare(right.employeeName, 'zh-CN'))
  }
}
