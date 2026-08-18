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

const DELETE_SESSION_ROUTE = '/hegongzuo/api/sessions'
const SESSION_ID_PATTERN = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

class SessionDeletionError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'SessionDeletionError'
    this.status = status
  }
}

interface TrackedAgentHandles {
  get(sessionId: string): AgentHandle | undefined
}

function installAgentHandleTracking(ctx: Context): TrackedAgentHandles {
  const registry: AgentRegistry = ctx.agents
  const handles = new Map<string, AgentHandle>()
  const originalCreate = registry.create
  const originalResume = registry.resume

  const remember = async (pending: Promise<AgentHandle>): Promise<AgentHandle> => {
    const handle = await pending
    handles.set(handle.agent.id, handle)
    return handle
  }

  const trackedCreate: AgentRegistry['create'] = function trackedCreate(options) {
    return remember(originalCreate.call(registry, options))
  }
  const trackedResume: AgentRegistry['resume'] = function trackedResume(options) {
    return remember(originalResume.call(registry, options))
  }

  registry.create = trackedCreate
  registry.resume = trackedResume
  const stopObservingDisposals = ctx.on('agent/disposed', ({ agent }) => {
    handles.delete(agent.id)
  })

  ctx.effect(() => async () => {
    stopObservingDisposals()
    if (registry.create === trackedCreate) registry.create = originalCreate
    if (registry.resume === trackedResume) registry.resume = originalResume
    handles.clear()
  }, 'hegongzuo.employee-agent.track-agent-handles')

  return handles
}

function sendJson(
  response: Parameters<Context['webServer']['register']>[0]['handler'] extends (request: infer _Request, response: infer Response) => unknown ? Response : never,
  status: number,
  body: Readonly<Record<string, unknown>>,
): void {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

function sessionIdFromRequestUrl(requestUrl: string | undefined): string {
  const pathname = new URL(requestUrl ?? '/', 'http://127.0.0.1').pathname
  const prefix = `${DELETE_SESSION_ROUTE}/`
  if (!pathname.startsWith(prefix)) throw new SessionDeletionError('缺少要删除的对话 ID。', 400)

  const encodedId = pathname.slice(prefix.length)
  if (!encodedId || encodedId.includes('/')) throw new SessionDeletionError('对话 ID 格式无效。', 400)

  let sessionId: string
  try {
    sessionId = decodeURIComponent(encodedId)
  } catch {
    throw new SessionDeletionError('对话 ID 格式无效。', 400)
  }
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new SessionDeletionError('对话 ID 格式无效。', 400)
  return sessionId
}

export async function permanentlyDeleteSession(
  ctx: Context,
  sessionId: string,
  trackedAgentHandles?: TrackedAgentHandles,
): Promise<void> {
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new SessionDeletionError('对话 ID 格式无效。', 400)
  const brandedSessionId = SessionId(sessionId)
  const liveAgent = ctx.agents.get(brandedSessionId)
  if (liveAgent?.status === 'running') {
    throw new SessionDeletionError('该对话正在处理任务，请等待完成后再删除。', 409)
  }

  const header = (await ctx.sessionPersistence.list()).find((candidate) => candidate.id === sessionId)
  if (!header) throw new SessionDeletionError('该对话不存在或已被删除。', 404)

  const workspace = ctx.workspaceRegistry.list().find((candidate) => candidate.path === header.cwd)
  if (!workspace) throw new SessionDeletionError('该对话不属于当前员工 Agent 工作区。', 403)

  const location = ctx.sessionPersistence.locate(header)
  if (!location || location.kind !== 'jsonl') {
    throw new SessionDeletionError('当前 DSH 会话存储不支持安全的永久删除。', 501)
  }

  const artifactDirectory = dirname(location.path)
  if (basename(artifactDirectory) !== sessionId) {
    throw new SessionDeletionError('会话存储路径校验失败，已取消删除。', 500)
  }

  if (liveAgent) {
    const handle = trackedAgentHandles?.get(sessionId)
    if (!handle || handle.agent !== liveAgent) {
      throw new SessionDeletionError('该对话的运行时尚未进入可安全删除状态，请刷新页面后重试。', 409)
    }
    await handle.dispose()
    await ctx.sessionPersistence.inspect(brandedSessionId)
  }

  await workspace.detachSession(brandedSessionId)

  const projectionCacheDomain = ctx.storageDomain.get('session_projcache')
  if (projectionCacheDomain) await projectionCacheDomain.table('sessions').delete(sessionId)

  await rm(artifactDirectory, { recursive: true, force: false })
}

export function registerSessionDeletionRoute(ctx: Context): void {
  const trackedAgentHandles = installAgentHandleTracking(ctx)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: DELETE_SESSION_ROUTE,
    handler: async (request, response) => {
      if (request.method !== 'DELETE') {
        response.setHeader('allow', 'DELETE')
        sendJson(response, 405, { error: '仅支持 DELETE 请求。' })
        return
      }

      try {
        const sessionId = sessionIdFromRequestUrl(request.url)
        await permanentlyDeleteSession(ctx, sessionId, trackedAgentHandles)
        sendJson(response, 200, { deleted: true, sessionId })
      } catch (reason) {
        const status = reason instanceof SessionDeletionError ? reason.status : 500
        const message = reason instanceof SessionDeletionError ? reason.message : '删除对话时发生未知错误。'
        if (!(reason instanceof SessionDeletionError)) ctx.logger.error(`删除 DSH 对话失败：${String(reason)}`)
        sendJson(response, status, { error: message })
      }
    },
  }), 'hegongzuo.employee-agent.session-deletion-route')
}
