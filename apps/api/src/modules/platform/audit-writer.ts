import type { Pool } from 'pg'

export interface AuditActor { readonly id: string; readonly displayName: string }
export async function writeAudit(database: Pick<Pool, 'query'>, actor: AuditActor, action: string, targetType: string, targetId: string, detail: Record<string, unknown> = {}): Promise<void> {
  await database.query(
    'INSERT INTO platform_audit_logs (actor_account_id, actor_display_name, action, target_type, target_id, detail) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
    [actor.id, actor.displayName, action, targetType, targetId, JSON.stringify(detail)],
  )
}
