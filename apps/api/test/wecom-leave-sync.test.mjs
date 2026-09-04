import assert from 'node:assert/strict'
import test from 'node:test'

import { synchronizeWeComLeaves } from '../dist/modules/employee/attendance/wecom-leave-sync.js'

test('仅将已同意且已关联员工的请假时段写入考勤数据', async () => {
  const saved = []
  const repository = {
    employees: async () => [{ id: 'EMP-0001', wecomUserId: 'zhangsan' }],
    deleteLeave: async () => undefined,
    upsertLeave: async (record) => { saved.push(record) },
  }
  const client = {
    approvalNumbers: async () => ['202609040001'],
    approvalDetail: async () => ({
      sp_status: 2,
      applyer: { userid: 'zhangsan' },
      apply_data: { contents: [{ control: 'Vacation', value: { vacation: { selector: { options: [{ value: [{ text: '年假' }] }] }, attendance: { type: 1, date_range: { new_begin: 1788426000, new_end: 1788454800, new_duration: 28800 } } } } }] },
    }),
  }
  const result = await synchronizeWeComLeaves(repository, client, { startDate: '2026-09-03', endDate: '2026-09-03' })
  assert.deepEqual(result, { approvals: 1, leaves: 1 })
  assert.equal(saved[0].employeeId, 'EMP-0001')
  assert.equal(saved[0].leaveType, '年假')
  assert.equal(saved[0].durationSeconds, 28800)
})
