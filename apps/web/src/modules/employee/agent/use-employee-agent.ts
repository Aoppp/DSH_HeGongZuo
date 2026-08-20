// 员工查询状态管理。
import type {
  HistoryEntry,
  SessionId,
  SessionEvent,
  SessionSummary,
  WorkspaceView,
} from '@deepseek-ai/dsh-client-connection/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { appendSessionEvents } from './conversation'
import { AccountDshApiClient, unwrapDshResponse } from './dsh-api-client'

export type AgentConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'error'

function isAbortReason(reason: unknown): boolean {
  if (reason instanceof DOMException && reason.name === 'AbortError') return true
  const message = reason instanceof Error ? reason.message : String(reason)
  return /abort(ed)?|user aborted a request/i.test(message)
}

function reconnectDelay(attempt: number): number { return Math.min(5_000, 500 * 2 ** Math.min(attempt, 4)) }

function sessionTitle(session: SessionSummary): string {
  const projectionValues = session.projections?.values as Readonly<Record<string, unknown>> | undefined
  const title = projectionValues?.title
  if (typeof title === 'string' && title.trim()) return title.trim()
  if (session.blank) return '新对话'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(session.updatedAt)
}

export interface EmployeeAgentSession {
  readonly id: SessionId
  readonly title: string
  readonly updatedAt: number
  readonly running: boolean
}

export function useEmployeeAgent() {
  const api = useMemo(() => new AccountDshApiClient(), [])
  const [connectionState, setConnectionState] = useState<AgentConnectionState>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceView | null>(null)
  const [sessions, setSessions] = useState<EmployeeAgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<SessionId | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [sending, setSending] = useState(false)
  const [deletingSessionId, setDeletingSessionId] = useState<SessionId | null>(null)
  const activeSessionRef = useRef<SessionId | null>(null)
  const workspaceRef = useRef<WorkspaceView | null>(null)
  const pendingEventsRef = useRef(new Map<number, SessionEvent>())
  const eventFlushTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)

  const clearPendingEvents = useCallback(() => {
    pendingEventsRef.current.clear()
    if (eventFlushTimerRef.current !== null) globalThis.clearTimeout(eventFlushTimerRef.current)
    eventFlushTimerRef.current = null
  }, [])

  const queueSessionEvent = useCallback((event: SessionEvent) => {
    pendingEventsRef.current.set(event.seq, event)
    if (eventFlushTimerRef.current !== null) return
    eventFlushTimerRef.current = globalThis.setTimeout(() => {
      eventFlushTimerRef.current = null
      const events = [...pendingEventsRef.current.values()]
      pendingEventsRef.current.clear()
      setHistory((current) => appendSessionEvents(current, events))
    }, 80)
  }, [])

  const loadHistory = useCallback(async (sessionId: SessionId, signal?: AbortSignal) => {
    if (!api) return
    const response = unwrapDshResponse(await api.sessions.history({ sessionId, maxMessages: 100 }, signal))
    clearPendingEvents()
    setHistory(response.events)
  }, [api, clearPendingEvents])

  const selectSession = useCallback(async (sessionId: SessionId, signal?: AbortSignal) => {
    clearPendingEvents()
    activeSessionRef.current = sessionId
    setActiveSessionId(sessionId)
    setHistory([])
    setError(null)
    try {
      await loadHistory(sessionId, signal)
    } catch (reason) {
      if (!isAbortReason(reason)) setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [clearPendingEvents, loadHistory])

  const refreshSessions = useCallback(async (targetWorkspace: WorkspaceView, signal?: AbortSignal) => {
    if (!api) return []
    const response = unwrapDshResponse(await api.sessions.list({}, signal))
    const archived = new Set((unwrapDshResponse(await api.workspace.list({}, signal))).archivedSessionIds)
    const scoped = response.items
      .filter((session) => session.cwd === targetWorkspace.path && session.origin !== 'subagent' && !archived.has(session.sessionId))
      .map((session) => ({
        id: session.sessionId,
        title: sessionTitle(session),
        updatedAt: session.updatedAt,
        running: session.running,
      }))
    setSessions(scoped)
    return scoped
  }, [api])

  const createSession = useCallback(async () => {
    try {
      if (!api || !workspaceRef.current) throw new Error('员工查询服务尚未就绪。')
      const response = unwrapDshResponse(await api.sessions.create({ workspaceId: workspaceRef.current.workspaceId }))
      await refreshSessions(workspaceRef.current)
      await selectSession(response.sessionId)
      return response.sessionId
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      throw reason
    }
  }, [api, refreshSessions, selectSession])

  const sendPrompt = useCallback(async (text: string) => {
    if (!api) return
    setSending(true)
    setError(null)
    try {
      const sessionId = activeSessionRef.current ?? await createSession()
      unwrapDshResponse(await api.sessions.prompt({
        sessionId,
        mode: 'queue',
        content: [{ type: 'text', text }],
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }))
      await loadHistory(sessionId)
      if (workspaceRef.current) await refreshSessions(workspaceRef.current)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSending(false)
    }
  }, [api, createSession, loadHistory, refreshSessions])

  const deleteSession = useCallback(async (sessionId: SessionId) => {
    if (!api) return
    setDeletingSessionId(sessionId)
    setError(null)
    try {
      await api.deleteSession(sessionId)
      const targetWorkspace = workspaceRef.current
      const remainingSessions = targetWorkspace ? await refreshSessions(targetWorkspace) : []
      if (activeSessionRef.current === sessionId) {
        activeSessionRef.current = null
        setActiveSessionId(null)
        setHistory([])
        const nextSession = remainingSessions[0]
        if (nextSession) await selectSession(nextSession.id)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setDeletingSessionId(null)
    }
  }, [api, refreshSessions, selectSession])

  useEffect(() => {
    if (!api) {
      setConnectionState('error')
      return
    }

    const client = api
    const controller = new AbortController()
    let disposed = false
    const markConnected = () => {
      setConnectionState('connected')
      setError((current) => current === '连接暂时中断，正在自动恢复…' ? null : current)
    }

    async function bootstrap() {
      let attempt = 0
      while (!controller.signal.aborted && !disposed) {
        try {
          const workspaceResponse = unwrapDshResponse(await client.workspace.list({}, controller.signal))
          const targetWorkspace = workspaceResponse.items[0]
          if (!targetWorkspace) throw new Error('后台尚未注册员工查询工作空间，请重新初始化账号服务。')
          workspaceRef.current = targetWorkspace
          setWorkspace(targetWorkspace)
          const scopedSessions = await refreshSessions(targetWorkspace, controller.signal)
          const initial = scopedSessions[0]
          if (initial) await selectSession(initial.id, controller.signal)
          if (!disposed) { setConnectionState('connected'); setError(null) }
          return
        } catch (reason) {
          if (controller.signal.aborted || disposed) return
          attempt += 1
          setConnectionState('reconnecting')
          if (attempt >= 3 && !isAbortReason(reason)) setError('连接暂时中断，正在自动恢复…')
          await new Promise((resolve) => setTimeout(resolve, reconnectDelay(attempt)))
        }
      }
    }

    async function pumpMux() {
      while (!controller.signal.aborted && !disposed) {
        try {
          for await (const envelope of client.events.mux({}, controller.signal, markConnected)) {
            if (disposed) return
            const frame = envelope.payload
            if (frame.type === 'session/event' && frame.sessionId === activeSessionRef.current) {
              queueSessionEvent(frame.event)
            }
          }
        } catch (reason) {
          if (controller.signal.aborted || disposed) return
          if (!isAbortReason(reason)) setError('连接暂时中断，正在自动恢复…')
        }
        setConnectionState('reconnecting')
        await new Promise((resolve) => setTimeout(resolve, 800))
      }
    }

    async function pumpHost() {
      while (!controller.signal.aborted && !disposed) {
        try {
          for await (const envelope of client.events.host({}, controller.signal, markConnected)) {
            if (disposed) return
            const frame = envelope.payload
            if (frame.type === 'host/session-status') {
              setSessions((current) => current.map((session) => session.id === frame.sessionId
                ? { ...session, running: frame.running }
                : session))
            }
            if (frame.type === 'host/agent-error' && frame.sessionId === activeSessionRef.current && !isAbortReason(frame.message)) {
              setError(frame.message)
            }
          }
        } catch (reason) {
          if (controller.signal.aborted || disposed) return
          if (!isAbortReason(reason)) setError('连接暂时中断，正在自动恢复…')
        }
        setConnectionState('reconnecting')
        await new Promise((resolve) => setTimeout(resolve, 800))
      }
    }

    void bootstrap()
    void pumpMux()
    void pumpHost()

    return () => {
      disposed = true
      controller.abort()
      clearPendingEvents()
      workspaceRef.current = null
      activeSessionRef.current = null
    }
  }, [api, clearPendingEvents, queueSessionEvent, refreshSessions, selectSession])

  return {
    activeSessionId,
    connectionState,
    createSession,
    deleteSession,
    deletingSessionId,
    error,
    history,
    selectSession,
    sendPrompt,
    sending,
    sessions,
    workspace,
  }
}
