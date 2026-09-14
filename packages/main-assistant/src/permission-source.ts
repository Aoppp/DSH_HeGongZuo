import type { EmployeeDataSource } from '@hegongzuo/employee-agent'
import type { Pool } from 'pg'

export function permissionGuardedEmployeeSource(pool: Pool, accountId: string, source: EmployeeDataSource): EmployeeDataSource {
  async function ensurePermission(): Promise<void> {
    const result = await pool.query<{ allowed: boolean }>(`SELECT EXISTS (
      SELECT 1 FROM accounts account
      JOIN account_module_permissions permission ON permission.account_id=account.id
      WHERE account.account_id=$1 AND account.status='active' AND permission.permission_id='employee-query'
    ) AS allowed`, [accountId])
    if (!result.rows[0]?.allowed) throw new Error('当前账号未开通员工查询权限。')
  }

  return {
    async search(criteria) { await ensurePermission(); return source.search(criteria) },
    async getById(identifier) { await ensurePermission(); return source.getById(identifier) },
    async listDepartmentMembers(department) { await ensurePermission(); return source.listDepartmentMembers(department) },
    async stats() { await ensurePermission(); return source.stats() },
    async analyze(criteria) { await ensurePermission(); return source.analyze(criteria) },
    async contractAlerts(criteria) { await ensurePermission(); return source.contractAlerts(criteria) },
  }
}
