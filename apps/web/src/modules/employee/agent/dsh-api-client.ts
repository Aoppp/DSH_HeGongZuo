// 员工查询服务客户端。
import { AbstractApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import { hostFrameSchema, muxFrameSchema } from '@deepseek-ai/dsh-host-apiproxy/api/events.schema'
import { serverRequestSchema } from '@deepseek-ai/dsh-host-apiproxy/api'
import type {
  HostFrame,
  MuxFrame,
  RpcError,
  RpcRequest,
  RpcResponse,
} from '@deepseek-ai/dsh-client-connection/client'

function fallbackRandomUuid(): string {
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// HTTP 的公网 IP 不属于安全上下文，部分浏览器不会暴露 crypto.randomUUID。
// DSH 客户端用它生成请求标识，因此在其初始化前补齐兼容实现。
function ensureRandomUuid(): void {
  const cryptoApi = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined
  if (!cryptoApi || typeof cryptoApi.randomUUID === 'function') return
  Object.defineProperty(cryptoApi, 'randomUUID', { configurable: true, value: fallbackRandomUuid })
}

// 部分旧版浏览器没有 AbortSignal.timeout / AbortSignal.any；查询连接库会直接使用这两个 API。
// 在模块加载阶段补齐，确保库首次发起请求前已具备兼容实现。
function ensureAbortSignalCompatibility(): void {
  if (typeof globalThis.AbortController !== 'function' || typeof globalThis.AbortSignal === 'undefined') return
  const abortSignalApi = globalThis.AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal
    any?: (signals: readonly AbortSignal[]) => AbortSignal
  }
  if (typeof abortSignalApi.timeout !== 'function') {
    Object.defineProperty(abortSignalApi, 'timeout', {
      configurable: true,
      value: (milliseconds: number): AbortSignal => {
        const controller = new AbortController()
        const delay = Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0
        const timer = globalThis.setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), delay)
        controller.signal.addEventListener('abort', () => globalThis.clearTimeout(timer), { once: true })
        return controller.signal
      },
    })
  }
  if (typeof abortSignalApi.any !== 'function') {
    Object.defineProperty(abortSignalApi, 'any', {
      configurable: true,
      value: (signals: readonly AbortSignal[]): AbortSignal => {
        const controller = new AbortController()
        const listeners = new Map<AbortSignal, () => void>()
        const abortFrom = (signal: AbortSignal) => {
          for (const [candidate, listener] of listeners) candidate.removeEventListener('abort', listener)
          listeners.clear()
          controller.abort(signal.reason)
        }
        for (const signal of signals) {
          if (signal.aborted) {
            abortFrom(signal)
            break
          }
          const listener = () => abortFrom(signal)
          listeners.set(signal, listener)
          signal.addEventListener('abort', listener, { once: true })
        }
        return controller.signal
      },
    })
  }
}

ensureRandomUuid()
ensureAbortSignalCompatibility()

export class DshRequestError extends Error {
  readonly code: string

  constructor(error: RpcError) {
    super(error.message)
    this.name = 'DshRequestError'
    this.code = error.code
  }
}

export class AccountDshApiClient extends AbstractApiClient {
  readonly #apiBasePath: string

  constructor(apiBasePath = '/api/employee-agent') {
    super(20_000)
    this.#apiBasePath = apiBasePath.replace(/\/$/, '')
  }

  async deleteSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.#apiBasePath}/hegongzuo/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    })
    const body = await response.json().catch(() => ({})) as { error?: unknown }
    if (!response.ok) {
      throw new Error(typeof body.error === 'string' ? body.error : `删除对话失败（HTTP ${response.status}）。`)
    }
  }

  protected override doFetch(input: URL, init?: RequestInit): Promise<Response> {
    const proxiedUrl = new URL(input)
    proxiedUrl.pathname = `${this.#apiBasePath}${proxiedUrl.pathname}`
    const headers = new Headers(init?.headers)
    return fetch(proxiedUrl, { ...init, credentials: 'same-origin', headers })
  }

  protected override openMux(
    _payload: Record<string, unknown>,
    signal: AbortSignal,
    onOpen?: () => void,
  ): AsyncIterable<RpcRequest<MuxFrame>> {
    return this.readAccountWebSocket('/api/events.mux', signal, muxFrameSchema, onOpen)
  }

  protected override openHost(
    _payload: Record<string, unknown>,
    signal: AbortSignal,
    onOpen?: () => void,
  ): AsyncIterable<RpcRequest<HostFrame>> {
    return this.readAccountWebSocket('/api/events.host', signal, hostFrameSchema, onOpen)
  }

  async *readAccountWebSocket<T>(
    path: string,
    signal: AbortSignal,
    schema: { parse(value: unknown): T },
    onOpen?: () => void,
  ): AsyncGenerator<RpcRequest<T>> {
    const url = new URL(`${this.#apiBasePath}${path}`, globalThis.location.origin)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url)
    const inbox: Array<{ readonly kind: 'frame'; readonly envelope: RpcRequest<T> } | { readonly kind: 'end' }> = []
    let wake: (() => void) | undefined

    const enqueue = (item: (typeof inbox)[number]) => {
      inbox.push(item)
      wake?.()
      wake = undefined
    }
    const handleOpen = () => onOpen?.()
    const handleMessage = (event: MessageEvent) => {
      try {
        if (typeof event.data !== 'string') throw new Error('收到了不支持的二进制事件。')
        const full = serverRequestSchema.parse(JSON.parse(event.data))
        const frame = schema.parse(full.payload)
        this.onEnvelope(full)
        enqueue({ kind: 'frame', envelope: { rpcId: full.rpcId, payload: frame } })
      } catch (reason) {
        console.error('[和工作] 已忽略无法解析的 Agent 事件：', reason)
      }
    }
    const handleClose = () => enqueue({ kind: 'end' })
    const handleAbort = () => {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close()
    }

    socket.addEventListener('open', handleOpen)
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('close', handleClose, { once: true })
    signal.addEventListener('abort', handleAbort, { once: true })
    if (signal.aborted) handleAbort()

    try {
      while (true) {
        while (inbox.length > 0) {
          const item = inbox.shift()
          if (!item || item.kind === 'end') return
          yield item.envelope
        }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      signal.removeEventListener('abort', handleAbort)
      socket.removeEventListener('open', handleOpen)
      socket.removeEventListener('message', handleMessage)
      socket.removeEventListener('close', handleClose)
      handleAbort()
    }
  }
}

export function unwrapDshResponse<T>(response: RpcResponse<T>): T {
  if (!response.result.ok) throw new DshRequestError(response.result.error)
  return response.result.value
}
