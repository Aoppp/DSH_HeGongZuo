import type { Pool } from 'pg'
import type { PostgresEmployeeRepository } from '../employee/employee-repository.js'
import type { DailyReportAnalyticsRepository } from '../employee/work-reports/daily-report-analytics-repository.js'
import type { PostgresAttendanceSource } from '../employee/attendance/postgres-attendance-source.js'
import { notificationTypes, type NotificationType } from './platform-management.js'

function chinaDate(offset = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  const date = new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day) + offset))
  return date.toISOString().slice(0, 10)
}

export class NotificationService {
  constructor(private readonly pool: Pool, private readonly employees: PostgresEmployeeRepository, private readonly reports: DailyReportAnalyticsRepository, private readonly attendance: PostgresAttendanceSource) {}

  async dispatch(): Promise<void> {
    const recipients = await this.pool.query<{ notification_type: NotificationType; account_id: string }>(`SELECT r.notification_type, r.account_id FROM platform_notification_recipients r JOIN platform_notification_settings s ON s.notification_type=r.notification_type WHERE s.enabled=true`)
    const byType = new Map<NotificationType, string[]>()
    for (const row of recipients.rows) byType.set(row.notification_type, [...(byType.get(row.notification_type) ?? []), row.account_id])
    const send = async (type: NotificationType, sourceKey: string, title: string, content: string, targetPath: string) => {
      for (const accountId of byType.get(type) ?? []) await this.pool.query(`INSERT INTO platform_notifications (account_id,notification_type,source_key,title,content,target_path,resolved_at) VALUES ($1,$2,$3,$4,$5,$6,NULL) ON CONFLICT (account_id,source_key) DO UPDATE SET title=EXCLUDED.title,content=EXCLUDED.content,target_path=EXCLUDED.target_path,resolved_at=NULL`, [accountId, type, sourceKey, title, content, targetPath])
    }
    const resolve = async (type: NotificationType, sourceKey: string) => {
      await this.pool.query('UPDATE platform_notifications SET resolved_at=coalesce(resolved_at,now()), read_at=coalesce(read_at,now()) WHERE notification_type=$1 AND source_key=$2 AND resolved_at IS NULL', [type, sourceKey])
    }
    const today = chinaDate(); const yesterday = chinaDate(-1)
    if (byType.has('contract')) { const key = `contract:${today}`; const alerts = await this.employees.listContractExpiryAlerts(7); if (alerts.length) await send('contract', key, '合同到期提醒', `当前有 ${alerts.length} 名员工处于合同到期提醒范围，其中 ${alerts.filter((item) => item.daysLeft < 0).length} 名已逾期。`, '/employee/data'); else await resolve('contract', key) }
    if (byType.has('daily_report')) { const key = `daily-report:${yesterday}`; const dashboard = await this.reports.dashboard(yesterday); if (dashboard.missing || dashboard.delayed) await send('daily_report', key, '日报提交提醒', `${yesterday}：${dashboard.missing} 人未提交，${dashboard.delayed} 人延后提交。`, `/employee/daily-reports?view=dashboard&date=${yesterday}&focus=exceptions`); else await resolve('daily_report', key) }
    if (byType.has('attendance')) { const key = `attendance:${yesterday}`; const snapshot = await this.attendance.snapshot(yesterday); const records = snapshot.attendance.records; const missing = records.filter((item) => item.status === 'missing').length; const late = records.filter((item) => item.status === 'late' || item.status === 'late_severe' || item.status === 'early_leave').length; if (missing || late) await send('attendance', key, '考勤异常提醒', `${yesterday}：${missing} 人缺卡，${late} 人存在迟到或早退。`, `/employee/attendance?date=${yesterday}&onlyAnomalies=1`); else await resolve('attendance', key) }
  }

  async notifySyncFailure(failedUnit: string): Promise<void> {
    const type = failedUnit.includes('work-daily-sync') ? 'daily_report' : failedUnit.includes('checkin-sync') ? 'attendance' : null
    if (!type) return
    const recipients = await this.pool.query<{ account_id: string }>('SELECT r.account_id FROM platform_notification_recipients r JOIN platform_notification_settings s ON s.notification_type=r.notification_type WHERE r.notification_type=$1 AND s.enabled=true', [type])
    const sourceKey = `sync-failure:${failedUnit}`
    for (const { account_id: accountId } of recipients.rows) await this.pool.query(
      `INSERT INTO platform_notifications (account_id,notification_type,source_key,title,content,target_path,resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,NULL)
       ON CONFLICT (account_id,source_key) DO UPDATE SET content=EXCLUDED.content,created_at=now(),resolved_at=NULL,read_at=NULL`,
      [accountId, type, sourceKey, '数据同步失败', `${type === 'daily_report' ? '日报' : '考勤'}数据同步未完成，请稍后重试或联系管理员。`, type === 'daily_report' ? '/employee/daily-reports?view=list' : '/employee/attendance'],
    )
  }

  async list(accountId: string) { await this.dispatch(); const result = await this.pool.query<{ id: string | number; notification_type: NotificationType; title: string; content: string; target_path: string; created_at: string | Date; read_at: string | Date | null; resolved_at: string | Date | null }>('SELECT id,notification_type,title,content,target_path,created_at,read_at,resolved_at FROM platform_notifications WHERE account_id=$1 ORDER BY resolved_at NULLS FIRST,created_at DESC,id DESC LIMIT 80',[accountId]); const rows=result.rows.map((row)=>({ id:String(row.id),type:row.notification_type,title:row.title,content:row.content,targetPath:row.target_path,createdAt:row.created_at instanceof Date?row.created_at.toISOString():row.created_at,readAt:row.read_at instanceof Date?row.read_at.toISOString():row.read_at,resolvedAt:row.resolved_at instanceof Date?row.resolved_at.toISOString():row.resolved_at })); return { notifications:rows, unread:rows.filter((row)=>!row.readAt&&!row.resolvedAt).length } }
  async markRead(accountId: string, id: string) { await this.pool.query('UPDATE platform_notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND account_id=$2',[id,accountId]) }
  async markAllRead(accountId: string) { await this.pool.query('UPDATE platform_notifications SET read_at=now() WHERE account_id=$1 AND read_at IS NULL',[accountId]) }
}
