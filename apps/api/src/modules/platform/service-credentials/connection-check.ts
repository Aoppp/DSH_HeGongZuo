import { HttpError } from '../../../http/http.js'
import type { ServiceId } from '../../../configuration/service-credentials.js'

export function parseServiceKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]{20,512}$/.test(value.trim())) throw new HttpError(400, '请填写有效密钥，不要包含空格、换行或引号。')
  return value.trim()
}

// 仅使用服务端既有地址；前端不能指定主机，且拒绝重定向以避免凭证泄露。
export function providerUrl(id: ServiceId, environment: NodeJS.ProcessEnv = process.env): string {
  const base = id === 'assistant' ? environment.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com' : 'https://api.deepseek.com'
  const url = new URL(`${base.replace(/\/+$/, '')}/models`)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new HttpError(503, '现有服务地址不符合安全要求，请联系管理员检查配置。')
  return url.toString()
}

export async function verifyServiceKey(id: ServiceId, key: string, fetchImpl: typeof fetch = fetch, environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const url = providerUrl(id, environment)
  try {
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${parseServiceKey(key)}` }, redirect: 'error', signal: AbortSignal.timeout(15_000) })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 401 || response.status === 403) throw new HttpError(400, '密钥验证失败，请检查密钥是否正确或已被停用。')
      if (response.status === 429) throw new HttpError(429, '服务验证过于频繁，请稍后重试。')
      throw new HttpError(502, '服务暂时无法验证，原有配置未更改，请稍后重试。')
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('empty')
    const chunks: Uint8Array[] = []; let size = 0
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break
        size += next.value.length; if (size > 65_536) throw new Error('large')
        chunks.push(next.value)
      }
    } finally { await reader.cancel().catch(() => undefined) }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { data?: unknown }
    if (!Array.isArray(body.data) || !body.data.some((item: unknown) => item && typeof item === 'object' && 'id' in item && typeof item.id === 'string')) throw new Error('invalid')
  } catch (error) {
    if (error instanceof HttpError) throw error
    // 不传播服务端正文、URL、原始异常或用户输入。
    throw new HttpError(502, '连接验证未完成，原有配置未更改，请稍后重试。')
  }
}
