import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { provisionRuntimeCredentials, runtimeEnvironment } from '../../../scripts/runtime-security.mjs'

test('运行时环境不包含平台数据库和其他业务密钥', () => {
  const result = runtimeEnvironment({ DATABASE_URL: 'fixture-db', HEGONGZUO_WECOM_SECRET: 'fixture', HEGONGZUO_DAYLYREPORT_DEEPSEEK_API_KEY: 'fixture', DEEPSEEK_API_KEY: 'fixture-runtime-key', NODE_OPTIONS: '--unsafe', PATH: '/usr/bin' })
  assert.deepEqual(result, { PATH: '/usr/bin', DEEPSEEK_API_KEY: 'fixture-runtime-key' })
})

test('运行时凭证按不可变空间标识绑定，重复初始化保持同一凭证', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hg-security-'))
  try {
    const definition = { runtimeId: 'main-assistant--original', accountKey: 'original' }
    await provisionRuntimeCredentials(root, definition, { DATABASE_URL: 'fixture' })
    const first = await readFile(path.join(root, '.runtime/agent-credentials/main-assistant--original.json'), 'utf8')
    await provisionRuntimeCredentials(root, definition, {})
    assert.equal(await readFile(path.join(root, '.runtime/agent-credentials/main-assistant--original.json'), 'utf8'), first)
    assert.doesNotMatch(await readFile(path.join(root, '.runtime/agent-credentials/main-assistant--original.env'), 'utf8'), /DATABASE_URL/)
    await assert.rejects(provisionRuntimeCredentials(root, { ...definition, accountKey: 'someoneelse' }, {}), /归属无效/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
