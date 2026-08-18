import type { HistoryEntry, SessionEvent } from '@deepseek-ai/dsh-client-connection/client'

export interface ConversationItem {
  readonly id: string
  readonly kind: 'user' | 'assistant' | 'tool' | 'error'
  readonly text: string
  readonly label?: string
  readonly state?: 'running' | 'completed' | 'failed'
  readonly time: number
}

function visibleText(content: readonly { readonly type: string; readonly text?: string }[]): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

function assistantKey(turn: number, step: number): string {
  return `assistant-${turn}-${step}`
}

export function buildConversation(entries: readonly HistoryEntry[]): ConversationItem[] {
  const events = entries.map((entry) => entry.event).sort((left, right) => left.seq - right.seq)
  const finalAssistantSteps = new Set<string>()
  const items: ConversationItem[] = []
  const positions = new Map<string, number>()
  const toolNames = new Map<string, string>()

  for (const event of events) {
    if (event.type === 'assistant/message') {
      finalAssistantSteps.add(assistantKey(event.data.turn, event.data.step))
    }
  }

  function upsert(item: ConversationItem): void {
    const position = positions.get(item.id)
    if (position === undefined) {
      positions.set(item.id, items.length)
      items.push(item)
    } else {
      items[position] = item
    }
  }

  for (const event of events) {
    switch (event.type) {
      case 'user/message': {
        if (event.data.source.kind !== 'user') break
        const text = visibleText(event.data.content)
        if (text) {
          upsert({ id: `user-${event.data.id}`, kind: 'user', text, time: event.time })
        }
        break
      }
      case 'assistant/chunk': {
        const key = assistantKey(event.data.turn, event.data.step)
        if (finalAssistantSteps.has(key) || event.data.chunk.type !== 'text-delta') break
        const position = positions.get(key)
        const previousText = position === undefined ? '' : items[position]?.text ?? ''
        upsert({
          id: key,
          kind: 'assistant',
          text: `${previousText}${event.data.chunk.text}`,
          state: 'running',
          time: event.time,
        })
        break
      }
      case 'assistant/message': {
        const text = visibleText(event.data.message.content)
        if (text) {
          upsert({
            id: assistantKey(event.data.turn, event.data.step),
            kind: 'assistant',
            text,
            state: 'completed',
            time: event.time,
          })
        }
        break
      }
      case 'tool/call': {
        const callId = String(event.data.callId)
        toolNames.set(callId, event.data.name)
        upsert({
          id: `tool-${callId}`,
          kind: 'tool',
          label: event.data.name,
          text: '正在查询员工数据…',
          state: 'running',
          time: event.time,
        })
        break
      }
      case 'tool/result': {
        const resultBlock = event.data.message.content[0]
        const callId = String(resultBlock.toolCallId)
        const failed = Boolean(resultBlock.isError || event.data.error)
        upsert({
          id: `tool-${callId}`,
          kind: 'tool',
          label: toolNames.get(callId) ?? '员工数据工具',
          text: failed ? '员工数据查询失败' : '员工数据查询完成',
          state: failed ? 'failed' : 'completed',
          time: event.time,
        })
        break
      }
      case 'turn/end': {
        if (event.data.reason.kind === 'error') {
          upsert({
            id: `error-${event.seq}`,
            kind: 'error',
            text: event.data.reason.error.message,
            state: 'failed',
            time: event.time,
          })
        } else if (event.data.reason.kind === 'max-tokens') {
          upsert({
            id: `error-${event.seq}`,
            kind: 'error',
            text: '本次回答已达到长度上限，你可以发送“继续”获取后续内容。',
            state: 'failed',
            time: event.time,
          })
        }
        break
      }
      default:
        break
    }
  }

  return items
}

export function appendSessionEvent(entries: readonly HistoryEntry[], event: SessionEvent): HistoryEntry[] {
  const existing = entries.findIndex((entry) => entry.event.seq === event.seq)
  if (existing === -1) return [...entries, { event }]
  return entries.map((entry, index) => index === existing ? { event } : entry)
}
