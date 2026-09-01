import { access, writeFile } from 'node:fs/promises'
import type { Pool } from 'pg'

import { WorkDailyRepository, type WorkDailySyncRun } from './work-daily-repository.js'

export interface WorkDailyManualSyncState {
  readonly queued: boolean
  readonly run: WorkDailySyncRun | null
}

export class WorkDailyManualSyncError extends Error {}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export class WorkDailyManualSync {
  private readonly repository: WorkDailyRepository

  constructor(pool: Pool, private readonly requestPath: string) {
    this.repository = new WorkDailyRepository(pool)
  }

  private configuredPath(): string {
    const path = this.requestPath.trim()
    if (!path) throw new WorkDailyManualSyncError('手动同步服务尚未配置。')
    return path
  }

  async state(): Promise<WorkDailyManualSyncState> {
    try {
      return { queued: await exists(this.configuredPath()), run: await this.repository.latestRun() }
    } catch (error) {
      if (error instanceof WorkDailyManualSyncError) throw error
      throw new WorkDailyManualSyncError('手动同步状态暂时无法读取。')
    }
  }

  async trigger(): Promise<{ readonly accepted: boolean; readonly state: WorkDailyManualSyncState }> {
    const path = this.configuredPath()
    let accepted = true
    try {
      await writeFile(path, `${new Date().toISOString()}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') accepted = false
      else throw new WorkDailyManualSyncError('手动同步任务提交失败。')
    }
    return { accepted, state: { queued: true, run: await this.repository.latestRun() } }
  }
}
