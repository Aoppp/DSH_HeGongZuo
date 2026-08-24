import type { HistoryEntry, SessionEvent } from '@deepseek-ai/dsh-client-connection/client'

export interface AssistantMessage {
  readonly id: string
  readonly kind: 'user' | 'assistant' | 'error'
  readonly text: string
  readonly state?: 'running' | 'failed'
}

export function parseMarkdownTable(lines: readonly string[]): { readonly headers: readonly string[]; readonly rows: readonly (readonly string[])[] } | null {
  const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
  if (lines.length < 2 || !/^\|?.+\|.+\|?$/.test(lines[0] ?? '') || !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[1] ?? '')) return null
  const headers = cells(lines[0] ?? '')
  if (headers.length < 2) return null
  return { headers, rows: lines.slice(2).map(cells).filter((row) => row.length === headers.length) }
}

function visibleText(content: readonly { readonly type: string; readonly text?: string }[]): string {
  return content.filter((part) => part.type === 'text' && typeof part.text === 'string').map((part) => part.text ?? '').join('\n').trim()
}

export function eventSequence(event: { readonly seq?: unknown; readonly seq0?: unknown }): number {
  if (typeof event.seq === 'number') return event.seq
  // DSH 为压缩文本事件使用 seq0；若直接按 seq 排序会产生不稳定顺序，进而让
  // 页面长期保留半截流式片段。
  if (typeof event.seq0 === 'number') return event.seq0
  return -1
}

function packedSequenceRange(event: { readonly seq0?: unknown; readonly data?: unknown }): readonly [number, number] | null {
  if (typeof event.seq0 !== 'number' || !event.data || typeof event.data !== 'object' || !('texts' in event.data) || !Array.isArray(event.data.texts)) return null
  return [event.seq0, event.seq0 + Math.max(0, event.data.texts.length - 1)]
}

/** 将实时事件或短历史窗口合并进当前历史，避免重复事件和旧响应覆盖新内容。 */
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

export function appendSessionEvents(current: readonly HistoryEntry[], events: readonly SessionEvent[]): HistoryEntry[] {
  return mergeHistoryEntries(current, events.map((event) => ({ event })))
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
  for (const entry of entries.map((item) => item.event).sort((left, right) => eventSequence(left) - eventSequence(right))) {
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

/** 用最新历史窗口更新末尾消息，同时保留窗口之前已经加载的对话。 */
export function mergeHistoryWindow(history: readonly AssistantMessage[], current: readonly AssistantMessage[]): readonly AssistantMessage[] {
  if (history.length === 0) return current
  const historyIds = new Set(history.map((message) => message.id))
  const firstOverlap = current.findIndex((message) => historyIds.has(message.id))
  const prefix = firstOverlap < 0
    ? current.filter((message) => !message.id.startsWith('pending-'))
    : current.slice(0, firstOverlap).filter((message) => !message.id.startsWith('pending-'))
  const persistedUsers = new Set(history.filter((message) => message.kind === 'user').map((message) => message.text))
  const pending = current.filter((message) => message.id.startsWith('pending-') && !persistedUsers.has(message.text))
  return [...prefix, ...history, ...pending]
}

/** 当前最新一轮已有结束事件时，不应继续依赖可能延迟更新的会话 running 标记。 */
export function latestTurnFinished(entries: readonly HistoryEntry[]): boolean {
  let latestObservedTurn = -1
  let latestCompletedTurn = -1
  for (const entry of entries) {
    const event = entry.event
    const turn = 'data' in event && event.data && typeof event.data === 'object' && 'turn' in event.data && typeof event.data.turn === 'number'
      ? event.data.turn
      : -1
    latestObservedTurn = Math.max(latestObservedTurn, turn)
    // assistant/message 是 DSH 已持久化的完整正文。某些历史响应会先返回它、稍后
    // 才带 turn/end；将其视为完成可避免完整回复仍显示“正在生成”。
    if (event.type === 'assistant/message' || event.type === 'turn/end') latestCompletedTurn = Math.max(latestCompletedTurn, turn)
  }
  // 长回复的历史窗口可能已截掉本轮 user/message，因此完成判断必须按 turn，不能
  // 依赖用户消息仍在当前分页中。
  return latestObservedTurn >= 0 && latestCompletedTurn >= latestObservedTurn
}
