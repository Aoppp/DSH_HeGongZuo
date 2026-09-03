import assert from 'node:assert/strict'
import test from 'node:test'

import { synchronizeWeComDirectory } from '../dist/modules/employee/attendance/wecom-directory-sync.js'

test('企业微信通讯录仅关联姓名双方唯一的在职员工，不使用通讯录部门', async () => {
  const links = []
  const repository = {
    unlinkedActiveEmployees: async () => [
      { id: 'EMP-001', displayName: '张 三' },
      { id: 'EMP-002', displayName: '李四' },
      { id: 'EMP-003', displayName: '王五' },
      { id: 'EMP-004', displayName: '王五' },
    ],
    linkEmployee: async (id, userId) => { links.push([id, userId]); return true },
  }
  const client = { directoryMembers: async () => [
    { userId: 'zhangsan', name: '张三' },
    { userId: 'wangwu', name: '王五' },
  ] }
  const result = await synchronizeWeComDirectory(repository, client)
  assert.deepEqual(links, [['EMP-001', 'zhangsan']])
  assert.deepEqual(result, { directoryMembers: 2, candidates: 4, linked: 1, unmatched: 1, ambiguous: 2 })
})
