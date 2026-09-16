import type { SessionId, SessionEvent, WorkspaceView } from '@deepseek-ai/dsh-client-connection/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccountDshApiClient, unwrapDshResponse } from '../../../shared/dsh/client'
import { hasPendingInteractiveTool } from '../conversation'
import { SessionLedger } from './session-ledger'

export type MainAssistantConnection = 'connecting' | 'connected' | 'reconnecting' | 'failed'
export type MainAssistantTask = 'idle' | 'submitting' | 'running' | 'stopping'
const noProgressTimeoutMs = 2 * 60_000
function isAbortReason(reason: unknown): boolean {
  return /abort(ed)?|user aborted a request|timeout/i.test(reason instanceof Error ? reason.message : String(reason))
}

export function useMainAssistantSession(apiBasePath = '/api/agents/main-assistant', runtimeId = 'main-assistant') {
  const client = useMemo(() => new AccountDshApiClient(apiBasePath), [apiBasePath])
  const [connection, setConnection] = useState<MainAssistantConnection>('connecting')
  const [task, setTask] = useState<MainAssistantTask>('idle')
  const [workspace, setWorkspace] = useState<WorkspaceView | null>(null)
  const [sessionId, setSessionId] = useState<SessionId | null>(null)
  const [messages, setMessages] = useState<SessionLedger['messages']>([])
  const [error, setError] = useState<string | null>(null)
  const [settledRevision, setSettledRevision] = useState(0)
  const ledger = useRef(new SessionLedger())
  const active = useRef<SessionId | null>(null)
  const workspaceRef = useRef<WorkspaceView | null>(null)
  const taskRef = useRef<MainAssistantTask>('idle')
  const lastProgress = useRef(Date.now())
  const pendingEvents = useRef<SessionEvent[]>([])
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const epoch = useRef(0)
  const syncing = useRef<Promise<void> | null>(null)
  const publish = useCallback(() => {
    const next = ledger.current.messages
    setMessages((current) => current.length === next.length && current.every((item, index) => item.id === next[index]?.id && item.text === next[index]?.text && item.state === next[index]?.state) ? current : next)
  }, [])

  const transition = useCallback((next: MainAssistantTask) => { taskRef.current = next; setTask(next) }, [])
  const finish = useCallback(() => {
    if (taskRef.current !== 'idle') setSettledRevision((value) => value + 1)
    transition('idle')
  }, [transition])
  const flush = useCallback(() => {
    if (flushTimer.current !== null) clearTimeout(flushTimer.current)
    flushTimer.current = null
    ledger.current.append(pendingEvents.current)
    pendingEvents.current = []
    publish()
    if (ledger.current.canFinish()) finish()
  }, [finish, publish])

  const reconcile = useCallback((target: SessionId, signal?: AbortSignal): Promise<void> => {
    if (syncing.current) return syncing.current
    const currentEpoch = epoch.current
    const revision = ledger.current.revision
    const valid = () => active.current === target && epoch.current === currentEpoch && !signal?.aborted
    const request = (async () => {
      const response = unwrapDshResponse(await client.sessions.history({ sessionId: target, maxMessages: 60 }, signal))
      if (!valid()) return
      const before = ledger.current.entries.length
      ledger.current.merge(response.events)
      // 请求期间到达的实时事件必须合并，不得丢弃。
      ledger.current.append(pendingEvents.current)
      pendingEvents.current = []
      publish()
      if (ledger.current.entries.length > before) lastProgress.current = Date.now()
      if (revision !== ledger.current.revision) return
      if (ledger.current.canFinish(revision)) { finish(); return }
      if (hasPendingInteractiveTool(ledger.current.entries)) {
        try { unwrapDshResponse(await client.sessions.cancel({ sessionId: target }, signal)) } catch { return }
        if (valid() && revision === ledger.current.revision) {
          finish()
          setError('当前任务需要补充信息，已停止等待。历史对话已保留，请直接补充问题。')
        }
      }
      // host 的 running=false 可能属于上一轮；没有本轮完成内容时不提前结束。
    })()
    syncing.current = request
    void request.finally(() => { if (syncing.current === request) syncing.current = null }).catch(() => undefined)
    return request
  }, [client, finish, publish])

  const queueEvent = useCallback((event: SessionEvent) => {
    lastProgress.current = Date.now()
    pendingEvents.current.push(event)
    if (event.type === 'turn/start' || event.type === 'assistant/chunk') transition('running')
    if (flushTimer.current === null) flushTimer.current = setTimeout(flush, 80)
    if (event.type === 'turn/end' || (event.type === 'tool/call' && event.data.name === 'ask_user_question')) {
      const target = active.current
      if (target) void reconcile(target).catch(() => undefined)
    }
  }, [flush, reconcile, transition])

  const clearConversation = useCallback(async () => {
    const current = active.current, targetWorkspace = workspaceRef.current
    if (!targetWorkspace || taskRef.current !== 'idle') return
    epoch.current += 1
    syncing.current = null
    active.current = null
    pendingEvents.current = []
    if (flushTimer.current !== null) clearTimeout(flushTimer.current)
    flushTimer.current = null
    transition('stopping')
    setError(null)
    let deleted = !current
    try {
      if (current) await client.deleteSession(current)
      deleted = true
      active.current = null
      setSessionId(null)
      ledger.current = new SessionLedger()
      pendingEvents.current = []
      setMessages([])
      const next = unwrapDshResponse(await client.sessions.create({ workspaceId: targetWorkspace.workspaceId })).sessionId
      active.current = next
      setSessionId(next)
    } catch (reason) {
      if (!deleted) active.current = current
      setError(deleted ? '旧对话已清空，新对话创建失败，请点击清空对话重试。' : '清空对话失败，原对话已保留。')
      throw reason
    } finally { finish() }
  }, [client, finish, transition])

  const send = useCallback(async (text: string) => {
    const target = active.current
    if (!target || taskRef.current !== 'idle') return
    flush()
    const currentEpoch = epoch.current
    const revision = ledger.current.submit(text)
    const valid = () => active.current === target && epoch.current === currentEpoch && ledger.current.revision === revision
    publish()
    setError(null)
    lastProgress.current = Date.now()
    transition('submitting')
    try {
      const submitted = client.promptSession({ sessionId: target, mode: 'queue', content: [{ type: 'text', text }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      transition('running')
      unwrapDshResponse(await submitted)
      if (valid()) void reconcile(target).catch(() => undefined)
    } catch (reason) {
      if (!valid()) return
      if (isAbortReason(reason)) { void reconcile(target).catch(() => undefined); return }
      ledger.current.failSubmission(revision)
      publish()
      finish()
      setError(reason instanceof Error ? reason.message : '任务提交失败，消息已保留，请重试。')
    }
  }, [client, finish, flush, publish, reconcile, transition])

  const stop = useCallback(async () => {
    const target = active.current, currentEpoch = epoch.current
    if (!target || taskRef.current === 'idle') return
    transition('stopping')
    try {
      unwrapDshResponse(await client.sessions.cancel({ sessionId: target }))
      await reconcile(target)
      if (active.current === target && epoch.current === currentEpoch) {
        ledger.current.failSubmission(ledger.current.revision)
        publish()
        finish()
        setError('已停止当前处理，历史内容已保留。')
      }
    } catch { if (active.current === target) { transition('running'); setError('停止请求未确认，正在继续核对处理状态。') } }
  }, [client, finish, publish, reconcile, transition])

  useEffect(() => {
    const controller = new AbortController()
    epoch.current += 1
    ledger.current = new SessionLedger()
    syncing.current = null
    setSessionId(null)
    setMessages([])
    transition('idle')
    const pause = (ms: number) => new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', done); resolve() }
      const timer = setTimeout(done, ms)
      controller.signal.addEventListener('abort', done, { once: true })
    })
    const markConnected = () => {
      if (controller.signal.aborted) return
      setConnection('connected')
      setError((value) => value === '连接暂时中断，正在自动恢复…' ? null : value)
      const target = active.current
      if (target) void reconcile(target, controller.signal).catch(() => undefined)
    }
    async function bootstrap() {
      let attempt = 0
      while (!controller.signal.aborted) {
        try {
          const items = unwrapDshResponse(await client.workspace.list({}, controller.signal)).items
          const targetWorkspace = items.find((item) => item.path.includes(`/.runtime/agent-sandboxes/${runtimeId}--`) && item.path.endsWith('/workspace'))
          if (!targetWorkspace) throw new Error('工作空间正在准备。')
          const sessions = unwrapDshResponse(await client.sessions.list({}, controller.signal))
          const existing = sessions.items.find((item) => item.cwd === targetWorkspace.path && item.origin !== 'subagent')
          const target = existing?.sessionId ?? unwrapDshResponse(await client.sessions.create({ workspaceId: targetWorkspace.workspaceId }, controller.signal)).sessionId
          const history = unwrapDshResponse(await client.sessions.history({ sessionId: target, maxMessages: 60 }, controller.signal)).events
          if (controller.signal.aborted) return
          workspaceRef.current = targetWorkspace
          active.current = target
          ledger.current.merge(history)
          publish()
          setWorkspace(targetWorkspace)
          setSessionId(target)
          transition(existing?.running && !ledger.current.canFinish() ? 'running' : 'idle')
          markConnected()
          return
        } catch {
          if (controller.signal.aborted) return
          setConnection(++attempt >= 3 ? 'failed' : 'reconnecting')
          await pause(Math.min(5_000, 500 * 2 ** Math.min(attempt, 4)))
        }
      }
    }
    async function pump(kind: 'mux' | 'host') {
      while (!controller.signal.aborted) {
        try {
          const stream = kind === 'mux' ? client.events.mux({}, controller.signal, markConnected) : client.events.host({}, controller.signal, markConnected)
          for await (const envelope of stream) {
            if (controller.signal.aborted) return
            const frame = envelope.payload
            if (frame.type === 'session/event' && frame.sessionId === active.current) queueEvent(frame.event)
            if (frame.type === 'host/session-status' && frame.sessionId === active.current) void reconcile(frame.sessionId, controller.signal).catch(() => undefined)
            if (frame.type === 'host/agent-error' && frame.sessionId === active.current && !isAbortReason(frame.message)) setError(frame.message)
          }
        } catch { /* 断线不清空消息，不改变业务轮次。 */ }
        if (controller.signal.aborted) return
        setConnection('reconnecting')
        setError('连接暂时中断，正在自动恢复…')
        await pause(800)
      }
    }
    void bootstrap()
    void pump('mux')
    void pump('host')
    return () => {
      controller.abort()
      epoch.current += 1
      if (flushTimer.current !== null) clearTimeout(flushTimer.current)
      flushTimer.current = null
      pendingEvents.current = []
      active.current = null
      workspaceRef.current = null
    }
  }, [client, publish, queueEvent, reconcile, runtimeId, transition])

  useEffect(() => {
    if (!sessionId) return
    const timer = setInterval(() => {
      if (active.current !== sessionId || taskRef.current === 'stopping') return
      if (taskRef.current !== 'idle' && Date.now() - lastProgress.current >= noProgressTimeoutMs) void stop()
      else void reconcile(sessionId).catch(() => undefined)
    }, task === 'idle' ? 15_000 : 3_000)
    return () => clearInterval(timer)
  }, [reconcile, sessionId, stop, task])

  return { busy: task !== 'idle', clearConversation, connection, error, messages, send, sessionId, settledRevision, stop, task, workspace }
}
