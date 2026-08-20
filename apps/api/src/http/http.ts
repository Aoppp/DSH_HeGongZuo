import type { IncomingMessage, ServerResponse } from 'node:http'

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export function sendJson(response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers })
  response.end(JSON.stringify(value))
}

export async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = ''
  for await (const chunk of request) { body += String(chunk); if (body.length > 8_000_000) throw new HttpError(413, '请求内容过大。') }
  try { return JSON.parse(body) } catch { throw new HttpError(400, '请求必须包含有效 JSON。') }
}
