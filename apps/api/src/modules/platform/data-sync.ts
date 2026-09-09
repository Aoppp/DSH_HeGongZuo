import type { Pool } from 'pg'

const sources = [
  { id: 'daily', label: '日报', table: 'employee_work_daily_sync_runs' },
  { id: 'attendance', label: '考勤', table: 'employee_wecom_checkin_sync_runs' },
  { id: 'leave', label: '请假审批', table: 'employee_wecom_leave_sync_runs' },
] as const

export function syncFailureAdvice(message: string | null): string {
  if (!message) return '同步未完成，请重试；持续失败请联系管理员。'
  if (/850003|authorization expired/i.test(message)) return '企业微信文档授权已过期，请机器人创建者在企业微信工作台重新授权后重试。'
  if (/timeout|timed out|ECONN|fetch failed/i.test(message)) return '连接企业微信超时或网络异常，请稍后重试。'
  if (/secret|credential|token|401|40014|42001/i.test(message)) return '企业微信访问凭证异常，请管理员检查授权配置。'
  if (/wecom-cli/i.test(message)) return '企业微信文档读取失败，请检查机器人文档授权与访问权限后重试。'
  return '同步失败，请管理员检查同步服务日志。'
}

export async function readDataSync(pool: Pool) {
  return Promise.all(sources.map(async (source) => {
    const result = await pool.query(`SELECT latest.*, (SELECT max(finished_at) FROM ${source.table} WHERE status='succeeded') AS last_success_at FROM (SELECT * FROM ${source.table} ORDER BY id DESC LIMIT 1) latest`)
    const row = result.rows[0]
    const failed = row && ['failed', 'partial'].includes(row.status)
    return { id: source.id, label: source.label, status: row?.status ?? 'never', startedAt: row?.started_at ?? null, finishedAt: row?.finished_at ?? null, lastSuccessAt: row?.last_success_at ?? null,
      counts: row ? { pulled: row.pulled_count ?? row.approval_count ?? 0, inserted: row.inserted_count ?? null, updated: row.updated_count ?? null, saved: row.upserted_count ?? null, failed: row.failed_count ?? 0 } : null,
      advice: failed ? syncFailureAdvice(row.error_message) : null }
  }))
}
