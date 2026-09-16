import type { Pool } from 'pg'
import { HttpError } from '../../http/http.js'
import { inTransaction } from '../../storage/transaction.js'
import { writeAudit, type AuditActor } from '../platform/audit-writer.js'
import { MeetingRepository } from './meeting-repository.js'

export class MeetingWriteService {
  constructor(private readonly pool: Pool) {}
  updateSummary(id: string, summary: string | null, actor: AuditActor) {
    return inTransaction(this.pool, async (client) => {
      const repository = new MeetingRepository(this.pool, client)
      const previous = await repository.get(id, true)
      if (!previous) throw new HttpError(404, '会议记录不存在。')
      const record = await repository.updateSummary(id, summary)
      if (!record) throw new HttpError(404, '会议记录不存在。')
      if (previous.summary !== summary) await writeAudit(client, actor, '修改会议摘要', '会议记录', id, { changes: [{ field: 'summary', label: '会议摘要', before: previous.summary ? `${previous.summary.length} 字` : '未填写', after: summary ? `${summary.length} 字` : '已清空' }] })
      return record
    })
  }
}
