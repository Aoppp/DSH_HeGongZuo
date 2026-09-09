import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readDataSync, syncFailureAdvice } from '../dist/modules/platform/data-sync.js'

test('sync errors provide actionable advice without exposing raw credentials', () => {
  assert.match(syncFailureAdvice('850003 authorization expired'), /授权已过期/)
  assert.match(syncFailureAdvice('ETIMEDOUT timeout'), /超时/)
  assert.ok(!syncFailureAdvice('secret=private-value').includes('private-value'))
})
test('sync status keeps successful timestamp distinct from latest failed execution', async () => {
  const sources = await readDataSync({ query: async () => ({ rows: [{ status: 'failed', started_at: '2026-09-09', last_success_at: '2026-09-07', error_message: '850003', failed_count: 1, approval_count: 3, upserted_count: 2 }] }) })
  assert.equal(sources.length, 3)
  assert.equal(sources[0].lastSuccessAt, '2026-09-07')
  assert.equal(sources[0].startedAt, '2026-09-09')
  assert.equal(sources[2].counts.saved, 2)
  assert.ok(!('error_message' in sources[0]))
})
