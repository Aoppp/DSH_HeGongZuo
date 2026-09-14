import assert from 'node:assert/strict'
import test from 'node:test'

import { permissionGuardedEmployeeSource } from '../dist/permission-source.js'

const source = {
  search: async () => ({ total: 1, offset: 0, limit: 20, employees: [] }),
  getById: async () => null,
  listDepartmentMembers: async () => ({ found: false, department: null, memberCount: 0, members: [] }),
  stats: async () => ({ total: 0 }), analyze: async () => ({ total: 0 }), contractAlerts: async () => ({ total: 0 }),
}

test('主助手每次员工查询都校验当前账号权限', async () => {
  let allowed = false
  let checks = 0
  const pool = { query: async () => { checks += 1; return { rows: [{ allowed }] } } }
  const guarded = permissionGuardedEmployeeSource(pool, 'test2', source)
  await assert.rejects(() => guarded.search(), /未开通员工查询权限/)
  allowed = true
  assert.equal((await guarded.search()).total, 1)
  assert.equal(checks, 2)
})
