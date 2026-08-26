import assert from 'node:assert/strict'
import test from 'node:test'

import { platformManagementPermissionIds } from '../../../packages/employee-domain/src/index.ts'

test('账号权限覆盖业务模块与平台管理能力', () => {
  assert.deepEqual(platformManagementPermissionIds, [
    'employee-data',
    'employee-query',
    'employee-work-records',
    'finance-management',
    'project-management',
    'management-cockpit',
    'platform-administration',
  ])
})
