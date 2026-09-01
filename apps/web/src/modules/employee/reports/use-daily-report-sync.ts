import { useCallback, useEffect, useRef, useState } from 'react'

import { readDailyReportSyncState, startDailyReportSync, type DailyReportSyncRun, type DailyReportSyncState } from './daily-reports-api'

const terminalStatuses = new Set<DailyReportSyncRun['status']>(['succeeded', 'partial', 'failed', 'skipped'])

function statusMessage(state: DailyReportSyncState | null, waiting: boolean): string {
  if (waiting || state?.queued) return '已提交，等待同步'
  if (!state?.run) return '每天 22:00 自动同步'
  if (state.run.status === 'running') return '正在同步日报…'
  const finished = state.run.finishedAt ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(state.run.finishedAt)) : ''
  if (state.run.status === 'failed') return `${finished || '上次'}同步失败`
  if (state.run.status === 'partial') return `${finished || '上次'}部分同步成功，失败 ${state.run.stats.failed} 条`
  if (state.run.status === 'skipped') return '上次任务因已有同步运行而跳过'
  return `${finished || '上次'}同步完成，新增 ${state.run.stats.inserted} 条，更新 ${state.run.stats.updated} 条`
}

export function useDailyReportSync(onCompleted: () => void) {
  const [state, setState] = useState<DailyReportSyncState | null>(null)
  const [starting, setStarting] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const waitingRef = useRef(false)
  const baselineRunId = useRef<number | null>(null)
  const manualRunId = useRef<number | null>(null)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await readDailyReportSyncState(signal)
      setState(next)
      setError(null)
      if (waitingRef.current && next.run && next.run.id !== baselineRunId.current) {
        waitingRef.current = false
        setWaiting(false)
        manualRunId.current = next.run.id
      }
      if (manualRunId.current === next.run?.id && terminalStatuses.has(next.run.status)) {
        manualRunId.current = null
        onCompleted()
      }
      setPolling(waitingRef.current || next.queued || next.run?.status === 'running' || manualRunId.current !== null)
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : '同步状态暂时无法读取。')
      if (waitingRef.current || manualRunId.current !== null) setPolling(true)
    }
  }, [onCompleted])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    if (!polling) return
    const timer = window.setInterval(() => void refresh(), 3_000)
    return () => window.clearInterval(timer)
  }, [polling, refresh])

  const start = useCallback(async () => {
    if (starting || waitingRef.current || state?.queued || state?.run?.status === 'running') return
    setStarting(true)
    setError(null)
    baselineRunId.current = state?.run?.id ?? null
    waitingRef.current = true
    setWaiting(true)
    try {
      const result = await startDailyReportSync()
      setState(result.state)
      setPolling(true)
    } catch (reason) {
      waitingRef.current = false
      setWaiting(false)
      setError(reason instanceof Error ? reason.message : '手动同步任务提交失败。')
    } finally {
      setStarting(false)
    }
  }, [starting, state])

  const busy = starting || waiting || state?.queued === true || state?.run?.status === 'running'
  return { state, busy, error, message: statusMessage(state, waiting), start }
}
