import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

const callbackPath = '/api/integrations/wecom/callback'
const maxCallbackBodyBytes = 1_000_000

export class WeComCallbackError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

interface WeComCallbackConfig {
  token: string
  encodingAesKey: string
  corpId: string
}

function configuredValue(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function callbackConfig(): WeComCallbackConfig {
  const token = configuredValue('HEGONGZUO_WECOM_CALLBACK_TOKEN')
  const encodingAesKey = configuredValue('HEGONGZUO_WECOM_CALLBACK_AES_KEY')
  const corpId = configuredValue('HEGONGZUO_WECOM_CORP_ID')
  if (!token || !encodingAesKey || !corpId) {
    throw new WeComCallbackError(503, '企业微信回调尚未完成服务器配置。')
  }
  return { token, encodingAesKey, corpId }
}

function requireParameter(url: URL, name: string): string {
  const value = url.searchParams.get(name)?.trim()
  if (!value) throw new WeComCallbackError(400, '企业微信回调参数不完整。')
  return value
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

function verifySignature(config: WeComCallbackConfig, timestamp: string, nonce: string, encrypted: string, signature: string): void {
  const expected = createHash('sha1').update([config.token, timestamp, nonce, encrypted].sort().join('')).digest('hex')
  if (!safeEqual(expected, signature)) throw new WeComCallbackError(401, '企业微信回调签名无效。')
}

function decryptMessage(config: WeComCallbackConfig, encrypted: string): string {
  let key: Buffer
  let ciphertext: Buffer
  try {
    key = Buffer.from(`${config.encodingAesKey}=`, 'base64')
    ciphertext = Buffer.from(encrypted, 'base64')
  } catch {
    throw new WeComCallbackError(400, '企业微信回调内容格式无效。')
  }
  if (key.length !== 32 || ciphertext.length === 0) throw new WeComCallbackError(400, '企业微信回调密钥或内容格式无效。')

  let plaintext: Buffer
  try {
    const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16))
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new WeComCallbackError(401, '企业微信回调内容无法验证。')
  }
  if (plaintext.length < 20) throw new WeComCallbackError(400, '企业微信回调内容不完整。')

  const messageLength = plaintext.readUInt32BE(16)
  const messageEnd = 20 + messageLength
  if (messageEnd > plaintext.length) throw new WeComCallbackError(400, '企业微信回调内容长度无效。')
  const corpId = plaintext.subarray(messageEnd).toString('utf8')
  if (!safeEqual(corpId, config.corpId)) throw new WeComCallbackError(401, '企业微信回调企业标识不匹配。')
  return plaintext.subarray(20, messageEnd).toString('utf8')
}

function encryptedMessageFromXml(body: string): string {
  const cdataMatch = body.match(/<Encrypt><!\[CDATA\[([\s\S]*?)\]\]><\/Encrypt>/)
  const textMatch = body.match(/<Encrypt>([^<]+)<\/Encrypt>/)
  const encrypted = (cdataMatch?.[1] ?? textMatch?.[1])?.trim()
  if (!encrypted) throw new WeComCallbackError(400, '企业微信回调缺少加密内容。')
  return encrypted
}

async function readCallbackBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > maxCallbackBodyBytes) throw new WeComCallbackError(413, '企业微信回调内容过大。')
    chunks.push(bytes)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function callbackParameters(url: URL): { signature: string; timestamp: string; nonce: string } {
  return {
    signature: requireParameter(url, 'msg_signature'),
    timestamp: requireParameter(url, 'timestamp'),
    nonce: requireParameter(url, 'nonce'),
  }
}

/**
 * 企业微信为保存“接收消息服务器 URL”而进行的验证，以及后续应用事件的最小安全接收端点。
 * 日报内容不会经此端点写入；日报同步将由独立的定时拉取任务负责。
 */
export async function handleWeComCallback(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  const config = callbackConfig()
  const { signature, timestamp, nonce } = callbackParameters(url)

  if (request.method === 'GET') {
    const echostr = requireParameter(url, 'echostr')
    verifySignature(config, timestamp, nonce, echostr, signature)
    const challenge = decryptMessage(config, echostr)
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    response.end(challenge)
    return
  }

  if (request.method === 'POST') {
    const encrypted = encryptedMessageFromXml(await readCallbackBody(request))
    verifySignature(config, timestamp, nonce, encrypted, signature)
    decryptMessage(config, encrypted)
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
    response.end('success')
    return
  }

  response.writeHead(405, { allow: 'GET, POST', 'cache-control': 'no-store' })
  response.end()
}

export { callbackPath }
