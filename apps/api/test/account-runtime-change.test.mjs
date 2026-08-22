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

const agentPermissions = ['employee-query', 'finance-agent']

test('普通功能权限调整不会触发任何 Agent 运行时初始化', () => {
  assert.deepEqual(runtimeChangeForAccountUpdate(account(), account({ permissions: ['employee-data', 'employee-query', 'finance-management'] }), agentPermissions), { sync: false, provision: false })
})

test('任一已注册 Agent 权限或账号名变化才同步运行时', () => {
  assert.deepEqual(runtimeChangeForAccountUpdate(account({ permissions: ['employee-data'] }), account(), agentPermissions), { sync: true, provision: true })
  assert.deepEqual(runtimeChangeForAccountUpdate(account(), account({ permissions: ['employee-data'] }), agentPermissions), { sync: true, provision: false })
  assert.deepEqual(runtimeChangeForAccountUpdate(account(), account({ permissions: ['employee-data', 'employee-query', 'finance-agent'] }), agentPermissions), { sync: true, provision: true })
  assert.deepEqual(runtimeChangeForAccountUpdate(account(), account({ accountId: 'lisi' }), agentPermissions), { sync: true, provision: true })
})
