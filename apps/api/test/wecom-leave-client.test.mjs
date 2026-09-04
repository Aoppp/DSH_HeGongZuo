import assert from 'node:assert/strict'
import test from 'node:test'

import { WeComLeaveClient } from '../dist/modules/employee/attendance/wecom-leave-client.js'

test('审批列表使用企业微信 cursor 参数分页', async () => {
  const requests = []
  const firstPage = ['sp-0']
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/gettoken')) return new Response(JSON.stringify({ errcode: 0, access_token: 'token', expires_in: 7200 }))
    requests.push(JSON.parse(init.body))
    return new Response(JSON.stringify(requests.length === 1
      ? { errcode: 0, sp_no_list: firstPage, next_cursor: 100 }
      : { errcode: 0, sp_no_list: ['sp-100'], new_next_cursor: '' }))
  }
  const client = new WeComLeaveClient({ corpId: 'corp', secret: 'secret', fetchImpl })
  const result = await client.approvalNumbers(1, 2)
  assert.deepEqual(result, ['sp-0', 'sp-100'])
  assert.deepEqual(requests, [
    { starttime: 1, endtime: 2, cursor: 0, size: 100 },
    { starttime: 1, endtime: 2, cursor: 100, size: 100 },
  ])
})

test('审批分页遇到重复游标时停止，避免循环请求', async () => {
  let approvals = 0
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/gettoken')) return new Response(JSON.stringify({ errcode: 0, access_token: 'token', expires_in: 7200 }))
    approvals += 1
    const cursor = JSON.parse(init.body).cursor
    return new Response(JSON.stringify({ errcode: 0, sp_no_list: [`sp-${cursor}`], next_cursor: cursor === 0 ? 100 : 0 }))
  }
  const result = await new WeComLeaveClient({ corpId: 'corp', secret: 'secret', fetchImpl }).approvalNumbers(1, 2)
  assert.deepEqual(result, ['sp-0', 'sp-100'])
  assert.equal(approvals, 2)
})
