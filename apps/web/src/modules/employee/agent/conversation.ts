// 员工查询会话转换。
import type { HistoryEntry, SessionEvent } from '@deepseek-ai/dsh-client-connection/client'

export interface ConversationItem {
  readonly id: string
  readonly kind: 'user' | 'assistant' | 'tool' | 'error'
  readonly text: string
  readonly label?: string
  readonly state?: 'running' | 'completed' | 'failed'
  readonly time: number
}

export const maximumConversationTurns = 30
export const maximumSavedConversations = 3

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

export function eventSequence(event: { readonly seq?: unknown; readonly seq0?: unknown }): number {
  if (typeof event.seq === 'number') return event.seq
  if (typeof event.seq0 === 'number') return event.seq0
  return -1
}

function packedSequenceRange(event: { readonly seq0?: unknown; readonly data?: unknown }): readonly [number, number] | null {
  if (typeof event.seq0 !== 'number' || !event.data || typeof event.data !== 'object' || !('texts' in event.data) || !Array.isArray(event.data.texts)) return null
  return [event.seq0, event.seq0 + Math.max(0, event.data.texts.length - 1)]
}

/** 将短历史窗口与实时事件按序号合并，避免旧历史覆盖刚到达的完整回复。 */
export function mergeHistoryEntries(current: readonly HistoryEntry[], incoming: readonly HistoryEntry[]): HistoryEntry[] {
  if (incoming.length === 0) return [...current]
  const merged = new Map<number, HistoryEntry>()
  const incomingPackedRanges = incoming.map((entry) => packedSequenceRange(entry.event)).filter((range): range is readonly [number, number] => range !== null)
  const currentPackedRanges = current.map((entry) => packedSequenceRange(entry.event)).filter((range): range is readonly [number, number] => range !== null)
  const coveredBy = (sequence: number, ranges: readonly (readonly [number, number])[]) => ranges.some(([start, end]) => sequence >= start && sequence <= end)
  for (const entry of current) {
    const sequence = eventSequence(entry.event)
    if (!packedSequenceRange(entry.event) && coveredBy(sequence, incomingPackedRanges)) continue
    merged.set(sequence, entry)
  }
  for (const entry of incoming) {
    const sequence = eventSequence(entry.event)
    if (!packedSequenceRange(entry.event) && coveredBy(sequence, currentPackedRanges)) continue
    merged.set(sequence, entry)
  }
  return [...merged.values()].sort((left, right) => eventSequence(left.event) - eventSequence(right.event))
}

/** 判断最新轮次是否已有完整回答或结束事件。 */
export function latestTurnFinished(entries: readonly HistoryEntry[]): boolean {
  let latestObservedTurn = -1
  let latestCompletedTurn = -1
  for (const { event } of entries) {
    const turn = 'data' in event && event.data && typeof event.data === 'object' && 'turn' in event.data && typeof event.data.turn === 'number'
      ? event.data.turn
      : -1
    latestObservedTurn = Math.max(latestObservedTurn, turn)
    if (event.type === 'assistant/message') {
      const hasToolCall = event.data.message.content.some((part) => part.type === 'tool-call')
      if (!hasToolCall) latestCompletedTurn = Math.max(latestCompletedTurn, turn)
    }
    if (event.type === 'turn/end') latestCompletedTurn = Math.max(latestCompletedTurn, turn)
  }
  return latestObservedTurn >= 0 && latestCompletedTurn >= latestObservedTurn
}

export function latestTurnFinishedAfter(entries: readonly HistoryEntry[], sequence: number): boolean {
  return latestTurnFinished(entries.filter((entry) => eventSequence(entry.event) > sequence))
}

export function buildConversation(entries: readonly HistoryEntry[]): ConversationItem[] {
  const events = entries.map((entry) => entry.event).sort((left, right) => eventSequence(left) - eventSequence(right))
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
    const packed = event as unknown as { readonly type?: unknown; readonly time?: unknown; readonly data?: { readonly turn?: unknown; readonly step?: unknown; readonly texts?: unknown } }
    if (packed.type === 'text-chunks'
      && typeof packed.data?.turn === 'number'
      && typeof packed.data?.step === 'number'
      && Array.isArray(packed.data.texts)
      && packed.data.texts.every((text) => typeof text === 'string')) {
      const key = assistantKey(packed.data.turn, packed.data.step)
      if (!finalAssistantSteps.has(key)) {
        const position = positions.get(key)
        const previousText = position === undefined ? '' : items[position]?.text ?? ''
        upsert({
          id: key,
          kind: 'assistant',
          text: `${previousText}${packed.data.texts.join('')}`,
          state: 'running',
          time: typeof packed.time === 'number' ? packed.time : 0,
        })
      }
      continue
    }
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
        const needsUnsupportedInteraction = event.data.name === 'ask_user_question'
        upsert({
          id: `tool-${callId}`,
          kind: 'tool',
          label: event.data.name,
          text: needsUnsupportedInteraction ? '当前对话等待补充信息，请终止并删除后重新发起查询。' : '正在查询员工数据…',
          state: needsUnsupportedInteraction ? 'failed' : 'running',
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
          const interrupted = /abort(ed)?|user aborted a request/i.test(event.data.reason.error.message)
          upsert({
            id: `error-${event.seq}`,
            kind: 'error',
            text: interrupted ? '本次查询连接中断，请重新发送。' : event.data.reason.error.message,
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

export function countUserConversationTurns(entries: readonly HistoryEntry[]): number {
  return buildConversation(entries).filter((item) => item.kind === 'user').length
}

export function appendSessionEvent(entries: readonly HistoryEntry[], event: SessionEvent): HistoryEntry[] {
  const existing = entries.findIndex((entry) => entry.event.seq === event.seq)
  if (existing === -1) return [...entries, { event }]
  return entries.map((entry, index) => index === existing ? { event } : entry)
}

/** 批量合并高频流式事件，避免每个文本片段都遍历和重绘整段会话。 */
export function appendSessionEvents(entries: readonly HistoryEntry[], events: readonly SessionEvent[]): HistoryEntry[] {
  return mergeHistoryEntries(entries, events.map((event) => ({ event })))
}
