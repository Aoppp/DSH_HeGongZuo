import type { HistoryEntry } from '@deepseek-ai/dsh-client-connection/client'

export interface AssistantMessage {
  readonly id: string
  readonly kind: 'user' | 'assistant' | 'error'
  readonly text: string
}

function visibleText(content: readonly { readonly type: string; readonly text?: string }[]): string {
  return content.filter((part) => part.type === 'text' && typeof part.text === 'string').map((part) => part.text ?? '').join('\n').trim()
}

export function messagesFromHistory(entries: readonly HistoryEntry[]): readonly AssistantMessage[] {
  const messages: AssistantMessage[] = []
  for (const entry of entries.map((item) => item.event).sort((left, right) => left.seq - right.seq)) {
    if (entry.type === 'user/message' && entry.data.source.kind === 'user') {
      const text = visibleText(entry.data.content)
      if (text) messages.push({ id: `user-${entry.data.id}`, kind: 'user', text })
    }
    if (entry.type === 'assistant/message') {
      const text = visibleText(entry.data.message.content)
      if (text) messages.push({ id: `assistant-${entry.data.turn}-${entry.data.step}`, kind: 'assistant', text })
    }
  }
  return messages
}

/** 服务端历史异步落盘期间，保留页面上刚发送但尚未出现在历史中的消息。 */
export function mergeHistoryMessages(history: readonly AssistantMessage[], current: readonly AssistantMessage[]): readonly AssistantMessage[] {
  const persistedUsers = new Set(history.filter((message) => message.kind === 'user').map((message) => message.text))
  const pending = current.filter((message) => message.id.startsWith('pending-') && !persistedUsers.has(message.text))
  return [...history, ...pending]
}
