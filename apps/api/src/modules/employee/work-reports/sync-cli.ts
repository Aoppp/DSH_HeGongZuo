import { readFile } from 'node:fs/promises'

import { database } from '../../../database.js'
import { requiredEnvironment } from '../../../environment.js'
import { parseWeComSmartSheetPage, type WeComSmartSheetPage } from './work-daily-record.js'
import { WorkDailyRepository } from './work-daily-repository.js'
import { synchronizeWorkDailyPages } from './work-daily-sync.js'
import { WeComWorkDailySource } from './wecom-smartsheet-client.js'

const syncLockId = '2026090101'

async function *historyPages(filePath: string): AsyncGenerator<WeComSmartSheetPage> {
  const content = await readFile(filePath, 'utf8')
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean)
  if (!lines.length) throw new Error('历史日报文件为空。')
  for (const [index, line] of lines.entries()) {
    try {
      yield parseWeComSmartSheetPage(JSON.parse(line))
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`历史日报文件第 ${index + 1} 行不是有效 JSON。`)
      throw error
    }
  }
}

function summary(result: Awaited<ReturnType<typeof synchronizeWorkDailyPages>>): string {
  return `日报同步完成：run=${result.runId}，拉取=${result.pulled}，新增=${result.inserted}，更新=${result.updated}，未变=${result.unchanged}，失败=${result.failed}`
}

async function main(): Promise<void> {
  const command = process.argv[2]
  if (command !== 'sync' && command !== 'import-history') throw new Error('用法：sync-cli.js <sync|import-history> [NDJSON 文件]')
  const lockClient = await database.connect()
  try {
    const lock = await lockClient.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1::bigint) AS acquired', [syncLockId])
    const repository = new WorkDailyRepository(database)
    if (!lock.rows[0]?.acquired) {
      const runId = await repository.startRun(command === 'sync' ? 'wecom' : 'history')
      const stats = { pulled: 0, inserted: 0, updated: 0, unchanged: 0, failed: 0 }
      await repository.finishRun(runId, 'skipped', stats, '已有日报同步任务正在运行。')
      console.log('已有日报同步任务正在运行，本次已跳过。')
      return
    }
    const result = command === 'sync'
      ? await synchronizeWorkDailyPages(repository, 'wecom', new WeComWorkDailySource({
          docId: requiredEnvironment('WECOM_WORK_DAILY_DOC_ID'),
          sheetId: requiredEnvironment('WECOM_WORK_DAILY_SHEET_ID'),
          ...(process.env.WECOM_CLI_PATH?.trim() ? { executable: process.env.WECOM_CLI_PATH.trim() } : {}),
        }).pages())
      : await synchronizeWorkDailyPages(repository, 'history', historyPages(process.argv[3] ?? '/root/work_daily_records.ndjson'))
    console.log(summary(result))
    if (result.status === 'partial') process.exitCode = 1
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock($1::bigint)', [syncLockId]).catch(() => undefined)
    lockClient.release()
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await database.end()
}
