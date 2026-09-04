import { createHash } from 'node:crypto'

import { checkinWindows, shiftShanghaiDate, shanghaiToday } from './wecom-checkin-sync.js'
import type { WeComLeaveClient } from './wecom-leave-client.js'
import type { LeaveSyncSource, WeComLeaveRecord, WeComLeaveRepository } from './wecom-leave-repository.js'

export interface LeaveSyncInput { readonly source: LeaveSyncSource; readonly startDate: string; readonly endDate: string; readonly advanceCheckpoint: boolean }
export interface LeaveSyncResult { readonly runId: number; readonly approvals: number; readonly upserted: number; readonly skipped: number; readonly failed: number; readonly status: 'succeeded' | 'partial'; readonly checkpointAfter: string | null; readonly errors: readonly string[] }

function object(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null }
function positiveNumber(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null }
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null }
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function isoUnix(value: unknown): string | null { const seconds = positiveNumber(value); return seconds ? new Date(seconds * 1_000).toISOString() : null }

function leaveType(vacation: Record<string, unknown>): string | null {
  const options = Array.isArray(object(vacation.selector)?.options) ? object(vacation.selector)!.options as unknown[] : []
  for (const option of options) for (const value of Array.isArray(object(option)?.value) ? object(option)!.value as unknown[] : []) {
    const label = text(object(value)?.text); if (label) return label
  }
  return null
}

function findReason(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  for (const item of value) {
    const content = object(item); const control = text(content?.control)?.toLowerCase(); const titleValues = Array.isArray(content?.title) ? content.title : []
    const title = titleValues.map((entry) => text(object(entry)?.text)).filter(Boolean).join('')
    if (control === 'textarea' || title.includes('事由') || title.includes('原因')) {
      const field = object(content?.value); const reason = text(field?.text) ?? (Array.isArray(field?.text) ? field.text.map((entry) => text(object(entry)?.text)).filter(Boolean).join('') : null)
      if (reason) return reason
    }
  }
  return null
}

function vacations(value: unknown, found: { readonly start: number; readonly end: number; readonly duration: number; readonly type: string | null }[] = []): typeof found {
  if (Array.isArray(value)) { for (const child of value) vacations(child, found); return found }
  const current = object(value); if (!current) return found
  const vacation = object(current.vacation); const attendance = object(vacation?.attendance); const range = object(attendance?.date_range)
  const start = positiveNumber(range?.new_begin); const end = positiveNumber(range?.new_end)
  if (vacation && Number(attendance?.type) === 1 && start && end && end >= start) found.push({ start, end, duration: positiveNumber(range?.new_duration) ?? end - start, type: leaveType(vacation) })
  for (const child of Object.values(current)) vacations(child, found)
  return found
}

export function parseWeComLeave(spNo: string, detail: Record<string, unknown>, employeeId: string): WeComLeaveRecord | null {
  const applyer = object(detail.applyer); const userId = text(applyer?.userid); if (!userId) return null
  const ranges = [...new Map(vacations(detail).map((item) => [`${item.start}-${item.end}`, item])).values()]; if (!ranges.length) return null
  const start = Math.min(...ranges.map((item) => item.start)); const end = Math.max(...ranges.map((item) => item.end)); const duration = ranges.reduce((total, item) => total + item.duration, 0)
  const startTime = new Date(start * 1_000).toISOString(); const endTime = new Date(end * 1_000).toISOString()
  const contents = Array.isArray(object(detail.apply_data)?.contents) ? object(detail.apply_data)!.contents : []
  const record = { spNo, employeeId, userId, leaveType: ranges.find((item) => item.type)?.type ?? null, startTime, endTime, duration, reason: findReason(contents), spStatus: Number(detail.sp_status ?? 0), applyTime: isoUnix(detail.apply_time), rawData: detail }
  return { ...record, contentHash: hash(record) }
}

export async function synchronizeWeComLeaves(repository: WeComLeaveRepository, client: WeComLeaveClient, input: LeaveSyncInput): Promise<LeaveSyncResult> {
  const checkpointBefore = await repository.checkpoint(); const runId = await repository.startRun(input.source, input.startDate, input.endDate, checkpointBefore)
  const employees = await repository.employees(); const byUserId = new Map(employees.map((employee) => [employee.wecomUserId, employee.id]))
  const stats = { approvals: 0, upserted: 0, skipped: 0, failed: 0 }; const errors: string[] = []
  try {
    for (const window of checkinWindows(input.startDate, input.endDate)) for (const spNo of await client.approvalNumbers(window.startTime, window.endTime)) {
      stats.approvals += 1
      try {
        const detail = await client.approvalDetail(spNo); const userId = text(object(detail.applyer)?.userid); const employeeId = userId ? byUserId.get(userId) : undefined
        if (!employeeId) { stats.skipped += 1; continue }
        const record = parseWeComLeave(spNo, detail, employeeId); if (!record) { stats.skipped += 1; continue }
        if (await repository.upsert(record) !== 'unchanged') stats.upserted += 1
      } catch (error) { stats.failed += 1; if (errors.length < 20) errors.push(error instanceof Error ? error.message : String(error)) }
    }
    const checkpointAfter = stats.failed === 0 && input.advanceCheckpoint ? new Date().toISOString() : null
    if (checkpointAfter) await repository.advanceCheckpoint(checkpointAfter)
    const status = stats.failed ? 'partial' as const : 'succeeded' as const
    await repository.finishRun(runId, status, stats, checkpointAfter, errors.join('\n') || null)
    return { runId, ...stats, status, checkpointAfter, errors }
  } catch (error) {
    stats.failed += 1; await repository.finishRun(runId, 'failed', stats, null, error instanceof Error ? error.message : String(error)); throw error
  }
}

export async function incrementalLeaveInput(repository: WeComLeaveRepository): Promise<LeaveSyncInput> {
  const endDate = shanghaiToday(); const checkpoint = await repository.checkpoint()
  const startDate = checkpoint ? shiftShanghaiDate(shanghaiToday(new Date(checkpoint)), -30) : shiftShanghaiDate(endDate, -30)
  return { source: 'incremental', startDate, endDate, advanceCheckpoint: true }
}
