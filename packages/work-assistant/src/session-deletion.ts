import type { Context } from '@deepseek-ai/cordis'
import type { AgentHandle, AgentRegistry } from '@deepseek-ai/dsh-agent'
import '@deepseek-ai/dsh-agent'
import '@deepseek-ai/dsh-host-webserver'
import { SessionId } from '@deepseek-ai/dsh-session'
import '@deepseek-ai/dsh-session-persistence'
import '@deepseek-ai/dsh-storage-domain'
import '@deepseek-ai/dsh-workspace'
import { rm } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

const routePath = '/hegongzuo/api/sessions'
const sessionIdPattern = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

class SessionDeletionError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function sessionIdFromUrl(requestUrl: string | undefined): string {
  const value = new URL(requestUrl ?? '/', 'http://127.0.0.1').pathname.slice(`${routePath}/`.length)
  if (!value || value.includes('/')) throw new SessionDeletionError(400, '对话标识无效。')
  let decoded: string
  try { decoded = decodeURIComponent(value) } catch { throw new SessionDeletionError(400, '对话标识无效。') }
  if (!sessionIdPattern.test(decoded)) throw new SessionDeletionError(400, '对话标识无效。')
  return decoded
}

function sendJson(response: Parameters<Context['webServer']['register']>[0]['handler'] extends (request: infer _Request, response: infer Response) => unknown ? Response : never, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

export function registerSessionDeletionRoute(ctx: Context): void {
  const registry: AgentRegistry = ctx.agents
  const handles = new Map<string, AgentHandle>()
  const originalCreate = registry.create
  const originalResume = registry.resume
  const remember = async (pending: Promise<AgentHandle>): Promise<AgentHandle> => {
    const handle = await pending
    handles.set(handle.agent.id, handle)
    return handle
  }
  const trackedCreate: AgentRegistry['create'] = function trackedCreate(options) { return remember(originalCreate.call(registry, options)) }
  const trackedResume: AgentRegistry['resume'] = function trackedResume(options) { return remember(originalResume.call(registry, options)) }
  registry.create = trackedCreate
  registry.resume = trackedResume
  const stopObservingDisposals = ctx.on('agent/disposed', ({ agent }) => handles.delete(agent.id))
  ctx.effect(() => async () => {
    stopObservingDisposals()
    if (registry.create === trackedCreate) registry.create = originalCreate
    if (registry.resume === trackedResume) registry.resume = originalResume
    handles.clear()
  }, 'hegongzuo.work-assistant.track-agent-handles')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: routePath,
    handler: async (request, response) => {
      if (request.method !== 'DELETE') { response.setHeader('allow', 'DELETE'); sendJson(response, 405, { error: '仅支持 DELETE 请求。' }); return }
      try {
        const rawId = sessionIdFromUrl(request.url)
        const sessionId = SessionId(rawId)
        const header = (await ctx.sessionPersistence.list()).find((candidate) => candidate.id === rawId)
        if (!header) throw new SessionDeletionError(404, '该对话不存在或已被删除。')
        const workspace = ctx.workspaceRegistry.list().find((candidate) => candidate.path === header.cwd)
        if (!workspace) throw new SessionDeletionError(403, '该对话不属于当前工作空间。')
        const location = ctx.sessionPersistence.locate(header)
        if (!location || location.kind !== 'jsonl' || basename(dirname(location.path)) !== rawId) throw new SessionDeletionError(501, '当前会话存储不支持安全清空。')
        const liveAgent = ctx.agents.get(sessionId)
        if (liveAgent) {
          const handle = handles.get(rawId)
          if (!handle || handle.agent !== liveAgent) throw new SessionDeletionError(409, '对话正在准备，请稍后重试。')
          await handle.dispose()
          await ctx.sessionPersistence.inspect(sessionId)
        }
        await workspace.detachSession(sessionId)
        const cache = ctx.storageDomain.get('session_projcache')
        if (cache) await cache.table('sessions').delete(rawId)
        await rm(dirname(location.path), { recursive: true, force: false })
        sendJson(response, 200, { deleted: true })
      } catch (reason) {
        const error = reason instanceof SessionDeletionError ? reason : new SessionDeletionError(500, '清空对话失败。')
        if (!(reason instanceof SessionDeletionError)) ctx.logger.error(`清空工作助理对话失败：${String(reason)}`)
        sendJson(response, error.status, { error: error.message })
      }
    },
  }), 'hegongzuo.work-assistant.session-deletion-route')
}
