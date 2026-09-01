import { parseWeComWorkDailyRecord, type WeComSmartSheetPage } from './work-daily-record.js'
import { WorkDailyRepository, type WorkDailySyncSource, type WorkDailySyncStats } from './work-daily-repository.js'

export interface WorkDailySyncResult extends WorkDailySyncStats {
  readonly runId: number
  readonly status: 'succeeded' | 'partial'
  readonly errors: readonly string[]
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function synchronizeWorkDailyPages(
  repository: WorkDailyRepository,
  source: WorkDailySyncSource,
  pages: AsyncIterable<WeComSmartSheetPage>,
): Promise<WorkDailySyncResult> {
  const runId = await repository.startRun(source)
  const stats = { pulled: 0, inserted: 0, updated: 0, unchanged: 0, failed: 0 }
  const errors: string[] = []
  try {
    for await (const page of pages) {
      stats.pulled += page.records.length
      for (const value of page.records) {
        try {
          const outcome = await repository.upsert(parseWeComWorkDailyRecord(value))
          stats[outcome] += 1
        } catch (error) {
          stats.failed += 1
          if (errors.length < 20) errors.push(message(error))
        }
      }
    }
    await repository.linkUniqueReporters()
    const status = stats.failed > 0 ? 'partial' : 'succeeded'
    await repository.finishRun(runId, status, stats, errors.length ? errors.join('\n') : null)
    return { runId, status, ...stats, errors }
  } catch (error) {
    stats.failed += 1
    const fatalError = message(error)
    errors.push(fatalError)
    await repository.finishRun(runId, 'failed', stats, errors.slice(0, 20).join('\n'))
    throw error
  }
}
