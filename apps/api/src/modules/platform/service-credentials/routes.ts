import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AuthUser } from '../../../auth.js'
import { serviceIds, type ServiceId } from '../../../configuration/service-credentials.js'
import { requirePlatformAdministration } from '../../../http/auth-middleware.js'
import { HttpError, sendJson } from '../../../http/http.js'
import { parseServiceKey, verifyServiceKey } from './connection-check.js'
import type { ServiceCredentialsService } from './service.js'

const route = /^\/api\/platform\/service-credentials(?:\/(assistant|daily-report)\/(verify|save|apply))?$/
const busy = new Set<string>()
const lastRequest = new Map<string, number>()

export async function serviceCredentialRoutes(request: IncomingMessage, response: ServerResponse, pathname: string, user: AuthUser, service: ServiceCredentialsService, reauthorize: () => Promise<AuthUser>): Promise<boolean> {
  if (!pathname.startsWith('/api/platform/service-credentials')) return false
  requirePlatformAdministration(user)
  const match = route.exec(pathname)
  if (!match) throw new HttpError(404, '服务配置入口不存在。')
  try {
    if (!match[1] && request.method === 'GET') { sendJson(response, 200, { services: await service.list() }); return true }
    if (!match[1] || request.method !== 'POST') throw new HttpError(405, '请求方式不支持。')
    const origin = request.headers.origin
    if (!origin || new URL(origin).host !== request.headers.host) throw new HttpError(403, '请从平台页面提交服务配置。')
    const id = match[1] as ServiceId
    if (!serviceIds.includes(id)) throw new HttpError(404, '服务不存在。')
    if (busy.has(user.id)) throw new HttpError(429, '上一项配置操作尚未完成，请稍后重试。')
    const now = Date.now()
    for (const [actor, time] of lastRequest) if (now - time > 60_000) lastRequest.delete(actor)
    const requestKey = `${user.id}:${match[2]}`
    if (now - (lastRequest.get(requestKey) ?? 0) < 1500) throw new HttpError(429, '操作过于频繁，请稍后重试。')
    lastRequest.set(requestKey, now); busy.add(user.id)
    try {
      const chunks: Buffer[] = []; let bytes = 0
      for await (const chunk of request) { const part = Buffer.from(chunk); bytes += part.length; if (bytes > 4096) throw new HttpError(413, '配置内容过大。'); chunks.push(part) }
      let body: Record<string, unknown>
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown> } catch { throw new HttpError(400, '配置格式无效。') }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, '配置格式无效。')
      const action = match[2]
      if (action === 'apply') {
        if (id !== 'assistant' || typeof body.revision !== 'string' || !/^[a-f0-9-]{36}$/.test(body.revision) || typeof body.interrupt !== 'boolean') throw new HttpError(400, '生效请求无效。')
        const actor = await reauthorize(); requirePlatformAdministration(actor)
        await service.apply(body.revision, body.interrupt, actor)
      } else {
        const key = parseServiceKey(body.key)
        await verifyServiceKey(id, key)
        const actor = await reauthorize(); requirePlatformAdministration(actor)
        if (action === 'save') {
          if (body.revision !== null && (typeof body.revision !== 'string' || !/^[a-f0-9-]{36}$/.test(body.revision))) throw new HttpError(400, '配置版本无效，请刷新后重试。')
          await service.save(id, key, body.revision as string | null, actor)
        }
      }
      sendJson(response, 200, { success: true }); return true
    } finally { busy.delete(user.id) }
  } catch (error) {
    if (error instanceof HttpError) throw error
    // 密钥配置错误不得交给全局错误日志打印原始异常。
    throw new HttpError(503, '服务配置操作未完成，请联系管理员检查配置服务。')
  }
}
