import { createHash, randomBytes } from 'node:crypto'
import type { Pool } from 'pg'

function hash(token: string): string { return createHash('sha256').update(token).digest('hex') }

export class MeetingUploadCredentials {
  constructor(private readonly pool: Pool) {}
  async status() {
    const result = await this.pool.query<{ token_hint: string; created_at: string | Date; last_used_at: string | Date | null }>(`SELECT token_hint, created_at, last_used_at FROM meeting_upload_credentials WHERE id = 'primary' AND active = true`)
    const row = result.rows[0]
    return row ? { configured: true, tokenHint: row.token_hint, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at, lastUsedAt: row.last_used_at instanceof Date ? row.last_used_at.toISOString() : row.last_used_at } : { configured: false, tokenHint: null, createdAt: null, lastUsedAt: null }
  }
  async rotate() {
    const token = `mtg_${randomBytes(32).toString('base64url')}`
    const hint = `${token.slice(0, 8)}…${token.slice(-4)}`
    await this.pool.query(`INSERT INTO meeting_upload_credentials (id, token_hash, token_hint, active, created_at, last_used_at) VALUES ('primary',$1,$2,true,now(),null) ON CONFLICT (id) DO UPDATE SET token_hash=excluded.token_hash, token_hint=excluded.token_hint, active=true, created_at=now(), last_used_at=null`, [hash(token), hint])
    return { token, ...(await this.status()) }
  }
  async authenticate(token: string): Promise<boolean> {
    const result = await this.pool.query(`UPDATE meeting_upload_credentials SET last_used_at = now() WHERE id = 'primary' AND active = true AND token_hash = $1`, [hash(token)])
    return (result.rowCount ?? 0) === 1
  }
}
