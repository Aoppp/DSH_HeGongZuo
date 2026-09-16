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

test('增量同步复查窗口外的旧审批，列表重复审批只查询一次', async () => {
  const fetched = [], saved = [], finished = []
  const repository = {
    checkpoint: async () => null, startRun: async () => 8,
    employees: async () => [{ id: 'EMP-1', wecomUserId: 'test' }],
    refreshableApprovalNumbers: async () => ['old-pending', 'old-approved'],
    finishRun: async (...args) => finished.push(args),
    upsert: async (record) => { saved.push(record); return 'updated' },
  }
  const detail = { sp_status: 4, applyer: { userid: 'test' }, vacation: { attendance: { type: 1, date_range: { new_begin: 1788426000, new_end: 1788454800, new_duration: 28800 } } } }
  const client = { approvalNumbers: async () => ['old-approved', 'recent'], approvalDetail: async (id) => { fetched.push(id); return detail } }
  const result = await synchronizeWeComLeaves(repository, client, { source: 'incremental', startDate: '2026-09-01', endDate: '2026-09-02', advanceCheckpoint: true })
  assert.deepEqual(fetched, ['old-pending', 'old-approved', 'recent'])
  assert.equal(saved[0].spStatus, 4)
  assert.equal(result.approvals, 3)
  assert.equal(finished[0][3], result.checkpointAfter)
  assert.ok(result.checkpointAfter)
})

test('请假同步前置查询失败会记录失败，不留下运行中状态', async () => {
  const finished = []
  const repository = { checkpoint: async () => null, startRun: async () => 8, employees: async () => { throw new Error('连接失败') }, finishRun: async (...args) => finished.push(args) }
  await assert.rejects(synchronizeWeComLeaves(repository, {}, { source: 'history', startDate: '2026-09-01', endDate: '2026-09-02', advanceCheckpoint: false }), /连接失败/)
  assert.equal(finished[0][1], 'failed')
})
