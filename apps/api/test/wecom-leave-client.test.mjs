import assert from 'node:assert/strict'
import test from 'node:test'

import { WeComLeaveClient } from '../dist/modules/employee/attendance/wecom-leave-client.js'

test('审批列表使用企业微信 cursor 参数分页', async () => {
  const requests = []
  const firstPage = Array.from({ length: 100 }, (_, index) => `sp-${index}`)
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/gettoken')) return new Response(JSON.stringify({ errcode: 0, access_token: 'token', expires_in: 7200 }))
    requests.push(JSON.parse(init.body))
    return new Response(JSON.stringify(requests.length === 1
      ? { errcode: 0, sp_no_list: firstPage, next_cursor: 100 }
      : { errcode: 0, sp_no_list: ['sp-100'] }))
  }
  const client = new WeComLeaveClient({ corpId: 'corp', secret: 'secret', fetchImpl })
  const result = await client.approvalNumbers(1, 2)
  assert.equal(result.length, 101)
  assert.deepEqual(requests, [
    { starttime: 1, endtime: 2, cursor: 0, size: 100 },
    { starttime: 1, endtime: 2, cursor: 100, size: 100 },
  ])
})
