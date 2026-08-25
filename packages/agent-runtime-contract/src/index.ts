import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-host-webserver'

export const agentRuntimeReadinessPath = '/hegongzuo/api/readiness'

/** 仅在业务插件的提示词、工具和路由全部注册成功后调用。 */
export function publishAgentRuntimeReadiness(ctx: Context, agentId: string): void {
  const accountId = process.env.HEGONGZUO_ACCOUNT_ID?.trim()
  if (!accountId || process.env.HEGONGZUO_AGENT_ID !== agentId) throw new Error(`Agent ${agentId} 缺少匹配的运行时身份。`)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: agentRuntimeReadinessPath,
    handler: (request, response) => {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      if (request.method !== 'GET' || pathname !== agentRuntimeReadinessPath) {
        response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: 'Not Found' }))
        return
      }
      response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ ok: true, agentId, accountId }))
    },
  }), `hegongzuo.agent-runtime-readiness.${agentId}`)
}
