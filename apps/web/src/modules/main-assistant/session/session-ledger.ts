import type { HistoryEntry, SessionEvent } from '@deepseek-ai/dsh-client-connection/client'
import { appendSessionEvents, eventSequence, latestTurnFinished, mergeHistoryEntries, messagesFromHistory, type AssistantMessage } from '../conversation.ts'

function turnOf(entry: HistoryEntry): number {
  const data = entry.event.data
  return data && 'turn' in data && typeof data.turn === 'number' ? data.turn : -1
}

/** 旧快照只能补充内容，不能结束新请求。 */
export class SessionLedger {
  entries: readonly HistoryEntry[] = []
  revision = 0
  private boundary = -1
  private minimumTurn = -1
  private awaitingUser = false
  private pending: AssistantMessage | null = null
  private failed: AssistantMessage[] = []

  submit(text: string): number {
    if (this.pending?.state === 'failed') this.failed.push(this.pending)
    this.failed = this.failed.slice(-10)
    this.revision += 1
    this.boundary = Math.max(-1, ...this.entries.map((entry) => eventSequence(entry.event)))
    this.minimumTurn = Math.max(-1, ...this.entries.map(turnOf)) + 1
    this.awaitingUser = true
    this.pending = { id: `pending-${this.revision}`, kind: 'user', text }
    return this.revision
  }

  merge(entries: readonly HistoryEntry[]): void {
    this.entries = mergeHistoryEntries(this.entries, entries)
    if (this.pending && this.pending.state !== 'failed') {
      const expected = this.pending.text.trim()
      const accepted = this.entries.some(({ event }) => event.type === 'user/message'
        && eventSequence(event) > this.boundary && event.data.source.kind === 'user'
        && event.data.content.filter((part) => part.type === 'text').map((part) => 'text' in part ? part.text : '').join('\n').trim() === expected)
      if (accepted) { this.pending = null; this.awaitingUser = false }
    }
  }

  append(events: readonly SessionEvent[]): void { this.merge(appendSessionEvents([], events)) }

  canFinish(requestRevision = this.revision): boolean {
    if (requestRevision !== this.revision || this.awaitingUser) return false
    const relevant = this.entries.filter((entry) => turnOf(entry) >= this.minimumTurn)
    const latestTurn = relevant.reduce((maximum, entry) => Math.max(maximum, turnOf(entry)), -1)
    const completeContent = relevant.some(({ event }) => {
      if (!('turn' in event.data) || event.data.turn !== latestTurn) return false
      return (event.type === 'assistant/message' && event.data.message.content.some((part) => part.type === 'text'))
        || (event.type === 'turn/end' && event.data.reason.kind !== 'completed')
    })
    return completeContent && latestTurnFinished(relevant)
  }

  failSubmission(revision: number): void {
    if (revision === this.revision && this.pending) this.pending = { ...this.pending, state: 'failed' }
  }

  get messages(): readonly AssistantMessage[] {
    return [...messagesFromHistory(this.entries), ...this.failed, ...(this.pending ? [this.pending] : [])]
  }
}
