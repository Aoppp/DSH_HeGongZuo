import type {
  HistoryEntry,
  SessionId,
  SessionSummary,
  WorkspaceView,
} from '@deepseek-ai/dsh-client-connection/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { appendSessionEvent } from './conversation'
import { AccountDshApiClient, unwrapDshResponse } from './dsh-api-client'

export type AgentConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'error'

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

  const loadHistory = useCallback(async (sessionId: SessionId) => {
    if (!api) return
    const response = unwrapDshResponse(await api.sessions.history({ sessionId, maxMessages: 100 }))
    setHistory(response.events)
  }, [api])

  const selectSession = useCallback(async (sessionId: SessionId) => {
    activeSessionRef.current = sessionId
    setActiveSessionId(sessionId)
    setHistory([])
    setError(null)
    try {
      await loadHistory(sessionId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [loadHistory])

  const refreshSessions = useCallback(async (targetWorkspace: WorkspaceView) => {
    if (!api) return []
    const response = unwrapDshResponse(await api.sessions.list({}))
    const archived = new Set((unwrapDshResponse(await api.workspace.list({}))).archivedSessionIds)
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

    async function bootstrap() {
      try {
        const workspaceResponse = unwrapDshResponse(await client.workspace.list({}, controller.signal))
        const targetWorkspace = workspaceResponse.items[0]
        if (!targetWorkspace) throw new Error('后台尚未注册员工查询工作空间，请重新初始化账号服务。')
        workspaceRef.current = targetWorkspace
        setWorkspace(targetWorkspace)
        const scopedSessions = await refreshSessions(targetWorkspace)
        const initial = scopedSessions[0]
        if (initial) await selectSession(initial.id)
        if (!disposed) setConnectionState('connected')
      } catch (reason) {
        if (controller.signal.aborted || disposed) return
        setConnectionState('error')
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    }

    async function pumpMux() {
      while (!controller.signal.aborted && !disposed) {
        try {
          for await (const envelope of client.events.mux({}, controller.signal, () => setConnectionState('connected'))) {
            if (disposed) return
            const frame = envelope.payload
            if (frame.type === 'session/event' && frame.sessionId === activeSessionRef.current) {
              setHistory((current) => appendSessionEvent(current, frame.event))
            }
          }
        } catch (reason) {
          if (controller.signal.aborted || disposed) return
          setError(reason instanceof Error ? reason.message : String(reason))
        }
        setConnectionState('reconnecting')
        await new Promise((resolve) => setTimeout(resolve, 800))
      }
    }

    async function pumpHost() {
      while (!controller.signal.aborted && !disposed) {
        try {
          for await (const envelope of client.events.host({}, controller.signal)) {
            if (disposed) return
            const frame = envelope.payload
            if (frame.type === 'host/session-status') {
              setSessions((current) => current.map((session) => session.id === frame.sessionId
                ? { ...session, running: frame.running }
                : session))
            }
            if (frame.type === 'host/agent-error' && frame.sessionId === activeSessionRef.current) {
              setError(frame.message)
            }
          }
        } catch (reason) {
          if (controller.signal.aborted || disposed) return
          setError(reason instanceof Error ? reason.message : String(reason))
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
      workspaceRef.current = null
      activeSessionRef.current = null
    }
  }, [api, refreshSessions, selectSession])

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
