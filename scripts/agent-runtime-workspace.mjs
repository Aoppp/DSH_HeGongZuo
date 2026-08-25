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

/**
 * 检查运行时是否已经注册指定工作区。
 * @param {number} port
 * @param {string} workspacePath
 * @param {typeof fetch} [fetchImpl]
 */
export async function runtimeHasWorkspace(port, workspacePath, fetchImpl = fetch) {
  const value = await runtimeRequest(port, 'workspace.list', {}, fetchImpl)
  const items = /** @type {unknown} */ (value?.items)
  return Array.isArray(items) && items.some((item) => typeof item === 'object' && item !== null && 'path' in item && item.path === workspacePath)
}

/** @param {number} port @param {string} agentId @param {string} accountId @param {typeof fetch} fetchImpl */
async function runtimePublishesIdentity(port, agentId, accountId, fetchImpl) {
  const response = await fetchImpl(`http://127.0.0.1:${port}/hegongzuo/api/readiness`, { signal: AbortSignal.timeout(3_000) })
  if (!response.ok) return false
  const value = await response.json()
  return value?.ok === true && value.agentId === agentId && value.accountId === accountId
}

/**
 * 等待业务插件完成工作区注册。运行器不再代替插件创建通用工作区，避免基础
 * DSH 进程在缺少业务提示和工具时被误判为可用。
 * @param {{ port: number, workspacePath: string, agentId: string, accountId: string, fetchImpl?: typeof fetch, attempts?: number, retryDelayMs?: number }} options
 */
export async function ensureRuntimeWorkspace(options) {
  const { port, workspacePath, agentId, accountId, fetchImpl = fetch, attempts = 40, retryDelayMs = 500 } = options
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await runtimeHasWorkspace(port, workspacePath, fetchImpl) && await runtimePublishesIdentity(port, agentId, accountId, fetchImpl)) return
      throw new Error('业务插件尚未发布完整就绪身份。')
    } catch (reason) {
      lastError = reason
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }
  throw new Error(`Agent 工作区未就绪：${lastError instanceof Error ? lastError.message : String(lastError)}`)
}
