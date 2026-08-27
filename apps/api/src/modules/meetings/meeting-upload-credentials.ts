import { createHash, randomBytes } from 'node:crypto'
import type { Pool } from 'pg'

function hash(token: string): string { return createHash('sha256').update(token).digest('hex') }

export class MeetingUploadCredentials {
  constructor(private readonly pool: Pool) {}
  async list() {
    const result = await this.pool.query<{ id: string; name: string; token_hint: string; created_at: string | Date; last_used_at: string | Date | null }>(`SELECT id, name, token_hint, created_at, last_used_at FROM meeting_upload_credentials WHERE active = true ORDER BY created_at DESC, id DESC`)
    return result.rows.map((row) => ({ id: row.id, name: row.name, tokenHint: row.token_hint, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at, lastUsedAt: row.last_used_at instanceof Date ? row.last_used_at.toISOString() : row.last_used_at }))
  }
  async create(name: string) {
    const token = `mtg_${randomBytes(32).toString('base64url')}`
    const hint = `${token.slice(0, 8)}…${token.slice(-4)}`
    const id = `muc_${randomBytes(8).toString('hex')}`
    const result = await this.pool.query<{ created_at: string | Date }>(`INSERT INTO meeting_upload_credentials (id, name, token_hash, token_hint, active) VALUES ($1,$2,$3,$4,true) RETURNING created_at`, [id, name, hash(token), hint])
    const createdAt = result.rows[0]?.created_at
    return { id, name, token, tokenHint: hint, createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt ?? new Date().toISOString(), lastUsedAt: null }
  }
  async remove(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM meeting_upload_credentials WHERE id = $1', [id])
    return (result.rowCount ?? 0) === 1
  }
  async authenticate(token: string): Promise<boolean> {
    const result = await this.pool.query(`UPDATE meeting_upload_credentials SET last_used_at = now() WHERE active = true AND token_hash = $1`, [hash(token)])
    return (result.rowCount ?? 0) === 1
  }
}
