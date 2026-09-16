import type { PostgresAttendanceSnapshot } from '../attendance/postgres-attendance-source.js'
import type { DailyReport } from '../work-reports/daily-report-repository.js'
import type { EmployeeWorkRecordsSource, WorkRecordsSnapshot } from './work-records-source.js'

interface ReportStatisticsSource {
  dashboard(date: string): Promise<{ readonly expected: number; readonly submitted: number; readonly missing: number }>
}
interface ReportSource { analysisRecords(startDate: string, endDate: string): Promise<readonly DailyReport[]> }
interface AttendanceSource { snapshot(date: string): Promise<PostgresAttendanceSnapshot> }

/** 只组合各业务公开查询结果，不另行计算排班、请假或应提交规则。 */
export class SyncedWorkRecordsSource implements EmployeeWorkRecordsSource {
  constructor(private readonly statistics: ReportStatisticsSource, private readonly reports: ReportSource, private readonly attendance: AttendanceSource) {}

  async snapshot(date: string): Promise<WorkRecordsSnapshot> {
    const [statistics, reports, attendance] = await Promise.all([
      this.statistics.dashboard(date), this.reports.analysisRecords(date, date), this.attendance.snapshot(date),
    ])
    return {
      date, source: 'wecom', connectionStatus: 'connected', generatedAt: new Date().toISOString(),
      reports: {
        expected: statistics.expected, submitted: statistics.submitted, missing: statistics.missing,
        records: reports.map((report) => ({
          id: report.record_id, externalUserId: report.employee.user_id ?? '', employeeName: report.employee.name,
          departmentName: report.department.name ?? '未归类部门', templateName: '日报', submittedAt: report.submit_time,
          fields: [{ label: '工作内容', value: report.today_summary ?? '' }, { label: '下一步计划', value: report.tomorrow_plan ?? '' }, { label: '其他事项', value: report.other ?? '' }],
        })),
      },
      attendance: attendance.attendance,
    }
  }
}
