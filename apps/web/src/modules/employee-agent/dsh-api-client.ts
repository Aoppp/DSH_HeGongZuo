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

  constructor(apiBasePath: string) {
    super(20_000)
    this.#apiBasePath = apiBasePath.replace(/\/$/, '')
  }

  async deleteSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.#apiBasePath}/hegongzuo/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
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
    return fetch(proxiedUrl, init)
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
