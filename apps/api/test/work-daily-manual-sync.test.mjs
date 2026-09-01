import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { WorkDailyManualSync } from '../dist/modules/employee/work-reports/work-daily-manual-sync.js'

function poolWithLatestRun() {
  return {
    query: async () => ({ rows: [{
      id: '12', source: 'wecom', status: 'succeeded', started_at: new Date('2026-09-01T14:00:00Z'), finished_at: new Date('2026-09-01T14:01:00Z'),
      pulled_count: 100, inserted_count: 2, updated_count: 3, unchanged_count: 95, failed_count: 0,
    }] }),
  }
}

test('手动同步写入唯一触发标记并返回最新状态', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hegongzuo-daily-sync-'))
  const requestPath = path.join(directory, 'manual-sync.request')
  try {
    const sync = new WorkDailyManualSync(poolWithLatestRun(), requestPath)
    const first = await sync.trigger()
    const second = await sync.trigger()
    assert.equal(first.accepted, true)
    assert.equal(second.accepted, false)
    assert.equal(first.state.queued, true)
    assert.equal(first.state.run.id, 12)
    assert.match(await readFile(requestPath, 'utf8'), /^\d{4}-\d{2}-\d{2}T/)
    assert.equal((await sync.state()).run.stats.updated, 3)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('未配置触发路径时明确拒绝手动同步', async () => {
  const sync = new WorkDailyManualSync(poolWithLatestRun(), '')
  await assert.rejects(() => sync.trigger(), /尚未配置/)
})
