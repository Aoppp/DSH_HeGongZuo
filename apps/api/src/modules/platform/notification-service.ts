import type { Pool } from 'pg'
import type { PostgresEmployeeRepository } from '../employee/employee-repository.js'
import type { DailyReportAnalyticsRepository } from '../employee/work-reports/daily-report-analytics-repository.js'
import type { PostgresAttendanceSource } from '../employee/attendance/postgres-attendance-source.js'
import { notificationTypes, type NotificationType } from './platform-management.js'

function chinaDate(offset = 0): string { const date = new Date(); date.setUTCDate(date.getUTCDate() + offset); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(date) }

export class NotificationService {
  constructor(private readonly pool: Pool, private readonly employees: PostgresEmployeeRepository, private readonly reports: DailyReportAnalyticsRepository, private readonly attendance: PostgresAttendanceSource) {}

  async dispatch(): Promise<void> {
    const recipients = await this.pool.query<{ notification_type: NotificationType; account_id: string }>(`SELECT r.notification_type, r.account_id FROM platform_notification_recipients r JOIN platform_notification_settings s ON s.notification_type=r.notification_type WHERE s.enabled=true`)
    const byType = new Map<NotificationType, string[]>()
    for (const row of recipients.rows) byType.set(row.notification_type, [...(byType.get(row.notification_type) ?? []), row.account_id])
    const send = async (type: NotificationType, sourceKey: string, title: string, content: string, targetPath: string) => {
      for (const accountId of byType.get(type) ?? []) await this.pool.query(`INSERT INTO platform_notifications (account_id,notification_type,source_key,title,content,target_path) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (account_id,source_key) DO UPDATE SET title=EXCLUDED.title,content=EXCLUDED.content,target_path=EXCLUDED.target_path`, [accountId, type, sourceKey, title, content, targetPath])
    }
    const today = chinaDate(); const yesterday = chinaDate(-1)
    if (byType.has('contract')) { const alerts = await this.employees.listContractExpiryAlerts(7); if (alerts.length) await send('contract', `contract:${today}`, '合同到期提醒', `当前有 ${alerts.length} 名员工处于合同到期提醒范围，其中 ${alerts.filter((item) => item.daysLeft < 0).length} 名已逾期。`, '/employee/data') }
    if (byType.has('daily_report')) { const dashboard = await this.reports.dashboard(yesterday); if (dashboard.missing || dashboard.delayed) await send('daily_report', `daily-report:${yesterday}`, '日报提交提醒', `${yesterday}：${dashboard.missing} 人未提交，${dashboard.delayed} 人延后提交。`, '/employee/daily-reports') }
    if (byType.has('attendance')) { const snapshot = await this.attendance.snapshot(yesterday); const records = snapshot.attendance.records; const missing = records.filter((item) => item.status === 'missing').length; const late = records.filter((item) => item.status === 'late' || item.status === 'late_severe' || item.status === 'early_leave').length; if (missing || late) await send('attendance', `attendance:${yesterday}`, '考勤异常提醒', `${yesterday}：${missing} 人缺卡，${late} 人存在迟到或早退。`, '/employee/attendance') }
  }

  async list(accountId: string) { await this.dispatch(); const result = await this.pool.query<{ id: string | number; notification_type: NotificationType; title: string; content: string; target_path: string; created_at: string | Date; read_at: string | Date | null }>('SELECT id,notification_type,title,content,target_path,created_at,read_at FROM platform_notifications WHERE account_id=$1 ORDER BY created_at DESC,id DESC LIMIT 40',[accountId]); const rows=result.rows.map((row)=>({ id:String(row.id),type:row.notification_type,title:row.title,content:row.content,targetPath:row.target_path,createdAt:row.created_at instanceof Date?row.created_at.toISOString():row.created_at,readAt:row.read_at instanceof Date?row.read_at.toISOString():row.read_at })); return { notifications:rows, unread:rows.filter((row)=>!row.readAt).length } }
  async markRead(accountId: string, id: string) { await this.pool.query('UPDATE platform_notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND account_id=$2',[id,accountId]) }
  async markAllRead(accountId: string) { await this.pool.query('UPDATE platform_notifications SET read_at=now() WHERE account_id=$1 AND read_at IS NULL',[accountId]) }
}
