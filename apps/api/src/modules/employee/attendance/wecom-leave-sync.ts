import { createHash } from 'node:crypto'

import { WeComCheckinRepository, type WeComLeaveRecord } from './wecom-checkin-repository.js'
import type { WeComLeaveClient } from './wecom-leave-client.js'
import { checkinWindows } from './wecom-checkin-sync.js'

function object(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null }
function number(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null }
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }

function leaveType(vacation: Record<string, unknown>): string | null {
  const selector = object(vacation.selector); const options = Array.isArray(selector?.options) ? selector.options : []
  for (const option of options) {
    const values = Array.isArray(object(option)?.value) ? object(option)!.value as unknown[] : []
    for (const value of values) { const text = object(value)?.text; if (typeof text === 'string' && text.trim()) return text.trim() }
  }
  return null
}

function ranges(value: unknown, found: { readonly startsAt: number; readonly endsAt: number; readonly duration: number; readonly leaveType: string | null }[] = []): typeof found {
  if (Array.isArray(value)) { for (const child of value) ranges(child, found); return found }
  const current = object(value); if (!current) return found
  const vacation = object(current.vacation); const attendance = object(vacation?.attendance); const range = object(attendance?.date_range)
  const startsAt = number(range?.new_begin); const endsAt = number(range?.new_end)
  if (vacation && attendance && Number(attendance.type) === 1 && startsAt && endsAt && endsAt >= startsAt) found.push({ startsAt, endsAt, duration: number(range?.new_duration) ?? endsAt - startsAt, leaveType: leaveType(vacation) })
  for (const child of Object.values(current)) ranges(child, found)
  return found
}

export async function synchronizeWeComLeaves(repository: WeComCheckinRepository, client: WeComLeaveClient, input: { readonly startDate: string; readonly endDate: string }): Promise<{ readonly approvals: number; readonly leaves: number }> {
  const employees = await repository.employees(); const byUserId = new Map(employees.map((employee) => [employee.wecomUserId, employee.id]))
  let approvals = 0; let leaves = 0
  for (const window of checkinWindows(input.startDate, input.endDate)) for (const approvalNo of await client.approvalNumbers(window.startTime, window.endTime)) {
    approvals += 1
    const detail = await client.approvalDetail(approvalNo)
    await repository.deleteLeave(approvalNo)
    if (Number(detail.sp_status) !== 2) continue
    const applyer = object(detail.applyer); const userId = typeof applyer?.userid === 'string' ? applyer.userid.trim() : ''
    const employeeId = byUserId.get(userId); if (!employeeId) continue
    const uniqueRanges = [...new Map(ranges(detail).map((range) => [`${range.startsAt}-${range.endsAt}`, range])).values()]
    for (const [segmentIndex, range] of uniqueRanges.entries()) {
      const record: WeComLeaveRecord = { approvalNo, segmentIndex, employeeId, userId, leaveType: range.leaveType, startsAt: new Date(range.startsAt * 1_000).toISOString(), endsAt: new Date(range.endsAt * 1_000).toISOString(), durationSeconds: range.duration, rawData: detail, contentHash: hash({ approvalNo, segmentIndex, userId, range }) }
      await repository.upsertLeave(record); leaves += 1
    }
  }
  return { approvals, leaves }
}
