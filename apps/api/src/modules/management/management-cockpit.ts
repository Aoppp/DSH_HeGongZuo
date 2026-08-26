import type { AccountRecord } from '../../accounts.js'
import type { ContractExpiryAlert, EmployeeManagementSummary } from '../employee/employee-repository.js'
import type { PlatformManagementService } from '../platform/platform-management.js'

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
  ) {}

  async snapshot() {
    const [employees, contractAlerts, accounts, platform, audit] = await Promise.all([
      this.employees.managementSummary(),
      this.employees.listContractExpiryAlerts(7),
      this.accounts.list(),
      this.platform.status(),
      this.platform.auditLogs(null),
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
