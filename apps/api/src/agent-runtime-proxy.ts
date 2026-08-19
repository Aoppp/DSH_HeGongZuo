import { request as createRequest, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Duplex } from 'node:stream'

import type { AuthUser } from './auth.js'

const agentPathPrefix = '/api/employee-agent'
const sourceDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(sourceDirectory, '../../..')
const runtimeConfigPath = process.env.HEGONGZUO_AGENT_RUNTIME_CONFIG
  ?? path.join(projectRoot, '.runtime', 'account-agent-runtimes.json')

interface AccountAgentRuntime {
  readonly accountId: string
  readonly port: number
}

export class AgentRuntimeProxyError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export function isAgentRuntimeRequest(requestUrl: string | undefined): boolean {
  const pathname = new URL(requestUrl ?? '/', 'http://localhost').pathname
  return pathname === agentPathPrefix || pathname.startsWith(`${agentPathPrefix}/`)
}

function upstreamPath(requestUrl: string | undefined): string {
  const url = new URL(requestUrl ?? '/', 'http://localhost')
  url.searchParams.delete('access_token')
  const pathname = url.pathname.slice(agentPathPrefix.length) || '/'
  return `${pathname}${url.search}`
}

async function runtimeFor(user: AuthUser): Promise<AccountAgentRuntime> {
  let definitions: unknown
  try {
    definitions = JSON.parse(await readFile(runtimeConfigPath, 'utf8'))
  } catch {
    throw new AgentRuntimeProxyError(503, '员工查询服务尚未完成运行时配置。')
  }
  if (!Array.isArray(definitions)) throw new AgentRuntimeProxyError(503, '员工查询服务配置无效。')
  const runtime = definitions.find((candidate): candidate is AccountAgentRuntime => (
    typeof candidate === 'object'
    && candidate !== null
    && 'accountId' in candidate
    && 'port' in candidate
    && candidate.accountId === user.accountId
    && typeof candidate.port === 'number'
    && Number.isInteger(candidate.port)
    && candidate.port >= 1024
    && candidate.port <= 65535
  ))
  if (!runtime) throw new AgentRuntimeProxyError(503, '当前账号尚未配置员工查询服务。')
  return runtime
}

function proxyHeaders(headers: IncomingHttpHeaders, runtime: AccountAgentRuntime): IncomingHttpHeaders {
  const { authorization: _authorization, cookie: _cookie, host: _host, origin: _origin, ...forwarded } = headers
  const target = `127.0.0.1:${runtime.port}`
  return { ...forwarded, host: target, origin: `http://${target}` }
}

function unavailable(response: ServerResponse): void {
  if (response.headersSent) {
    response.destroy()
    return
  }
  response.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify({ error: '员工查询服务暂时不可用，请稍后重试。' }))
}

export async function proxyAgentRequest(
  request: IncomingMessage,
  response: ServerResponse,
  user: AuthUser,
): Promise<void> {
  const runtime = await runtimeFor(user)
  const upstream = createRequest({
    host: '127.0.0.1',
    port: runtime.port,
    method: request.method,
    path: upstreamPath(request.url),
    headers: proxyHeaders(request.headers, runtime),
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
    upstreamResponse.pipe(response)
  })
  upstream.once('error', () => unavailable(response))
  request.pipe(upstream)
}

function writeUpgradeError(socket: Duplex, status: number, message: string): void {
  socket.end(`HTTP/1.1 ${status} ${status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Service Unavailable'}\r\ncontent-type: application/json; charset=utf-8\r\nconnection: close\r\n\r\n${JSON.stringify({ error: message })}`)
}

function serializedUpgradeHeaders(headers: IncomingHttpHeaders): string {
  return Object.entries(headers)
    .flatMap(([name, value]) => Array.isArray(value)
      ? value.map((item) => `${name}: ${item}`)
      : value === undefined ? [] : [`${name}: ${value}`])
    .join('\r\n')
}

export async function proxyAgentUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  user: AuthUser,
): Promise<void> {
  const runtime = await runtimeFor(user)
  const upstream = createRequest({
    host: '127.0.0.1',
    port: runtime.port,
    method: request.method,
    path: upstreamPath(request.url),
    headers: proxyHeaders(request.headers, runtime),
  })
  upstream.once('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
    const status = upstreamResponse.statusCode ?? 101
    const statusMessage = upstreamResponse.statusMessage ?? 'Switching Protocols'
    socket.write(`HTTP/1.1 ${status} ${statusMessage}\r\n${serializedUpgradeHeaders(upstreamResponse.headers)}\r\n\r\n`)
    if (head.length > 0) upstreamSocket.write(head)
    if (upstreamHead.length > 0) socket.write(upstreamHead)
    upstreamSocket.pipe(socket)
    socket.pipe(upstreamSocket)
  })
  upstream.once('response', () => writeUpgradeError(socket, 502, '员工查询服务未能建立实时连接。'))
  upstream.once('error', () => writeUpgradeError(socket, 502, '员工查询服务暂时不可用，请稍后重试。'))
  upstream.end()
}
