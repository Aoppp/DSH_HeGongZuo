import { randomUUID } from 'node:crypto'

/** @param {number} port @param {string} method @param {Record<string, unknown>} payload @param {typeof fetch} fetchImpl */
async function runtimeRequest(port, method, payload, fetchImpl) {
  const rpcId = randomUUID()
  const response = await fetchImpl(`http://127.0.0.1:${port}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
    signal: AbortSignal.timeout(3_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = await response.json()
  if (!body || typeof body !== 'object' || body.rpcId !== rpcId || !body.result?.ok) throw new Error(`Agent 请求失败：${method}`)
  return body.result.value
}

/** 检查运行时是否已经注册指定工作区。 */
export async function runtimeHasWorkspace(port, workspacePath, fetchImpl = fetch) {
  const value = await runtimeRequest(port, 'workspace.list', {}, fetchImpl)
  return Array.isArray(value?.items) && value.items.some((item) => item?.path === workspacePath)
}

/**
 * 等待 DSH API 就绪，并为插件启动阶段遗漏的工作区执行幂等补建。
 * 该逻辑只使用运行时注册表中的当前实例路径，不接触其他账号目录。
 */
export async function ensureRuntimeWorkspace({ port, workspacePath, fetchImpl = fetch, attempts = 40, retryDelayMs = 500 }) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await runtimeHasWorkspace(port, workspacePath, fetchImpl)) return
      const created = await runtimeRequest(port, 'workspace.create', { path: workspacePath }, fetchImpl)
      if (created?.workspace?.path === workspacePath) return
      throw new Error('工作区创建结果无效。')
    } catch (reason) {
      lastError = reason
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }
  throw new Error(`Agent 工作区未就绪：${lastError instanceof Error ? lastError.message : String(lastError)}`)
}
