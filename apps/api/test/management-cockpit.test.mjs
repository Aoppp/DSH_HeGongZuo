import assert from 'node:assert/strict'
import test from 'node:test'

import { ManagementCockpitService } from '../dist/modules/management/management-cockpit.js'

test('管理驾驶舱聚合现有员工、合同、账号、平台和审计数据', async () => {
  const service = new ManagementCockpitService(
    {
      async managementSummary() { return { employed: 82, departed: 3, probation: 5, onLeave: 2, departments: [{ name: '研发部', count: 20 }] } },
      async listContractExpiryAlerts() {
        return [
          { employeeId: 'EMP-1', displayName: '甲', departmentName: '研发部', jobTitle: '工程师', contractEndDate: '2026-08-25', daysLeft: -1 },
          { employeeId: 'EMP-2', displayName: '乙', departmentName: '行政部', jobTitle: '专员', contractEndDate: '2026-08-26', daysLeft: 0 },
          { employeeId: 'EMP-3', displayName: '丙', departmentName: '财务部', jobTitle: '会计', contractEndDate: '2026-08-30', daysLeft: 4 },
        ]
      },
    },
    {
      async list() {
        return [
          { status: 'active' },
          { status: 'disabled' },
          { status: 'initialization_failed' },
        ]
      },
    },
    {
      async status() { return { database: 'available', agentRuntimes: { expected: 6, available: 5, running: 2, idle: 3, unavailable: ['one'] }, modules: [] } },
      async auditLogs() { return { logs: [{ id: '1', action: '编辑员工档案', targetType: '员工', targetId: 'EMP-1', actorName: '管理员', createdAt: '2026-08-26T00:00:00.000Z' }], nextCursor: null } },
    },
  )

  const result = await service.snapshot()
  assert.equal(result.employees.employed, 82)
  assert.deepEqual(result.contracts, { alerts: result.contracts.alerts, expired: 1, dueToday: 1, upcoming: 1 })
  assert.deepEqual(result.accounts, { total: 3, active: 1, disabled: 1, attention: 1 })
  assert.equal(result.platform.agentRuntimes.available, 5)
  assert.equal(result.recentActivity[0].action, '编辑员工档案')
})
