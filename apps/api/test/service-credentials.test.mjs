import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import test from 'node:test'
import { ServiceCredentialStore } from '../dist/configuration/service-credentials.js'
import { verifyServiceKey, parseServiceKey, providerUrl } from '../dist/modules/platform/service-credentials/connection-check.js'
import { serviceCredentialRoutes } from '../dist/modules/platform/service-credentials/routes.js'
import { ServiceCredentialsService } from '../dist/modules/platform/service-credentials/service.js'
import { ReportAnalysisService } from '../dist/modules/employee/report-analysis/report-analysis-service.js'

const fixtureKey = 'fixture-service-credential-for-tests-only'

test('凭证加密、服务绑定、防篡改、保护文件权限与缺失时禁止重新生成', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hg-credentials-'))
  let row = null
  const store = new ServiceCredentialStore({ query: async (sql) => ({ rows: sql.startsWith('SELECT count') ? [{ count: row ? '1' : '0' }] : row ? [row] : [] }) }, root, { DEEPSEEK_API_KEY: 'fallback-fixture' })
  try {
    assert.deepEqual(await store.effective('assistant'), { key: 'fallback-fixture', revision: 'environment' })
    const revision = randomUUID()
    const encrypted = await store.encrypt('assistant', revision, fixtureKey)
    assert.ok(!encrypted.includes(fixtureKey))
    row = { encrypted_key: encrypted, revision }
    assert.equal((await store.effective('assistant')).key, fixtureKey)
    await assert.rejects(store.effective('daily-report'), /无法读取/)
    const saved = row.encrypted_key
    row.encrypted_key = `Z${saved.slice(1)}`
    await assert.rejects(store.effective('assistant'), /无法读取/)
    row.encrypted_key = saved
    const protectedFile = path.join(root, '.runtime/platform-secrets/service-credentials.key')
    assert.equal((await stat(protectedFile)).mode & 0o777, 0o600)
    assert.equal((await readFile(protectedFile)).length, 32)
    await rm(protectedFile)
    await assert.rejects(store.encrypt('assistant', randomUUID(), fixtureKey))
    await assert.rejects(stat(protectedFile), { code: 'ENOENT' })
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('验证固定服务地址、不跟随重定向、不回显外部错误或秘密', async () => {
  let calls = 0
  await verifyServiceKey('daily-report', fixtureKey, async (url, init) => {
    calls += 1
    assert.equal(url, 'https://api.deepseek.com/models')
    assert.equal(init.redirect, 'error')
    assert.equal(init.headers.authorization, `Bearer ${fixtureKey}`)
    return Response.json({ data: [{ id: 'fixture-model' }] })
  })
  assert.equal(calls, 1)
  for (const status of [401,403,429,500]) {
    await assert.rejects(verifyServiceKey('daily-report', fixtureKey, async () => new Response(fixtureKey, { status })), (error) => !error.message.includes(fixtureKey))
  }
  await assert.rejects(verifyServiceKey('assistant', fixtureKey, async () => { throw new Error(fixtureKey) }), (error) => !error.message.includes(fixtureKey))
  await assert.rejects(verifyServiceKey('assistant', fixtureKey, async () => Response.json({ data: [] })))
  await assert.rejects(verifyServiceKey('assistant', fixtureKey, async () => new Response('x'.repeat(70_000))))
  assert.throws(() => parseServiceKey('valid-key\nmalicious-header'), /有效密钥/)
  assert.throws(() => providerUrl('assistant', { DEEPSEEK_BASE_URL: 'http://example.com' }))
  assert.throws(() => providerUrl('assistant', { DEEPSEEK_BASE_URL: 'https://user:password@example.com' }))
  assert.equal(providerUrl('daily-report', { DEEPSEEK_BASE_URL: 'https://example.com' }), 'https://api.deepseek.com/models')
})

test('状态响应明确列出字段，不返回密文、明文或过期任务的成功状态', async () => {
  const row = { encrypted_key: fixtureKey, revision: randomUUID(), updated_at: new Date(), updated_by_name: '管理员', apply_status: 'pending', apply_requested_at: new Date(Date.now()-400_000) }
  const service = new ServiceCredentialsService({ query: async () => ({ rows: [row] }) }, '/unused')
  service.store.effective = async () => ({key:fixtureKey,revision:row.revision})
  const statuses = await service.list()
  assert.ok(statuses.every((entry) => entry.state === 'failed'))
  assert.ok(!JSON.stringify(statuses).includes(fixtureKey))
  assert.ok(statuses.every((entry) => !('key' in entry) && !('encrypted_key' in entry)))
  service.store.effective = async () => { throw new Error('missing protected file') }
  assert.ok((await service.list()).every((entry) => entry.state === 'unavailable'))
})

test('日报后续请求读取最新凭证，不依赖API重启', async () => {
  const originalFetch = globalThis.fetch
  let current = 'fixture-first', calls = []
  try {
    globalThis.fetch = async (_url, init) => { calls.push(init.headers.authorization); return Response.json({choices:[{message:{content:'结果'},finish_reason:'stop'}]}) }
    const service = new ReportAnalysisService({}, async () => current)
    await service.fetchContent('instruction','source',10,false)
    current = 'fixture-second'
    await service.fetchContent('instruction','source',10,false)
    assert.deepEqual(calls,['Bearer fixture-first','Bearer fixture-second'])
  } finally { globalThis.fetch = originalFetch }
})

test('接口权限、同源限制、请求上限、验证失败保留旧配置、保存前重验权限', async () => {
  let role = 'admin', revoked = false, verifiesFail = false, saved = 0
  const service = { list: async () => [], save: async () => { saved += 1 }, apply: async () => undefined }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => String(url).startsWith('https://api.deepseek.com/')
    ? verifiesFail ? new Response('private provider failure', { status: 401 }) : Response.json({ data: [{ id: 'fixture-model' }] })
    : originalFetch(url, init)
  const server = createServer((request, response) => {
    const user = { id: randomUUID(), displayName: '管理员', permissions: role === 'admin' ? ['platform-administration'] : [] }
    void serviceCredentialRoutes(request, response, new URL(request.url, 'http://localhost').pathname, user, service, async () => ({ ...user, permissions: revoked ? [] : user.permissions }))
      .then((handled) => { if (!handled) { response.writeHead(404); response.end() } })
      .catch((error) => { response.writeHead(error.status ?? 500, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: error.message })) })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const post = (body, headers={ origin }) => originalFetch(`${origin}/api/platform/service-credentials/daily-report/save`, { method: 'POST', headers: { 'content-type':'application/json', ...headers }, body: JSON.stringify(body) })
  try {
    role='user'
    assert.equal((await originalFetch(`${origin}/api/platform/service-credentials`)).status,403)
    role='admin'
    assert.equal((await post({ key:fixtureKey, revision:null }, {origin:'https://foreign.example'})).status,403)
    assert.equal((await post({ key:'x'.repeat(5000), revision:null })).status,413)
    verifiesFail=true
    assert.equal((await post({key:fixtureKey,revision:null})).status,400)
    assert.equal(saved,0)
    verifiesFail=false;revoked=true
    assert.equal((await post({key:fixtureKey,revision:null})).status,403)
    assert.equal(saved,0)
    revoked=false
    const response=await post({key:fixtureKey,revision:null})
    assert.equal(response.status,200)
    assert.deepEqual(await response.json(),{success:true})
    assert.equal(saved,1)
  } finally { globalThis.fetch=originalFetch; await new Promise((resolve)=>server.close(resolve)) }
})
