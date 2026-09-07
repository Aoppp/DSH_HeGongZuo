import { database } from '../../database.js'
import { PostgresEmployeeRepository } from '../employee/employee-repository.js'
import { PostgresAttendanceSource } from '../employee/attendance/postgres-attendance-source.js'
import { DailyReportAnalyticsRepository } from '../employee/work-reports/daily-report-analytics-repository.js'
import { NotificationService } from './notification-service.js'

try {
  await new NotificationService(database, new PostgresEmployeeRepository(database), new DailyReportAnalyticsRepository(database), new PostgresAttendanceSource(database)).dispatch()
  console.log('站内通知生成完成。')
} finally {
  await database.end()
}
