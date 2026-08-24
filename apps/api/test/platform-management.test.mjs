import assert from 'node:assert/strict'
import test from 'node:test'

import { PlatformManagementError, PlatformManagementService } from '../dist/modules/platform/platform-management.js'

test('平台模块管理仅允许调整已登记的业务模块，并记录启停操作', async () => {
  const calls = []
  const service = new PlatformManagementService({
    async query(sql, values = []) {
      calls.push({ sql, values })
      return { rows: [] }
    },
  })

  await service.setModuleEnabled('employee-data', false, 'ACC-0001', '管理员')
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0].values, ['employee-data', false, 'ACC-0001'])
  assert.deepEqual(calls[1].values, ['ACC-0001', '管理员', '停用模块', '模块', 'employee-data', '{"enabled":false}'])
  await assert.rejects(service.setModuleEnabled('overview', false, 'ACC-0001', '管理员'), PlatformManagementError)
})
