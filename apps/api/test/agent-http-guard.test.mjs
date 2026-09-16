import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import test from 'node:test'

test('运行时所有 HTTP / WebSocket 请求都必须携带本实例凭证', async () => {
  const probe = createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  const token = 'fixture-runtime-token'
  const child = spawn(process.execPath, ['--import', new URL('../../../scripts/agent-http-guard.mjs', import.meta.url).href, '--input-type=module', '-e', `import {createServer} from 'node:http'; const server=createServer((req,res)=>res.end('ok')); server.on('upgrade',(req,socket)=>socket.end('HTTP/1.1 403 Forbidden\\r\\nConnection: close\\r\\n\\r\\n')); server.listen(${port},'127.0.0.1',()=>console.log('ready'));`], { env: { ...process.env, HEGONGZUO_RUNTIME_TOKEN: token, HEGONGZUO_RUNTIME_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('fixture server failed') })])
    const url = `http://127.0.0.1:${port}`
    assert.equal((await fetch(url)).status, 401)
    assert.equal((await fetch(url, { headers: { 'x-hegongzuo-runtime-token': 'other' } })).status, 401)
    assert.equal(await (await fetch(url, { headers: { 'x-hegongzuo-runtime-token': token } })).text(), 'ok')
    const upgraded = await new Promise((resolve, reject) => {
      const req = request(url, { headers: { connection: 'Upgrade', upgrade: 'websocket' } }, (res) => { res.resume(); resolve(res.statusCode) })
      req.on('error', reject)
      req.end()
    })
    assert.equal(upgraded, 401)
  } finally { child.kill(); await once(child, 'exit') }
})
