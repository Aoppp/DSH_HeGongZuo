import type { Pool } from 'pg'

import type { AttendanceCheckinDetail, AttendanceRecord, AttendanceStatus } from '../work-records/work-records-source.js'

interface CheckinRow {
  readonly id: string | null
  readonly employee_id: string
  readonly display_name: string
  readonly department_name: string
  readonly checkin_time: string | Date | null
  readonly checkin_type: string | null
  readonly exception_type: string | null
  readonly location_title: string | null
  readonly standard_checkin_time: string | Date | null
}

function iso(value: string | Date): string { return (value instanceof Date ? value : new Date(value)).toISOString() }
function time(value: string | Date | null): string { return value ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '—' }
function type(value: string): 'checkin' | 'checkout' | null { return value.includes('上班') ? 'checkin' : value.includes('下班') ? 'checkout' : null }
function status(value: string | null): AttendanceStatus {
  if (value?.includes('迟到')) return 'late'
  if (value?.includes('早退')) return 'early_leave'
  if (value?.includes('缺卡')) return 'missing'
  return 'normal'
}

interface GroupedRecord {
  id: string
  externalUserId: string
  employeeName: string
  departmentName: string
  scheduledStart: string
  scheduledEnd: string
  checkInAt: string | null
  checkOutAt: string | null
  status: AttendanceStatus
  location: string | null
  checkInLocation: string | null
  checkOutLocation: string | null
  details: AttendanceCheckinDetail[]
  severity: number
}
function severity(value: AttendanceStatus): number { return value === 'missing' ? 3 : value === 'early_leave' ? 2 : value === 'late' ? 1 : 0 }

export interface PostgresAttendanceSnapshot {
  readonly date: string
  readonly source: 'wecom'
  readonly connectionStatus: 'connected'
  readonly generatedAt: string
  readonly attendance: { readonly expected: number; readonly normal: number; readonly exceptions: number; readonly records: readonly AttendanceRecord[] }
}

export class PostgresAttendanceSource {
  constructor(private readonly pool: Pool) {}

  async snapshot(date: string): Promise<PostgresAttendanceSnapshot> {
    const result = await this.pool.query<CheckinRow>(`SELECT checkin.id::text, employee.id AS employee_id, employee.display_name,
      employee.department_name, checkin.checkin_time, checkin.checkin_type, checkin.exception_type,
      checkin.location_title, checkin.standard_checkin_time
      FROM employee_wecom_schedules AS schedule JOIN employees AS employee ON employee.id=schedule.employee_id
      LEFT JOIN employee_wecom_checkins AS checkin ON checkin.employee_id=employee.id
        AND checkin.checkin_time >= ($1::date::timestamp AT TIME ZONE 'Asia/Shanghai')
        AND checkin.checkin_time < (($1::date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')
      WHERE schedule.schedule_date=$1::date AND schedule.schedule_id <> '0'
        AND employee.hire_date <= $1::date
        AND (employee.departure_date IS NULL OR employee.departure_date >= $1::date)
      ORDER BY employee.display_name, checkin.checkin_time NULLS LAST, checkin.id`, [date])
    const grouped = new Map<string, GroupedRecord>()
    for (const row of result.rows) {
      const checkinType = row.checkin_type ? type(row.checkin_type) : null
      const nextStatus = status(row.exception_type)
      const current = grouped.get(row.employee_id)
      const checkinTime = row.checkin_time ? iso(row.checkin_time) : null
      const standardTime = time(row.standard_checkin_time)
      const detail: AttendanceCheckinDetail | null = checkinType && checkinTime ? { type: row.checkin_type!, time: checkinTime, standardTime, status: nextStatus, exceptionType: row.exception_type, location: row.location_title } : null
      if (!current) {
        grouped.set(row.employee_id, {
          id: `${row.employee_id}-${date}`, externalUserId: row.employee_id, employeeName: row.display_name, departmentName: row.department_name,
          scheduledStart: checkinType === 'checkin' ? standardTime : '—', scheduledEnd: checkinType === 'checkout' ? standardTime : '—',
          checkInAt: checkinType === 'checkin' ? checkinTime : null, checkOutAt: checkinType === 'checkout' ? checkinTime : null,
          status: checkinType ? nextStatus : 'missing', location: row.location_title, checkInLocation: checkinType === 'checkin' ? row.location_title : null,
          checkOutLocation: checkinType === 'checkout' ? row.location_title : null, details: detail ? [detail] : [], severity: checkinType ? severity(nextStatus) : severity('missing'),
        })
        continue
      }
      const next = { ...current }
      if (!checkinType) continue
      if (!checkinTime) continue
      if (checkinType === 'checkin' && (!next.checkInAt || checkinTime < next.checkInAt)) { next.checkInAt = checkinTime; next.scheduledStart = standardTime; next.checkInLocation = row.location_title }
      if (checkinType === 'checkout' && (!next.checkOutAt || checkinTime > next.checkOutAt)) { next.checkOutAt = checkinTime; next.scheduledEnd = standardTime; next.checkOutLocation = row.location_title }
      if (severity(nextStatus) > next.severity) { next.status = nextStatus; next.severity = severity(nextStatus) }
      if (!next.location && row.location_title) next.location = row.location_title
      if (detail) next.details.push(detail)
      grouped.set(row.employee_id, next)
    }
    const records = [...grouped.values()].map(({ severity: _severity, ...record }) => record)
    return { date, source: 'wecom', connectionStatus: 'connected', generatedAt: new Date().toISOString(), attendance: {
      expected: records.length, normal: records.filter((record) => record.status === 'normal').length,
      exceptions: records.filter((record) => record.status !== 'normal').length, records,
    } }
  }
}
