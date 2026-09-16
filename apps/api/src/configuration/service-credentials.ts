// 共享配置边界：业务模块和运行实例生成器只能通过此处读取受管凭证。
import { constants } from 'node:fs'
import { link, mkdir, open, rm } from 'node:fs/promises'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import path from 'node:path'
import type { Pool } from 'pg'

export const serviceIds = ['assistant', 'daily-report'] as const
export type ServiceId = typeof serviceIds[number]
export const serviceDefinitions = {
  assistant: { label: '助手服务', environmentKey: 'DEEPSEEK_API_KEY' },
  'daily-report': { label: '日报分析服务', environmentKey: 'HEGONGZUO_DAYLYREPORT_DEEPSEEK_API_KEY' },
} as const
export interface CredentialRow {
  service_id: ServiceId; encrypted_key: string; revision: string; updated_at: Date | string;
  updated_by_name: string; apply_status: 'pending' | 'succeeded' | 'failed'; restart_requested: boolean;
  apply_request_id: string; apply_requested_at: Date | string;
}

export class ServiceCredentialStore {
  constructor(readonly database: Pick<Pool, 'query'>, readonly root: string, private readonly environment: NodeJS.ProcessEnv = process.env) {}

  async row(id: ServiceId): Promise<CredentialRow | null> {
    const result = await this.database.query<CredentialRow>('SELECT * FROM platform_service_credentials WHERE service_id=$1', [id])
    return result.rows[0] ?? null
  }

  fallbackConfigured(id: ServiceId): boolean { return Boolean(this.environment[serviceDefinitions[id].environmentKey]?.trim()) }

  private async masterKey(create: boolean): Promise<Buffer> {
    const directory = path.join(this.root, '.runtime', 'platform-secrets')
    const target = path.join(directory, 'service-credentials.key')
    if (create) {
      await mkdir(directory, { recursive: true, mode: 0o700 })
      // 已有密文时不得用新主密钥悄悄替代丢失的保护文件。
      const existing = await this.database.query<{ count: string }>('SELECT count(*)::text AS count FROM platform_service_credentials')
      if (Number(existing.rows[0]?.count ?? 0) > 0) return this.masterKey(false)
      const temporary = `${target}.${randomBytes(12).toString('hex')}.tmp`
      try {
        const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
        try { await handle.writeFile(randomBytes(32)); await handle.sync() } finally { await handle.close() }
        try { await link(temporary, target) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
      } finally { await rm(temporary, { force: true }) }
    }
    const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size !== 32 || (stat.mode & 0o077) !== 0) throw new Error('服务凭证保护文件不可用。')
      return await handle.readFile()
    } finally { await handle.close() }
  }

  async encrypt(id: ServiceId, revision: string, value: string): Promise<string> {
    const key = await this.masterKey(true)
    try {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(Buffer.from(`${id}:${revision}`))
      const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
      return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.')
    } finally { key.fill(0) }
  }

  async effective(id: ServiceId): Promise<{ key: string; revision: string }> {
    const row = await this.row(id)
    if (!row) return { key: this.environment[serviceDefinitions[id].environmentKey]?.trim() ?? '', revision: 'environment' }
    const key = await this.masterKey(false)
    try {
      const parts = row.encrypted_key.split('.').map((part) => Buffer.from(part, 'base64'))
      if (parts.length !== 3 || parts[0]?.length !== 12 || parts[1]?.length !== 16 || !parts[2]) throw new Error('服务凭证不可用。')
      const decipher = createDecipheriv('aes-256-gcm', key, parts[0])
      decipher.setAAD(Buffer.from(`${id}:${row.revision}`)); decipher.setAuthTag(parts[1])
      return { key: Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString('utf8'), revision: row.revision }
    } catch { throw new Error('服务凭证无法读取，请检查保护文件和备份。') }
    finally { key.fill(0) }
  }
}
