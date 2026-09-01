import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { parseWeComSmartSheetPage, type WeComSmartSheetPage } from './work-daily-record.js'

const executeFile = promisify(execFile)

export interface WeComWorkDailySourceOptions {
  readonly docId: string
  readonly sheetId: string
  readonly executable?: string
  readonly pageSize?: number
}

export class WeComWorkDailySource {
  private readonly executable: string
  private readonly pageSize: number

  constructor(private readonly options: WeComWorkDailySourceOptions) {
    this.executable = options.executable ?? 'wecom-cli'
    this.pageSize = options.pageSize ?? 1_000
    if (!options.docId.trim() || !options.sheetId.trim()) throw new Error('企业微信智能表格 docid 和 sheet_id 不能为空。')
    if (!Number.isSafeInteger(this.pageSize) || this.pageSize < 1 || this.pageSize > 1_000) throw new Error('企业微信分页条数必须在 1 至 1000 之间。')
  }

  private async page(cursor: string | null): Promise<WeComSmartSheetPage> {
    const args = ['smartsheet', 'records', 'list', '--docid', this.options.docId, '--sheet-id', this.options.sheetId, '--limit', String(this.pageSize)]
    if (cursor) args.push('--cursor', cursor)
    const { stdout } = await executeFile(this.executable, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120_000 })
    const responses = stdout.split('\n').map((line) => line.trim()).filter(Boolean)
    if (responses.length !== 1) throw new Error(`wecom-cli 返回了 ${responses.length} 个响应，预期为 1。`)
    try {
      return parseWeComSmartSheetPage(JSON.parse(responses[0]!))
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error('wecom-cli 返回了无效 JSON。')
      throw error
    }
  }

  async *pages(): AsyncGenerator<WeComSmartSheetPage> {
    const seenCursors = new Set<string>()
    let cursor: string | null = null
    while (true) {
      const page = await this.page(cursor)
      yield page
      if (!page.hasMore) return
      if (!page.nextCursor) throw new Error('企业微信声明仍有后续数据，但没有返回 next_cursor。')
      if (seenCursors.has(page.nextCursor)) throw new Error('企业微信返回了重复分页游标，已停止同步。')
      seenCursors.add(page.nextCursor)
      cursor = page.nextCursor
    }
  }
}
