import assert from 'node:assert/strict'
import test from 'node:test'

import { synchronizeWeComLeaves } from '../dist/modules/employee/attendance/wecom-leave-sync.js'

test('按企业微信 userid 关联员工并保留请假审批状态', async () => {
  const saved = []
  const repository = {
    employees: async () => [{ id: 'EMP-0001', wecomUserId: 'zhangsan' }],
    checkpoint: async () => null,
    startRun: async () => 7,
    finishRun: async () => undefined,
    advanceCheckpoint: async () => undefined,
    upsert: async (record) => { saved.push(record); return 'inserted' },
  }
  const client = {
    approvalNumbers: async () => ['202609040001'],
    approvalDetail: async () => ({
      sp_status: 1,
      apply_time: 1788420000,
      applyer: { userid: 'zhangsan' },
      apply_data: { contents: [{ control: 'Vacation', value: { vacation: { selector: { options: [{ value: [{ text: '年假' }] }] }, attendance: { type: 1, date_range: { new_begin: 1788426000, new_end: 1788454800, new_duration: 28800 } } } } }, { control: 'Textarea', title: [{ text: '请假事由' }], value: { text: '家庭事务' } }] },
    }),
  }
  const result = await synchronizeWeComLeaves(repository, client, { source: 'history', startDate: '2026-09-03', endDate: '2026-09-03', advanceCheckpoint: false })
  assert.equal(result.approvals, 1)
  assert.equal(result.upserted, 1)
  assert.equal(saved[0].employeeId, 'EMP-0001')
  assert.equal(saved[0].leaveType, '年假')
  assert.equal(saved[0].duration, 28800)
  assert.equal(saved[0].reason, '家庭事务')
  assert.equal(saved[0].spStatus, 1)
})
