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

test('运行时不会用通用工作区掩盖尚未加载的业务插件', async () => {
  const methods = []
  const fetchImpl = async (_url, request) => {
    const body = JSON.parse(request.body)
    methods.push(body.method)
    return rpcResponse(request, { items: [], archivedSessionIds: [] })
  }

  await assert.rejects(ensureRuntimeWorkspace({ port: 3192, workspacePath: '/runtime/current/workspace', agentId: 'employee-query', accountId: 'ceshi3', fetchImpl, attempts: 1 }), /尚未发布完整就绪身份/)
  assert.deepEqual(methods, ['workspace.list'])
})

test('工作区与业务插件身份同时匹配才视为运行时就绪', async () => {
  const fetchImpl = async (url, request = {}) => {
    if (String(url).endsWith('/hegongzuo/api/readiness')) return new Response(JSON.stringify({ ok: true, agentId: 'employee-query', accountId: 'ceshi4' }))
    return rpcResponse(request, { items: [{ path: '/runtime/ceshi4/workspace' }], archivedSessionIds: [] })
  }
  await ensureRuntimeWorkspace({ port: 3200, workspacePath: '/runtime/ceshi4/workspace', agentId: 'employee-query', accountId: 'ceshi4', fetchImpl, attempts: 1 })
})
