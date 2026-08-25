import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, utimes } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { RuntimeDemand } from '../dist/modules/agent-runtime/runtime-demand.js'

test('首次访问请求按需启动同一账号的指定运行时', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hegongzuo-runtime-demand-'))
  try {
    const demand = new RuntimeDemand(root, { activationAttempts: 3, activationRetryMs: 1, activityWriteIntervalMs: 0 })
    let probes = 0
    await demand.ensureAvailable('employee-query--ceshi4', async () => { probes += 1; return probes >= 2 })
    assert.equal(await demand.recentlyActive('employee-query--ceshi4'), true)
    assert.equal((await readFile(path.join(root, 'agent-activation-request'), 'utf8')).trim(), 'employee-query--ceshi4')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('超过空闲期限后运行时转为可安全回收状态', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hegongzuo-runtime-idle-'))
  try {
    const demand = new RuntimeDemand(root, { idleTimeoutMs: 1_000, activityWriteIntervalMs: 0 })
    await demand.touch('work-assistant--ceshi4', true)
    const activityPath = path.join(root, 'agent-activity', 'work-assistant--ceshi4')
    const past = new Date(Date.now() - 2_000)
    await utimes(activityPath, past, past)
    assert.equal(await demand.recentlyActive('work-assistant--ceshi4'), false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('并发访问共享一次启动过程', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hegongzuo-runtime-concurrency-'))
  try {
    const demand = new RuntimeDemand(root, { activationAttempts: 10, activationRetryMs: 1, activityWriteIntervalMs: 0 })
    let ready = false
    const probe = async () => ready
    const first = demand.ensureAvailable('employee-query--ceshi4', probe)
    const second = demand.ensureAvailable('employee-query--ceshi4', probe)
    setTimeout(() => { ready = true }, 3)
    await Promise.all([first, second])
    const requests = (await readFile(path.join(root, 'agent-activation-request'), 'utf8')).trim().split('\n')
    assert.equal(requests.length, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})
