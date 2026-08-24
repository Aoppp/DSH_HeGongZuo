import type { Pool } from 'pg'

import { checkConfiguredAgentRuntimeHealth } from '../../agent-runtime-proxy.js'

export const managedModuleIds = [
  'management-cockpit',
  'employee-data',
  'employee-agent',
  'finance-management',
  'project-management',
] as const

export type ManagedModuleId = typeof managedModuleIds[number]

const moduleLabels: Record<ManagedModuleId, string> = {
  'management-cockpit': '管理驾驶舱',
  'employee-data': '员工数据',
  'employee-agent': '员工查询',
  'finance-management': '财务管理',
  'project-management': '项目管理',
}

interface ModuleSettingRow {
  readonly module_id: string
  readonly enabled: boolean
  readonly updated_at: string | Date
  readonly updated_by_name: string | null
}

interface AuditRow {
  readonly id: string | number
  readonly action: string
  readonly target_type: string
  readonly target_id: string
  readonly detail: unknown
  readonly created_at: string | Date
  readonly actor_name: string | null
}

function timestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function isManagedModuleId(value: string): value is ManagedModuleId {
  return managedModuleIds.includes(value as ManagedModuleId)
}

export class PlatformManagementError extends Error {}

export class PlatformManagementService {
  constructor(private readonly pool: Pool) {}

  async disabledModuleIds(): Promise<ManagedModuleId[]> {
    const result = await this.pool.query<{ module_id: string }>('SELECT module_id FROM platform_module_settings WHERE enabled = false')
    return result.rows.map((row) => row.module_id).filter(isManagedModuleId)
  }

  async assertModuleEnabled(moduleId: ManagedModuleId): Promise<void> {
    const result = await this.pool.query<{ enabled: boolean }>('SELECT enabled FROM platform_module_settings WHERE module_id = $1', [moduleId])
    if (result.rows[0]?.enabled === false) throw new PlatformManagementError('该功能当前已由平台管理员停用。')
  }

  async status(): Promise<{
    readonly database: 'available'
    readonly agentRuntimes: { readonly expected: number; readonly available: number; readonly unavailable: readonly string[] }
    readonly modules: readonly { readonly id: ManagedModuleId; readonly label: string; readonly enabled: boolean; readonly updatedAt: string | null; readonly updatedBy: string | null }[]
  }> {
    await this.pool.query('SELECT 1')
    const [settings, runtimeHealth] = await Promise.all([
      this.pool.query<ModuleSettingRow>(
        `SELECT s.module_id, s.enabled, s.updated_at, a.display_name AS updated_by_name
         FROM platform_module_settings s LEFT JOIN accounts a ON a.id = s.updated_by_account_id`,
      ),
      checkConfiguredAgentRuntimeHealth(),
    ])
    const settingsById = new Map(settings.rows.map((row) => [row.module_id, row]))
    const unavailable = runtimeHealth.filter((runtime) => !runtime.available)
    return {
      database: 'available',
      agentRuntimes: { expected: runtimeHealth.length, available: runtimeHealth.length - unavailable.length, unavailable: unavailable.map((runtime) => runtime.runtimeId) },
      modules: managedModuleIds.map((id) => {
        const setting = settingsById.get(id)
        return { id, label: moduleLabels[id], enabled: setting?.enabled ?? true, updatedAt: setting ? timestamp(setting.updated_at) : null, updatedBy: setting?.updated_by_name ?? null }
      }),
    }
  }

  async auditLogs(cursor: { readonly createdAt: string; readonly id: number } | null): Promise<{ readonly logs: readonly { readonly id: string; readonly action: string; readonly targetType: string; readonly targetId: string; readonly detail: unknown; readonly createdAt: string; readonly actorName: string | null }[]; readonly nextCursor: { readonly createdAt: string; readonly id: number } | null }> {
    const values: unknown[] = []
    const where = cursor ? (() => { values.push(cursor.createdAt, cursor.id); return 'WHERE (l.created_at, l.id) < ($1::timestamptz, $2::bigint)' })() : ''
    const result = await this.pool.query<AuditRow>(
      `SELECT l.id, l.action, l.target_type, l.target_id, l.detail, l.created_at,
              COALESCE(l.actor_display_name, a.display_name) AS actor_name
         FROM platform_audit_logs l LEFT JOIN accounts a ON a.id = l.actor_account_id
         ${where}
         ORDER BY l.created_at DESC, l.id DESC LIMIT 31`,
      values,
    )
    const rows = result.rows.slice(0, 30)
    const last = rows.at(-1)
    return {
      logs: rows.map((row) => ({ id: String(row.id), action: row.action, targetType: row.target_type, targetId: row.target_id, detail: row.detail, createdAt: timestamp(row.created_at), actorName: row.actor_name })),
      nextCursor: result.rows.length > 30 && last ? { createdAt: timestamp(last.created_at), id: Number(last.id) } : null,
    }
  }

  async setModuleEnabled(moduleId: string, enabled: unknown, actorAccountId: string, actorDisplayName: string): Promise<void> {
    if (!isManagedModuleId(moduleId)) throw new PlatformManagementError('该模块不支持在平台内调整。')
    if (typeof enabled !== 'boolean') throw new PlatformManagementError('模块状态必须为启用或停用。')
    await this.pool.query(
      `INSERT INTO platform_module_settings (module_id, enabled, updated_by_account_id, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (module_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_by_account_id = EXCLUDED.updated_by_account_id, updated_at = now()`,
      [moduleId, enabled, actorAccountId],
    )
    await this.record(actorAccountId, actorDisplayName, enabled ? '启用模块' : '停用模块', '模块', moduleId, { enabled })
  }

  async record(actorAccountId: string, actorDisplayName: string, action: string, targetType: string, targetId: string, detail: Record<string, unknown> = {}): Promise<void> {
    await this.pool.query(
      'INSERT INTO platform_audit_logs (actor_account_id, actor_display_name, action, target_type, target_id, detail) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
      [actorAccountId, actorDisplayName, action, targetType, targetId, JSON.stringify(detail)],
    )
  }
}
