import { database } from '../../../database.js'
import { WeComCheckinClient } from './wecom-checkin-client.js'
import { WeComCheckinRepository } from './wecom-checkin-repository.js'
import { incrementalCheckinInput, shiftShanghaiDate, synchronizeWeComCheckins } from './wecom-checkin-sync.js'
import { synchronizeWeComSchedules } from './wecom-schedule-sync.js'
import { WeComLeaveClient } from './wecom-leave-client.js'
import { synchronizeWeComLeaves } from './wecom-leave-sync.js'

const lockId = '2026090302'

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined
}

function date(value: string | undefined, name: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} 必须使用 YYYY-MM-DD 格式。`)
  return value
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'sync'
  if (command !== 'sync' && command !== 'history') throw new Error('用法：checkin-sync-cli.js <sync|history> [--start-date YYYY-MM-DD --end-date YYYY-MM-DD] [--employee 企业微信userid]')
  const repository = new WeComCheckinRepository(database)
  const lockClient = await database.connect()
  try {
    const lock = await lockClient.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1::bigint) AS acquired', [lockId])
    if (!lock.rows[0]?.acquired) throw new Error('已有企业微信打卡同步任务正在运行。')
    const employeeUserId = option('--employee')
    const input = command === 'sync'
      ? await incrementalCheckinInput(repository)
      : { source: 'history' as const, startDate: date(option('--start-date'), '--start-date'), endDate: date(option('--end-date'), '--end-date'), ...(employeeUserId ? { employeeUserId } : {}), advanceCheckpoint: false }
    const client = new WeComCheckinClient()
    const result = await synchronizeWeComCheckins(repository, client, input)
    const scheduleResult = await synchronizeWeComSchedules(repository, client, input)
    const leaveInput = command === 'sync' ? { startDate: shiftShanghaiDate(input.endDate, -30), endDate: input.endDate } : input
    const leaveResult = process.env.HEGONGZUO_WECOM_APPROVAL_SECRET?.trim()
      ? await synchronizeWeComLeaves(repository, new WeComLeaveClient(), leaveInput)
      : null
    console.log(`打卡同步完成：run=${result.runId}，员工=${result.employees}，拉取=${result.pulled}，新增=${result.inserted}，更新=${result.updated}，未变=${result.unchanged}，跳过=${result.skipped}，失败=${result.failed}，checkpoint=${result.checkpointAfter ?? '未推进'}`)
    console.log(`排班同步完成：员工=${scheduleResult.employees}，排班=${scheduleResult.schedules}`)
    console.log(leaveResult ? `请假同步完成：审批=${leaveResult.approvals}，请假时段=${leaveResult.leaves}` : '请假同步未启用：未配置 HEGONGZUO_WECOM_APPROVAL_SECRET。')
    if (result.status !== 'succeeded') process.exitCode = 1
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock($1::bigint)', [lockId]).catch(() => undefined)
    lockClient.release()
  }
}

try { await main() } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 } finally { await database.end() }
