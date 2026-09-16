import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Pool } from 'pg'
import { ServiceCredentialStore, serviceDefinitions, serviceIds, type ServiceId } from '../../../configuration/service-credentials.js'
import { HttpError } from '../../../http/http.js'
import { inTransaction } from '../../../storage/transaction.js'
import { writeAudit, type AuditActor } from '../audit-writer.js'
import { runtimeCredentialStatus } from './runtime-status.js'

export class ServiceCredentialsService {
  readonly store: ServiceCredentialStore
  constructor(private readonly pool: Pool, private readonly root: string) { this.store = new ServiceCredentialStore(pool, root) }

  async list() {
    return Promise.all(serviceIds.map(async (id) => {
      const row = await this.store.row(id)
      let state: string = row ? row.apply_status === 'pending' ? 'applying' : row.apply_status === 'failed' ? 'failed' : 'effective' : 'environment'
      let pending = 0
      if (row?.apply_status === 'pending' && Date.now() - new Date(row.apply_requested_at).getTime() > 300_000) state = 'failed'
      if (row?.apply_status === 'succeeded' && id === 'assistant') {
        try {
          const status = await runtimeCredentialStatus(this.root, row.revision)
          pending = status.pending
          if (status.unknown) state = 'unknown'
          else if (pending) state = 'waiting'
        } catch { state = 'unknown' }
      }
      if (row) { try { await this.store.effective(id) } catch { state = 'unavailable' } }
      return { id, label: serviceDefinitions[id].label, configured: Boolean(row) || this.store.fallbackConfigured(id), revision: row?.revision ?? null,
        updatedAt: row ? new Date(row.updated_at).toISOString() : null, updatedBy: row?.updated_by_name ?? null, state, pending }
    }))
  }

  private async enqueue(revision: string): Promise<void> {
    try {
      const directory = path.join(this.root, '.runtime', 'service-credential-tasks')
      await mkdir(directory, { recursive: true, mode: 0o700 })
      await writeFile(path.join(directory, 'apply.request'), 'apply\n', { mode: 0o600 })
    } catch {
      await this.pool.query("UPDATE platform_service_credentials SET apply_status='failed' WHERE service_id='assistant' AND revision=$1", [revision])
      throw new HttpError(503, '配置已保存，但生效任务提交失败，请点击重新同步。')
    }
  }

  async save(id: ServiceId, key: string, expectedRevision: string | null, actor: AuditActor): Promise<void> {
    const revision = randomUUID()
    const encrypted = await this.store.encrypt(id, revision, key)
    await inTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('platform-service-credential:' || $1))", [id])
      const old = (await client.query<{ revision: string }>('SELECT revision FROM platform_service_credentials WHERE service_id=$1 FOR UPDATE', [id])).rows[0]
      if ((old?.revision ?? null) !== expectedRevision) throw new HttpError(409, '配置已被其他管理员更新，请关闭窗口并刷新后重试。')
      await client.query(`INSERT INTO platform_service_credentials (service_id,encrypted_key,revision,updated_by_name,apply_status,apply_request_id)
        VALUES ($1,$2,$3,$4,$5,$3) ON CONFLICT (service_id) DO UPDATE SET encrypted_key=EXCLUDED.encrypted_key,revision=EXCLUDED.revision,
        updated_at=now(),updated_by_name=EXCLUDED.updated_by_name,apply_status=EXCLUDED.apply_status,restart_requested=false,applied_at=NULL,apply_request_id=EXCLUDED.apply_request_id,apply_requested_at=now()`,
      [id, encrypted, revision, actor.displayName, id === 'assistant' ? 'pending' : 'succeeded'])
      await writeAudit(client, actor, '更换服务凭证', '服务配置', id, { changes: [{ field: 'credential', label: serviceDefinitions[id].label, before: old || this.store.fallbackConfigured(id) ? '已配置' : '未配置', after: '已更换（不记录凭证内容）' }] })
    })
    if (id === 'assistant') await this.enqueue(revision)
  }

  async apply(expectedRevision: string, interrupt: boolean, actor: AuditActor): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('platform-service-credential:assistant'))")
      const result = await client.query(`UPDATE platform_service_credentials SET apply_status='pending',restart_requested=$1,apply_requested_at=now(),apply_request_id=$3
        WHERE service_id='assistant' AND revision=$2 RETURNING revision`, [interrupt, expectedRevision, randomUUID()])
      if (!result.rowCount) throw new HttpError(409, '配置已变化，请刷新后重试。')
      await writeAudit(client, actor, interrupt ? '确认重新连接助手服务' : '重新同步服务凭证', '服务配置', 'assistant', { changes: [{ field: 'application', label: '生效方式', before: '等待生效', after: interrupt ? '允许重新连接，可能中断当前回复' : '保留正在使用的连接' }] })
    })
    await this.enqueue(expectedRevision)
  }
}
