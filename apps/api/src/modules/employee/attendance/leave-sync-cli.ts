import { database } from '../../../database.js'
import { WeComLeaveClient } from './wecom-leave-client.js'
import { WeComLeaveRepository } from './wecom-leave-repository.js'
import { incrementalLeaveInput, synchronizeWeComLeaves } from './wecom-leave-sync.js'

const lockId = '2026090302'

function option(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1]?.trim() : undefined }
function date(value: string | undefined, name: string): string { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} 必须使用 YYYY-MM-DD 格式。`); return value }

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'sync'; if (command !== 'sync' && command !== 'history') throw new Error('用法：leave-sync-cli.js <sync|history> [--start-date YYYY-MM-DD --end-date YYYY-MM-DD]')
  const repository = new WeComLeaveRepository(database)
  const lockClient = await database.connect()
  try {
    const lock = await lockClient.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1::bigint) AS acquired', [lockId]); if (!lock.rows[0]?.acquired) throw new Error('已有企业微信同步任务正在运行。')
    const input = command === 'sync' ? await incrementalLeaveInput(repository) : { source: 'history' as const, startDate: date(option('--start-date'), '--start-date'), endDate: date(option('--end-date'), '--end-date'), advanceCheckpoint: false }
    const result = await synchronizeWeComLeaves(repository, new WeComLeaveClient(), input)
    console.log(`请假同步完成：run=${result.runId}，审批=${result.approvals}，写入=${result.upserted}，跳过=${result.skipped}，失败=${result.failed}，checkpoint=${result.checkpointAfter ?? '未推进'}`)
    if (result.status !== 'succeeded') process.exitCode = 1
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock($1::bigint)', [lockId]).catch(() => undefined); lockClient.release()
  }
}

try { await main() } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 } finally { await database.end() }
