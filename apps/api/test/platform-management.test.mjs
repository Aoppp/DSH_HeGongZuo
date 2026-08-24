import assert from 'node:assert/strict'
import test from 'node:test'

import { auditCsvLine, PlatformManagementError, PlatformManagementService } from '../dist/modules/platform/platform-management.js'

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

test('审计 CSV 仅导出操作元信息和变更字段，并安全转义内容', () => {
  const line = auditCsvLine({
    id: 1,
    actor_account_id: 'ACC-0001',
    actor_name: '张,三',
    action: '编辑员工档案',
    target_type: '员工',
    target_id: 'EMP-0001',
    detail: { employeeName: '王"五', changedFields: ['工作电话', '身份证号'] },
    created_at: '2026-08-24T03:00:00.000Z',
  })
  assert.match(line, /"张,三"/)
  assert.match(line, /"王""五"/)
  assert.match(line, /"工作电话、身份证号"/)
  assert.doesNotMatch(line, /\+8613800000000/)
})
