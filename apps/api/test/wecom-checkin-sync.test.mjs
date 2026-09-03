import assert from 'node:assert/strict'
import test from 'node:test'

import { parseWeComCheckinRecord } from '../dist/modules/employee/attendance/wecom-checkin-record.js'
import { checkinWindows, synchronizeWeComCheckins } from '../dist/modules/employee/attendance/wecom-checkin-sync.js'

const value = {
  userid: 'wecom-001', checkin_time: 1_788_192_000, checkin_type: '上班打卡', exception_type: '正常',
  groupid: 'group-1', schedule_id: 'schedule-1', standard_checkin_time: 1_788_192_000, location_title: '办公室',
}

test('企业微信打卡记录使用稳定身份字段生成唯一键，内容变化仅触发更新', () => {
  const original = parseWeComCheckinRecord(value)
  const revised = parseWeComCheckinRecord({ ...value, exception_type: '迟到', location_title: '新地点' })
  assert.equal(original.recordKey, revised.recordKey)
  assert.notEqual(original.contentHash, revised.contentHash)
  assert.equal(original.checkinTime, '2026-08-31T16:00:00.000Z')
})

test('历史同步日期范围会自动拆成不超过 30 天的窗口', () => {
  const windows = checkinWindows('2026-07-01', '2026-08-05')
  assert.equal(windows.length, 2)
  assert.equal(windows[0].endTime - windows[0].startTime, 30 * 24 * 60 * 60)
  assert.ok(windows[1].endTime > windows[1].startTime)
})

test('存在单条失败时不推进 checkpoint，并记录为部分成功', async () => {
  const finished = []
  const repository = {
    checkpoint: async () => '2026-09-01T00:00:00.000Z', startRun: async () => 9,
    employees: async () => [{ id: 'EMP-0001', wecomUserId: 'wecom-001' }], unlinkedEmployeeCount: async () => 2,
    upsert: async () => { throw new Error('数据格式错误') }, advanceCheckpoint: async () => { throw new Error('不应推进') },
    finishRun: async (...args) => { finished.push(args) },
  }
  const client = { checkins: async () => [value] }
  const result = await synchronizeWeComCheckins(repository, client, { source: 'incremental', startDate: '2026-09-01', endDate: '2026-09-01', advanceCheckpoint: true })
  assert.equal(result.status, 'partial')
  assert.equal(result.checkpointAfter, null)
  assert.equal(result.skipped, 2)
  assert.equal(finished[0][1], 'partial')
})
