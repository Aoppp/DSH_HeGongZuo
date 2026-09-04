import { parseWeComCheckinRecord } from './wecom-checkin-record.js'
import type { WeComCheckinRepository, CheckinSyncSource, CheckinSyncStats } from './wecom-checkin-repository.js'
import type { WeComCheckinClient } from './wecom-checkin-client.js'

const shanghaiOffset = 8 * 60 * 60 * 1_000
const dayMilliseconds = 24 * 60 * 60 * 1_000
const overlapDays = 3

export interface CheckinSyncInput {
  readonly source: CheckinSyncSource
  readonly startDate: string
  readonly endDate: string
  readonly employeeUserId?: string
  readonly advanceCheckpoint: boolean
}

export interface CheckinSyncResult extends CheckinSyncStats {
  readonly runId: number
  readonly status: 'succeeded' | 'partial'
  readonly checkpointBefore: string | null
  readonly checkpointAfter: string | null
  readonly errors: readonly string[]
}

function dateAtShanghaiMidnight(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期必须使用 YYYY-MM-DD 格式。')
  const time = Date.parse(`${date}T00:00:00+08:00`)
  if (Number.isNaN(time)) throw new Error(`无效日期：${date}`)
  return time
}

export function shanghaiToday(now = new Date()): string {
  return new Date(now.getTime() + shanghaiOffset).toISOString().slice(0, 10)
}

export function shiftShanghaiDate(date: string, days: number): string {
  return new Date(dateAtShanghaiMidnight(date) + days * dayMilliseconds + shanghaiOffset).toISOString().slice(0, 10)
}

export function checkinWindows(startDate: string, endDate: string): readonly { readonly startTime: number; readonly endTime: number }[] {
  const start = dateAtShanghaiMidnight(startDate)
  const endExclusive = dateAtShanghaiMidnight(shiftShanghaiDate(endDate, 1))
  if (endExclusive <= start) throw new Error('结束日期不能早于开始日期。')
  const windows: { startTime: number; endTime: number }[] = []
  for (let cursor = start; cursor < endExclusive;) {
    const next = Math.min(cursor + 30 * dayMilliseconds, endExclusive)
    windows.push({ startTime: Math.floor(cursor / 1_000), endTime: Math.floor(next / 1_000) })
    cursor = next
  }
  return windows
}

function chunks<T>(values: readonly T[], size: number): readonly T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size))
}

function text(error: unknown): string { return error instanceof Error ? error.message : String(error) }

export async function synchronizeWeComCheckins(repository: WeComCheckinRepository, client: WeComCheckinClient, input: CheckinSyncInput): Promise<CheckinSyncResult> {
  const checkpointBefore = await repository.checkpoint()
  const runId = await repository.startRun(input.source, input.startDate, input.endDate, checkpointBefore)
  const employees = await repository.employees(input.employeeUserId)
  const byUserId = new Map(employees.map((employee) => [employee.wecomUserId, employee]))
  const stats = { employees: employees.length, pulled: 0, inserted: 0, updated: 0, unchanged: 0, skipped: await repository.unlinkedEmployeeCount(), failed: 0 }
  const errors: string[] = []
  try {
    for (const window of checkinWindows(input.startDate, input.endDate)) {
      for (const batch of chunks(employees, 100)) {
        const values = await client.checkins(batch.map((employee) => employee.wecomUserId), window.startTime, window.endTime)
        stats.pulled += values.length
        for (const value of values) {
          try {
            const record = parseWeComCheckinRecord(value)
            const employee = byUserId.get(record.wecomUserId)
            if (!employee) { stats.skipped += 1; if (errors.length < 20) errors.push(`跳过未关联企业微信用户：${record.wecomUserId}`); continue }
            stats[await repository.upsert(employee.id, record)] += 1
          } catch (error) { stats.failed += 1; if (errors.length < 20) errors.push(text(error)) }
        }
      }
    }
    const succeeded = stats.failed === 0
    const checkpointAfter = succeeded && input.advanceCheckpoint ? new Date().toISOString() : null
    if (checkpointAfter) await repository.advanceCheckpoint(checkpointAfter)
    const status = succeeded ? 'succeeded' : 'partial'
    await repository.finishRun(runId, status, stats, checkpointAfter, errors.length ? errors.join('\n') : null)
    return { runId, status, checkpointBefore, checkpointAfter, ...stats, errors }
  } catch (error) {
    stats.failed += 1
    const failure = text(error)
    await repository.finishRun(runId, 'failed', stats, null, failure)
    throw error
  }
}

export async function incrementalCheckinInput(repository: WeComCheckinRepository): Promise<CheckinSyncInput> {
  const checkpoint = await repository.checkpoint()
  const endDate = shanghaiToday()
  const checkpointDate = checkpoint ? shanghaiToday(new Date(checkpoint)) : shiftShanghaiDate(endDate, -7)
  return { source: 'incremental', startDate: shiftShanghaiDate(checkpointDate, -overlapDays), endDate, advanceCheckpoint: true }
}
