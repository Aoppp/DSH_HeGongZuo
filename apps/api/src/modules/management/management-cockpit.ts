import type { AccountRecord } from '../../accounts.js'
import type { ContractExpiryAlert, EmployeeManagementSummary } from '../employee/employee-repository.js'
import type { PlatformManagementService } from '../platform/platform-management.js'
import type { EmployeeWorkRecordsSource } from '../employee/work-records/work-records-source.js'

interface EmployeeSource {
  managementSummary(): Promise<EmployeeManagementSummary>
  listContractExpiryAlerts(days?: number): Promise<ContractExpiryAlert[]>
}

interface AccountSource {
  list(): Promise<AccountRecord[]>
}

export class ManagementCockpitService {
  constructor(
    private readonly employees: EmployeeSource,
    private readonly accounts: AccountSource,
    private readonly platform: PlatformManagementService,
    private readonly workRecords?: EmployeeWorkRecordsSource,
  ) {}

  async snapshot() {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
    const [employees, contractAlerts, accounts, platform, audit, workRecords] = await Promise.all([
      this.employees.managementSummary(),
      this.employees.listContractExpiryAlerts(7),
      this.accounts.list(),
      this.platform.status(),
      this.platform.auditLogs(null),
      this.workRecords?.snapshot(today) ?? null,
    ])
    return {
      generatedAt: new Date().toISOString(),
      employees,
      contracts: {
        alerts: contractAlerts,
        expired: contractAlerts.filter((alert) => alert.daysLeft < 0).length,
        dueToday: contractAlerts.filter((alert) => alert.daysLeft === 0).length,
        upcoming: contractAlerts.filter((alert) => alert.daysLeft > 0).length,
      },
      accounts: {
        total: accounts.length,
        active: accounts.filter((account) => account.status === 'active').length,
        disabled: accounts.filter((account) => account.status === 'disabled').length,
        attention: accounts.filter((account) => account.status === 'initializing' || account.status === 'initialization_failed').length,
      },
      platform,
      workRecords: workRecords ? {
        source: workRecords.source,
        connectionStatus: workRecords.connectionStatus,
        date: workRecords.date,
        reports: { expected: workRecords.reports.expected, submitted: workRecords.reports.submitted, missing: workRecords.reports.missing },
        attendance: { expected: workRecords.attendance.expected, normal: workRecords.attendance.normal, exceptions: workRecords.attendance.exceptions },
      } : null,
      recentActivity: audit.logs.slice(0, 6).map((log) => ({
        id: log.id,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        actorName: log.actorName,
        createdAt: log.createdAt,
      })),
    }
  }
}
