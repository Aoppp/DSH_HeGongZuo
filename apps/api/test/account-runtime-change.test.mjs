import assert from 'node:assert/strict'
import test from 'node:test'

import { runtimeChangeForAccountUpdate } from '../dist/modules/accounts/account-runtime-change.js'

function account(overrides = {}) {
  return {
    id: 'ACC-0001', accountId: 'zhangsan', displayName: '张三', position: '员工', status: 'active',
    permissions: ['employee-data', 'employee-query'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

test('普通功能权限调整不会触发员工查询运行时初始化', () => {
  assert.deepEqual(runtimeChangeForAccountUpdate(account(), account({ permissions: ['employee-data', 'employee-query', 'finance-management'] })), { sync: false, provision: false })
})

test('员工查询权限或账号名变化才同步运行时', () => {
  assert.deepEqual(runtimeChangeForAccountUpdate(account({ permissions: ['employee-data'] }), account()), { sync: true, provision: true })
  assert.deepEqual(runtimeChangeForAccountUpdate(account(), account({ permissions: ['employee-data'] })), { sync: true, provision: false })
  assert.deepEqual(runtimeChangeForAccountUpdate(account(), account({ accountId: 'lisi' })), { sync: true, provision: true })
})
