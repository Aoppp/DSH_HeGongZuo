import { createHash } from 'node:crypto'

import { checkinWindows } from './wecom-checkin-sync.js'
import type { WeComCheckinClient } from './wecom-checkin-client.js'
import { WeComCheckinRepository } from './wecom-checkin-repository.js'

function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : null }
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function monthDate(yearmonth: unknown, day: unknown): string | null {
  const month = String(yearmonth ?? ''); const date = Number(day)
  if (!/^\d{6}$/.test(month) || !Number.isInteger(date) || date < 1 || date > 31) return null
  const result = `${month.slice(0, 4)}-${month.slice(4)}-${String(date).padStart(2, '0')}`
  return Number.isNaN(Date.parse(`${result}T00:00:00Z`)) ? null : result
}
function chunks<T>(items: readonly T[], size: number): readonly T[][] { return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size)) }

export async function synchronizeWeComSchedules(repository: WeComCheckinRepository, client: WeComCheckinClient, input: { readonly startDate: string; readonly endDate: string }): Promise<{ employees: number; schedules: number }> {
  const employees = await repository.employees()
  const byUserId = new Map(employees.map((employee) => [employee.wecomUserId, employee.id]))
  let schedules = 0
  for (const window of checkinWindows(input.startDate, input.endDate)) for (const batch of chunks(employees, 100)) {
    for (const value of await client.schedules(batch.map((employee) => employee.wecomUserId), window.startTime, window.endTime)) {
      const userId = text(value.userid); const employeeId = userId ? byUserId.get(userId) : null
      const schedule = value.schedule && typeof value.schedule === 'object' ? value.schedule as Record<string, unknown> : null
      const items = schedule && Array.isArray(schedule.scheduleList) ? schedule.scheduleList : []
      if (!employeeId || !userId) continue
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const entry = item as Record<string, unknown>; const info = entry.schedule_info && typeof entry.schedule_info === 'object' ? entry.schedule_info as Record<string, unknown> : null
        const date = monthDate(value.yearmonth, entry.day); const scheduleId = info ? text(info.schedule_id) : null
        if (!date || !scheduleId || date < input.startDate || date > input.endDate) continue
        await repository.upsertSchedule({ employeeId, userId, date, scheduleId, scheduleName: info ? text(info.schedule_name) : null, groupId: text(value.groupid), groupName: text(value.groupname), rawData: { ...value, schedule: { scheduleList: [entry] } }, contentHash: hash({ userId, date, scheduleId, info, groupid: value.groupid }) })
        schedules += 1
      }
    }
  }
  return { employees: employees.length, schedules }
}
