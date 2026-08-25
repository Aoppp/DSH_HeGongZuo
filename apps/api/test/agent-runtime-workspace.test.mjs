import assert from 'node:assert/strict'
import test from 'node:test'

import { ensureRuntimeWorkspace, runtimeHasWorkspace } from '../../../scripts/agent-runtime-workspace.mjs'

function rpcResponse(request, value) {
  const body = JSON.parse(request.body)
  return new Response(JSON.stringify({ type: 'server-response', rpcId: body.rpcId, result: { ok: true, value } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

test('运行时工作区检查要求路径与当前实例完全一致', async () => {
  const fetchImpl = async (_url, request) => rpcResponse(request, { items: [{ path: '/runtime/other/workspace' }], archivedSessionIds: [] })
  assert.equal(await runtimeHasWorkspace(3192, '/runtime/current/workspace', fetchImpl), false)
})

test('运行时启动后自动补建缺失的账号工作区', async () => {
  const methods = []
  const fetchImpl = async (_url, request) => {
    const body = JSON.parse(request.body)
    methods.push(body.method)
    if (body.method === 'workspace.list') return rpcResponse(request, { items: [], archivedSessionIds: [] })
    return rpcResponse(request, { workspace: { path: body.payload.path }, created: true })
  }

  await ensureRuntimeWorkspace({ port: 3192, workspacePath: '/runtime/current/workspace', fetchImpl, attempts: 1 })
  assert.deepEqual(methods, ['workspace.list', 'workspace.create'])
})
