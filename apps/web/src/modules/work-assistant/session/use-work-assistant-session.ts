import type { HistoryEntry, SessionId, SessionEvent, WorkspaceView } from '@deepseek-ai/dsh-client-connection/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AccountDshApiClient, unwrapDshResponse } from '../../../shared/dsh/client'
import { appendSessionEvents, hasPendingInteractiveTool, latestTurnFinished, mergeHistoryEntries, messagesFromHistory, type AssistantMessage } from '../main/conversation'

export type WorkAssistantConnection = 'connecting' | 'connected' | 'reconnecting' | 'failed'
export type WorkAssistantTask = 'idle' | 'submitting' | 'running' | 'stopping'

const noProgressTimeoutMs = 2 * 60_000

function isAbortReason(reason: unknown): boolean {
  if (reason instanceof DOMException && (reason.name === 'AbortError' || reason.name === 'TimeoutError')) return true
  return /abort(ed)?|user aborted a request|timeout/i.test(reason instanceof Error ? reason.message : String(reason))
}

function reconnectDelay(attempt: number): number { return Math.min(5_000, 500 * 2 ** Math.min(attempt, 4)) }

export function useWorkAssistantSession() {
  const client = useMemo(() => new AccountDshApiClient('/api/agents/work-assistant'), [])
  const [connection, setConnection] = useState<WorkAssistantConnection>('connecting')
  const [task, setTask] = useState<WorkAssistantTask>('idle')
  const [workspace, setWorkspace] = useState<WorkspaceView | null>(null)
  const [sessionId, setSessionId] = useState<SessionId | null>(null)
  const [history, setHistory] = useState<readonly HistoryEntry[]>([])
  const [pendingMessage, setPendingMessage] = useState<AssistantMessage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settledRevision, setSettledRevision] = useState(0)
  const activeSessionRef = useRef<SessionId | null>(null)
  const workspaceRef = useRef<WorkspaceView | null>(null)
  const taskRef = useRef<WorkAssistantTask>('idle')
  const lastProgressAt = useRef(Date.now())
  const pendingEvents = useRef(new Map<number, SessionEvent>())
  const flushTimer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)

  const transitionTask = useCallback((next: WorkAssistantTask) => {
    taskRef.current = next
    setTask(next)
  }, [])

  const settleTask = useCallback(() => {
    transitionTask('idle')
    setPendingMessage(null)
    setSettledRevision((current) => current + 1)
  }, [transitionTask])

  const clearEventQueue = useCallback(() => {
    pendingEvents.current.clear()
    if (flushTimer.current !== null) globalThis.clearTimeout(flushTimer.current)
    flushTimer.current = null
  }, [])

  const queueEvent = useCallback((event: SessionEvent) => {
    lastProgressAt.current = Date.now()
    pendingEvents.current.set(event.seq, event)
    if (event.type === 'tool/call' && event.data.name === 'ask_user_question') {
      const target = activeSessionRef.current
      if (target) {
        transitionTask('stopping')
        void client.sessions.cancel({ sessionId: target }).finally(() => {
          if (activeSessionRef.current !== target) return
          settleTask()
          setError('当前任务需要补充信息，已结束等待。请直接发送完整问题。')
        })
      }
    }
    if (event.type === 'turn/start' || event.type === 'step/start' || event.type === 'assistant/chunk') transitionTask('running')
    if (event.type === 'turn/end') settleTask()
    if (flushTimer.current !== null) return
    flushTimer.current = globalThis.setTimeout(() => {
      flushTimer.current = null
      const events = [...pendingEvents.current.values()]
      pendingEvents.current.clear()
      setHistory((current) => appendSessionEvents(current, events))
      if (events.some((item) => item.type === 'user/message' && item.data.source.kind === 'user')) setPendingMessage(null)
    }, 80)
  }, [client, settleTask, transitionTask])

  const loadHistory = useCallback(async (target: SessionId, recentOnly: boolean, signal?: AbortSignal) => {
    const response = unwrapDshResponse(await client.sessions.history({ sessionId: target, maxMessages: recentOnly ? 4 : 60 }, signal))
    if (activeSessionRef.current !== target) return false
    clearEventQueue()
    if (hasPendingInteractiveTool(response.events)) {
      try { unwrapDshResponse(await client.sessions.cancel({ sessionId: target }, signal)) } catch { /* 可能已由运行时结束。 */ }
      const targetWorkspace = workspaceRef.current
      try {
        await client.deleteSession(target)
        if (activeSessionRef.current !== target || !targetWorkspace) return true
        const next = unwrapDshResponse(await client.sessions.create({ workspaceId: targetWorkspace.workspaceId }, signal)).sessionId
        activeSessionRef.current = next
        setSessionId(next)
        setHistory([])
        setPendingMessage(null)
        settleTask()
        setError('上一条任务停在了网页不支持的交互，已自动恢复。请重新发送完整问题。')
      } catch {
        if (activeSessionRef.current === target) {
          settleTask()
          setError('上一条任务无法继续，请点击“清空对话”后重新发送。')
        }
      }
      return true
    }
    setHistory((current) => recentOnly ? mergeHistoryEntries(current, response.events) : response.events)
    if (latestTurnFinished(response.events)) settleTask()
    return latestTurnFinished(response.events)
  }, [clearEventQueue, client, settleTask])

  const reconcile = useCallback(async (target: SessionId, signal?: AbortSignal) => {
    const finished = await loadHistory(target, true, signal)
    if (finished || activeSessionRef.current !== target) return
    const sessions = unwrapDshResponse(await client.sessions.list({}, signal))
    const current = sessions.items.find((item) => item.sessionId === target)
    if (!current?.running) settleTask()
  }, [client, loadHistory, settleTask])

  const clearConversation = useCallback(async () => {
    const current = activeSessionRef.current
    const targetWorkspace = workspaceRef.current
    if (!current || !targetWorkspace || taskRef.current !== 'idle') return
    setError(null)
    activeSessionRef.current = null
    clearEventQueue()
    try {
      await client.deleteSession(current)
      const next = unwrapDshResponse(await client.sessions.create({ workspaceId: targetWorkspace.workspaceId })).sessionId
      activeSessionRef.current = next
      setSessionId(next)
      setHistory([])
      setPendingMessage(null)
    } catch (reason) {
      activeSessionRef.current = current
      setError(reason instanceof Error ? reason.message : '清空对话失败。')
      throw reason
    }
  }, [clearEventQueue, client])

  const send = useCallback(async (text: string) => {
    const target = activeSessionRef.current
    if (!target || taskRef.current !== 'idle') return
    setError(null)
    lastProgressAt.current = Date.now()
    setPendingMessage({ id: `pending-${Date.now()}`, kind: 'user', text })
    transitionTask('submitting')
    try {
      const submitted = client.promptSession({
        sessionId: target,
        mode: 'queue',
        content: [{ type: 'text', text }],
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      transitionTask('running')
      unwrapDshResponse(await submitted)
    } catch (reason) {
      if (isAbortReason(reason)) {
        transitionTask('running')
        try { await reconcile(target) } catch { /* 实时连接或看门狗会继续恢复。 */ }
        return
      }
      settleTask()
      setError(reason instanceof Error ? reason.message : '任务提交失败。')
    }
  }, [client, reconcile, settleTask, transitionTask])

  const stop = useCallback(async () => {
    const target = activeSessionRef.current
    if (!target || taskRef.current === 'idle') return
    transitionTask('stopping')
    setError(null)
    try {
      unwrapDshResponse(await client.sessions.cancel({ sessionId: target }))
      await reconcile(target)
      setError('已停止当前处理，可以继续发送新任务。')
    } catch (reason) {
      if (!isAbortReason(reason)) setError(reason instanceof Error ? reason.message : '停止处理失败。')
    } finally { settleTask() }
  }, [client, reconcile, settleTask, transitionTask])

  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    const markConnected = () => {
      setConnection('connected')
      setError((current) => current === '连接暂时中断，正在自动恢复…' || current === '工作空间连接失败，正在自动重试。' ? null : current)
      const target = activeSessionRef.current
      if (target && taskRef.current !== 'idle') void reconcile(target, controller.signal).catch(() => undefined)
    }

    async function bootstrap() {
      let attempt = 0
      while (!controller.signal.aborted && !disposed) {
        try {
          const workspaceResponse = unwrapDshResponse(await client.workspace.list({}, controller.signal))
          const items = workspaceResponse.items
          const targetWorkspace = items.find((item) => item.path.includes('/.runtime/agent-sandboxes/work-assistant--') && item.path.endsWith('/workspace')) ?? items[0]
          if (!targetWorkspace) throw new Error('工作空间正在准备。')
          const sessions = unwrapDshResponse(await client.sessions.list({}, controller.signal))
          const existing = sessions.items.find((item) => item.cwd === targetWorkspace.path && item.origin !== 'subagent')
          const active = existing?.sessionId ?? unwrapDshResponse(await client.sessions.create({ workspaceId: targetWorkspace.workspaceId }, controller.signal)).sessionId
          if (disposed) return
          workspaceRef.current = targetWorkspace
          activeSessionRef.current = active
          setWorkspace(targetWorkspace)
          setSessionId(active)
          setConnection('connected')
          if (existing?.running) transitionTask('running')
          void loadHistory(active, false, controller.signal).catch((reason) => {
            if (!disposed && !isAbortReason(reason)) setError('对话记录加载失败，后续消息仍可正常使用。')
          })
          return
        } catch (reason) {
          if (controller.signal.aborted || disposed) return
          attempt += 1
          setConnection(attempt >= 3 ? 'failed' : 'reconnecting')
          if (attempt >= 3 && !isAbortReason(reason)) setError('工作空间连接失败，正在自动重试。')
          await new Promise((resolve) => globalThis.setTimeout(resolve, reconnectDelay(attempt)))
        }
      }
    }

    async function pumpMux() {
      while (!controller.signal.aborted && !disposed) {
        try {
          for await (const envelope of client.events.mux({}, controller.signal, markConnected)) {
            const frame = envelope.payload
            if (frame.type === 'session/event' && frame.sessionId === activeSessionRef.current) queueEvent(frame.event)
          }
        } catch (reason) {
          if (controller.signal.aborted || disposed) return
          if (!isAbortReason(reason)) setError('连接暂时中断，正在自动恢复…')
        }
        if (!disposed) setConnection('reconnecting')
        await new Promise((resolve) => globalThis.setTimeout(resolve, 800))
      }
    }

    async function pumpHost() {
      while (!controller.signal.aborted && !disposed) {
        try {
          for await (const envelope of client.events.host({}, controller.signal, markConnected)) {
            const frame = envelope.payload
            if (frame.type === 'host/session-status' && frame.sessionId === activeSessionRef.current) {
              if (frame.running) transitionTask('running')
              else { void reconcile(frame.sessionId, controller.signal).catch(() => settleTask()) }
            }
            if (frame.type === 'host/agent-error' && frame.sessionId === activeSessionRef.current && !isAbortReason(frame.message)) setError(frame.message)
          }
        } catch (reason) {
          if (controller.signal.aborted || disposed) return
          if (!isAbortReason(reason)) setError('连接暂时中断，正在自动恢复…')
        }
        if (!disposed) setConnection('reconnecting')
        await new Promise((resolve) => globalThis.setTimeout(resolve, 800))
      }
    }

    void bootstrap()
    void pumpMux()
    void pumpHost()
    return () => {
      disposed = true
      controller.abort()
      clearEventQueue()
      activeSessionRef.current = null
      workspaceRef.current = null
    }
  }, [clearEventQueue, client, loadHistory, queueEvent, reconcile, settleTask, transitionTask])

  useEffect(() => {
    if (task === 'idle' || task === 'stopping' || !sessionId) return
    const timer = globalThis.setInterval(() => {
      const silentFor = Date.now() - lastProgressAt.current
      if (silentFor >= noProgressTimeoutMs) {
        transitionTask('stopping')
        void client.sessions.cancel({ sessionId }).finally(() => {
          settleTask()
          setError('处理长时间没有进展，已自动停止。请检查文件后重新发送。')
        })
      } else if (connection !== 'connected' || silentFor >= 8_000) {
        void reconcile(sessionId).catch(() => undefined)
      }
    }, 5_000)
    return () => globalThis.clearInterval(timer)
  }, [client, connection, reconcile, sessionId, settleTask, task, transitionTask])

  const messages = useMemo(() => {
    const persisted = messagesFromHistory(history)
    return pendingMessage ? [...persisted, pendingMessage] : persisted
  }, [history, pendingMessage])

  return {
    busy: task !== 'idle',
    clearConversation,
    connection,
    error,
    messages,
    send,
    sessionId,
    settledRevision,
    stop,
    task,
    workspace,
  }
}
