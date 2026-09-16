import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AgentEmployeeGateway } from '../dist/modules/agent-runtime/employee-gateway.js'
import { provisionRuntimeCredentials } from '../../../scripts/runtime-security.mjs'

test('员工接口每次校验当前权限、只认当前注册实例且拒绝跨账号凭证', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hg-gateway-'))
  try {
    const definition = { runtimeId: 'main-assistant--owner', accountKey: 'owner' }
    await provisionRuntimeCredentials(root, definition, {})
    await provisionRuntimeCredentials(root, { runtimeId: 'main-assistant--other', accountKey: 'other' }, {})
    await writeFile(path.join(root, '.runtime/agent-runtimes.json'), JSON.stringify([definition]))
    const { token } = JSON.parse(await readFile(path.join(root, '.runtime/agent-credentials/main-assistant--owner.json'), 'utf8'))
    let allowed = true, reads = 0
    const pool = { query: async (sql, values) => {
      if (sql.startsWith('SELECT EXISTS')) { assert.equal(values[0], 'owner'); return { rows: [{ allowed }] } }
      reads += 1
      return { rows: [] }
    } }
    const gateway = new AgentEmployeeGateway(pool, root, async () => {})
    const request = { runtimeId: definition.runtimeId, method: 'getById', input: 'fixture' }
    assert.equal(await gateway.execute(token, request), null)
    allowed = false
    await assert.rejects(gateway.execute(token, request), (error) => error.status === 403)
    assert.equal(reads, 1)
    await assert.rejects(gateway.execute(token, { ...request, runtimeId: 'main-assistant--other' }), (error) => error.status === 401)
    allowed = true
    await assert.rejects(gateway.execute(token, { ...request, method: 'delete', input: {} }), (error) => error.status === 400)
    await writeFile(path.join(root, '.runtime/agent-runtimes.json'), '[]')
    await assert.rejects(gateway.execute(token, request), (error) => error.status === 403)
  } finally { await rm(root, { recursive: true, force: true }) }
})
