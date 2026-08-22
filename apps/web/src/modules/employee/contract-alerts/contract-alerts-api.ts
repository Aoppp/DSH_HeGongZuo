// 员工管理 / 合同到期提醒数据访问。
export interface ContractExpiryAlert {
  readonly employeeId: string
  readonly displayName: string
  readonly departmentName: string
  readonly jobTitle: string
  readonly contractEndDate: string
  readonly daysLeft: number
}

export async function readContractExpiryAlerts(): Promise<readonly ContractExpiryAlert[]> {
  const response = await fetch('/api/employees/contract-expiry-alerts', { credentials: 'same-origin' })
  if (!response.ok) throw new Error('无法读取合同到期提醒。')
  const body = await response.json() as { readonly alerts?: unknown }
  return Array.isArray(body.alerts) ? body.alerts as ContractExpiryAlert[] : []
}
