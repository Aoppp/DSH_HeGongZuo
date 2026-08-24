import type { HistoryEntry } from '@deepseek-ai/dsh-client-connection/client'

export interface AssistantMessage {
  readonly id: string
  readonly kind: 'user' | 'assistant' | 'error'
  readonly text: string
  readonly state?: 'running' | 'failed'
}

function visibleText(content: readonly { readonly type: string; readonly text?: string }[]): string {
  return content.filter((part) => part.type === 'text' && typeof part.text === 'string').map((part) => part.text ?? '').join('\n').trim()
}

export function messagesFromHistory(entries: readonly HistoryEntry[]): readonly AssistantMessage[] {
  const finalAssistantMessages = new Set<string>()
  for (const entry of entries) {
    const event = entry.event
    if (event.type === 'assistant/message') finalAssistantMessages.add(`assistant-${event.data.turn}-${event.data.step}`)
  }

  const messages: AssistantMessage[] = []
  const positions = new Map<string, number>()
  const upsert = (message: AssistantMessage) => {
    const position = positions.get(message.id)
    if (position === undefined) {
      positions.set(message.id, messages.length)
      messages.push(message)
    } else messages[position] = message
  }
  for (const entry of entries.map((item) => item.event).sort((left, right) => left.seq - right.seq)) {
    // DSH 会把高频文本片段压缩为 text-chunks；该事件在当前客户端类型中仍是
    // 宽类型透传，因此以运行时校验读取，避免完成前页面没有任何正文可显示。
    const packed = entry as unknown as { readonly type?: unknown; readonly data?: { readonly turn?: unknown; readonly step?: unknown; readonly texts?: unknown } }
    if (packed.type === 'text-chunks'
      && typeof packed.data?.turn === 'number'
      && typeof packed.data?.step === 'number'
      && Array.isArray(packed.data.texts)
      && packed.data.texts.every((text) => typeof text === 'string')) {
      const id = `assistant-${packed.data.turn}-${packed.data.step}`
      if (!finalAssistantMessages.has(id)) {
        const existing = messages[positions.get(id) ?? -1]
        upsert({ id, kind: 'assistant', text: `${existing?.text ?? ''}${packed.data.texts.join('')}`, state: 'running' })
      }
      continue
    }
    if (entry.type === 'user/message' && entry.data.source.kind === 'user') {
      const text = visibleText(entry.data.content)
      if (text) upsert({ id: `user-${entry.data.id}`, kind: 'user', text })
    }
    if (entry.type === 'assistant/chunk' && entry.data.chunk.type === 'text-delta') {
      const id = `assistant-${entry.data.turn}-${entry.data.step}`
      if (!finalAssistantMessages.has(id)) {
        const existing = messages[positions.get(id) ?? -1]
        upsert({ id, kind: 'assistant', text: `${existing?.text ?? ''}${entry.data.chunk.text}`, state: 'running' })
      }
    }
    if (entry.type === 'assistant/message') {
      const text = visibleText(entry.data.message.content)
      if (text) upsert({ id: `assistant-${entry.data.turn}-${entry.data.step}`, kind: 'assistant', text })
    }
    if (entry.type === 'turn/end' && entry.data.reason.kind === 'error') {
      const interrupted = /abort(ed)?|user aborted a request/i.test(entry.data.reason.error.message)
      upsert({ id: `error-${entry.seq}`, kind: 'error', text: interrupted ? '本次处理已中断，可以重新发送。' : entry.data.reason.error.message, state: 'failed' })
    }
  }
  return messages
}

/** 服务端历史异步落盘期间，保留页面上刚发送但尚未出现在历史中的消息。 */
export function mergeHistoryMessages(history: readonly AssistantMessage[], current: readonly AssistantMessage[]): readonly AssistantMessage[] {
  const persistedUsers = new Set(history.filter((message) => message.kind === 'user').map((message) => message.text))
  const historyIds = new Set(history.map((message) => message.id))
  const inFlight = current.filter((message) => message.state === 'running' && !historyIds.has(message.id))
  const pending = current.filter((message) => message.id.startsWith('pending-') && !persistedUsers.has(message.text))
  return [...history, ...inFlight, ...pending]
}
