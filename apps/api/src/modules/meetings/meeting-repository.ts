import { createHash } from 'node:crypto'
import type { Pool } from 'pg'

import type { MeetingInput } from './meeting-input.js'

interface MeetingRow {
  readonly id: string; readonly title: string; readonly mode: 'chinese' | 'bilingual'; readonly started_at: string | Date; readonly ended_at: string | Date
  readonly summary: string | null; readonly transcript: string; readonly participants: readonly { readonly name: string }[]; readonly created_at: string | Date
}
interface MeetingListRow extends Omit<MeetingRow, 'summary' | 'transcript'> { readonly has_summary: boolean }

function iso(value: string | Date): string { return value instanceof Date ? value.toISOString() : value }
function meeting(row: MeetingRow) { return { id: row.id, title: row.title, mode: row.mode, startedAt: iso(row.started_at), endedAt: iso(row.ended_at), summary: row.summary, transcript: row.transcript, participants: row.participants, createdAt: iso(row.created_at) } }

export class MeetingRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: MeetingInput, idempotencyKey: string): Promise<{ readonly record: ReturnType<typeof meeting>; readonly created: boolean }> {
    const hash = createHash('sha256').update(idempotencyKey).digest('hex')
    const year = Number(input.startedAt.slice(0, 4))
    const prefix = String(year).slice(-2)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1)', [year])
      const existing = await client.query<MeetingRow>('SELECT * FROM meeting_records WHERE idempotency_hash = $1', [hash])
      if (existing.rows[0]) { await client.query('COMMIT'); return { record: meeting(existing.rows[0]), created: false } }
      const sequence = await client.query<{ next: number }>(`SELECT COALESCE(MAX(right(id, 3)::integer), 0) + 1 AS next FROM meeting_records WHERE left(id, 2) = $1`, [prefix])
      const next = Number(sequence.rows[0]?.next ?? 1)
      if (next > 999) throw new Error('本年度会议编号已用完。')
      const id = `${prefix}${String(next).padStart(3, '0')}`
      const result = await client.query<MeetingRow>(`INSERT INTO meeting_records (id, idempotency_hash, title, mode, started_at, ended_at, summary, transcript, participants) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`, [id, hash, input.title, input.mode, input.startedAt, input.endedAt, input.summary, input.transcript, JSON.stringify(input.participants)])
      await client.query('COMMIT')
      return { record: meeting(result.rows[0]!), created: true }
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }

  async get(id: string) {
    const result = await this.pool.query<MeetingRow>('SELECT * FROM meeting_records WHERE id = $1', [id])
    return result.rows[0] ? meeting(result.rows[0]) : null
  }

  async list(input: { readonly query: string; readonly mode: string; readonly date: string; readonly page: number; readonly pageSize: number }) {
    const values: unknown[] = []; const where: string[] = []
    if (input.query) { values.push(`%${input.query}%`); where.push(`(title ILIKE $${values.length} OR id ILIKE $${values.length} OR participants::text ILIKE $${values.length})`) }
    if (input.mode === 'chinese' || input.mode === 'bilingual') { values.push(input.mode); where.push(`mode = $${values.length}`) }
    if (input.date) { values.push(input.date); where.push(`started_at >= ($${values.length}::date AT TIME ZONE 'Asia/Shanghai') AND started_at < (($${values.length}::date + 1) AT TIME ZONE 'Asia/Shanghai')`) }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = await this.pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM meeting_records ${clause}`, values)
    values.push(input.pageSize, (input.page - 1) * input.pageSize)
    const rows = await this.pool.query<MeetingListRow>(`SELECT id, title, mode, started_at, ended_at, participants, created_at, summary IS NOT NULL AS has_summary FROM meeting_records ${clause} ORDER BY started_at DESC, id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values)
    return { records: rows.rows.map((row) => ({ id: row.id, title: row.title, mode: row.mode, startedAt: iso(row.started_at), endedAt: iso(row.ended_at), participants: row.participants, createdAt: iso(row.created_at), hasSummary: row.has_summary })), total: Number(total.rows[0]?.count ?? 0), page: input.page, pageSize: input.pageSize }
  }
}
