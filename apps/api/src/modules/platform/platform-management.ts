import type { ServerResponse } from 'node:http'
import type { Pool } from 'pg'

import { checkConfiguredAgentRuntimeHealth } from '../../agent-runtime-proxy.js'

export const managedModuleIds = [
  'management-cockpit',
  'employee-data',
  'employee-agent',
  'employee-attendance',
  'employee-reports',
  'meeting-records',
  'finance-management',
  'project-management',
] as const

export type ManagedModuleId = typeof managedModuleIds[number]

const moduleLabels: Record<ManagedModuleId, string> = {
  'management-cockpit': '管理驾驶舱',
  'employee-data': '员工数据',
  'employee-agent': '员工查询',
  'employee-attendance': '考勤管理',
  'employee-reports': '日报管理',
  'meeting-records': '会议管理',
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
  readonly actor_account_id: string | null
  readonly action: string
  readonly target_type: string
  readonly target_id: string
  readonly detail: unknown
  readonly created_at: string | Date
  readonly actor_name: string | null
}

interface AuditDetail {
  readonly employeeName?: unknown
  readonly changedFields?: unknown
}

function timestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function auditDetail(value: unknown): AuditDetail {
  return value && typeof value === 'object' ? value as AuditDetail : {}
}

function auditChangedFields(value: unknown): string {
  const fields = auditDetail(value).changedFields
  return Array.isArray(fields) && fields.every((field) => typeof field === 'string') ? fields.join('、') : ''
}

function auditEmployeeName(value: unknown): string {
  const name = auditDetail(value).employeeName
  return typeof name === 'string' ? name : ''
}

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? '')
  // 防止 Excel 将审计内容当作公式执行。
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safeText.replaceAll('"', '""')}"`
}

export function auditCsvLine(row: AuditRow): string {
  return [
    timestamp(row.created_at),
    row.actor_name ?? '已删除账号',
    row.actor_account_id,
    row.action,
    row.target_type,
    row.target_id,
    auditEmployeeName(row.detail),
    auditChangedFields(row.detail),
  ].map(csvCell).join(',') + '\r\n'
}

async function writeCsv(response: ServerResponse, content: string): Promise<boolean> {
  if (response.destroyed) return false
  if (response.write(content)) return true
  await new Promise<void>((resolve) => {
    const settle = () => {
      response.off('drain', settle)
      response.off('close', settle)
      resolve()
    }
    response.once('drain', settle)
    response.once('close', settle)
  })
  return !response.destroyed
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
    readonly agentRuntimes: { readonly expected: number; readonly available: number; readonly running: number; readonly idle: number; readonly unavailable: readonly string[] }
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
      agentRuntimes: { expected: runtimeHealth.length, available: runtimeHealth.length - unavailable.length, running: runtimeHealth.filter((runtime) => runtime.state === 'running').length, idle: runtimeHealth.filter((runtime) => runtime.state === 'idle').length, unavailable: unavailable.map((runtime) => runtime.runtimeId) },
      modules: managedModuleIds.map((id) => {
        const setting = settingsById.get(id)
        return { id, label: moduleLabels[id], enabled: setting?.enabled ?? true, updatedAt: setting ? timestamp(setting.updated_at) : null, updatedBy: setting?.updated_by_name ?? null }
      }),
    }
  }

  async auditLogs(cursor: { readonly createdAt: string; readonly id: number } | null): Promise<{ readonly logs: readonly { readonly id: string; readonly action: string; readonly targetType: string; readonly targetId: string; readonly detail: unknown; readonly createdAt: string; readonly actorName: string | null }[]; readonly nextCursor: { readonly createdAt: string; readonly id: number } | null }> {
    const values: unknown[] = []
    const where = cursor
      ? (() => { values.push(cursor.createdAt, cursor.id); return "WHERE l.target_type NOT IN ('工作文件', '工作助理') AND (l.created_at, l.id) < ($1::timestamptz, $2::bigint)" })()
      : "WHERE l.target_type NOT IN ('工作文件', '工作助理')"
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

  async exportAuditCsv(response: ServerResponse): Promise<void> {
    response.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="audit-records.csv"; filename*=UTF-8''${encodeURIComponent('操作记录.csv')}`,
      'cache-control': 'no-store',
    })
    if (!await writeCsv(response, '\uFEFF操作时间,操作账号,操作账号编号,操作,对象类型,对象编号,目标员工,变更字段\r\n')) return

    let cursor: { readonly createdAt: string; readonly id: number } | null = null
    while (!response.destroyed) {
      const values: unknown[] = []
      const where: string = cursor
        ? (() => { values.push(cursor.createdAt, cursor.id); return "WHERE l.target_type NOT IN ('工作文件', '工作助理') AND (l.created_at, l.id) < ($1::timestamptz, $2::bigint)" })()
        : "WHERE l.target_type NOT IN ('工作文件', '工作助理')"
      const result: { readonly rows: readonly AuditRow[] } = await this.pool.query<AuditRow>(
        `SELECT l.id, l.actor_account_id, l.action, l.target_type, l.target_id, l.detail, l.created_at,
                COALESCE(l.actor_display_name, a.display_name) AS actor_name
           FROM platform_audit_logs l LEFT JOIN accounts a ON a.id = l.actor_account_id
           ${where}
           ORDER BY l.created_at DESC, l.id DESC LIMIT 500`,
        values,
      )
      if (result.rows.length === 0) break
      if (!await writeCsv(response, result.rows.map(auditCsvLine).join(''))) return
      const last: AuditRow | undefined = result.rows.at(-1)
      if (!last || result.rows.length < 500) break
      cursor = { createdAt: timestamp(last.created_at), id: Number(last.id) }
    }
    if (!response.destroyed) response.end()
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
