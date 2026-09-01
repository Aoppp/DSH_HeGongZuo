import { useCallback, useEffect, useRef, useState } from 'react'

import { readDailyReport, readDailyReports, type DailyReport, type DailyReportFilters } from './daily-reports-api'

export const emptyDailyReportFilters: DailyReportFilters = {
  startDate: '', endDate: '', department: '', employee: '', keyword: '',
}

function aborted(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError'
}

export function useDailyReports() {
  const [draftFilters, setDraftFilters] = useState<DailyReportFilters>(emptyDailyReportFilters)
  const [filters, setFilters] = useState<DailyReportFilters>(emptyDailyReportFilters)
  const [reports, setReports] = useState<readonly DailyReport[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const listSequence = useRef(0)

  useEffect(() => {
    const sequence = ++listSequence.current
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setReports([])
    setTotal(0)
    setTotalPages(0)
    void readDailyReports(filters, page, pageSize, controller.signal).then((result) => {
      if (sequence !== listSequence.current) return
      setReports(result.reports)
      setTotal(result.total)
      setTotalPages(result.totalPages)
      setLoaded(true)
    }).catch((reason: unknown) => {
      if (sequence !== listSequence.current || aborted(reason)) return
      setError(reason instanceof Error ? reason.message : '日报暂时无法读取。')
      setTotal(0)
      setTotalPages(0)
      setLoaded(true)
    }).finally(() => {
      if (sequence === listSequence.current) setLoading(false)
    })
    return () => controller.abort()
  }, [filters, page, pageSize, revision])

  const applyFilters = useCallback(() => {
    setPage(1)
    setFilters({
      startDate: draftFilters.startDate,
      endDate: draftFilters.endDate,
      department: draftFilters.department.trim(),
      employee: draftFilters.employee.trim(),
      keyword: draftFilters.keyword.trim(),
    })
    setRevision((value) => value + 1)
  }, [draftFilters])

  const resetFilters = useCallback(() => {
    setDraftFilters(emptyDailyReportFilters)
    setFilters(emptyDailyReportFilters)
    setPage(1)
    setRevision((value) => value + 1)
  }, [])

  const retry = useCallback(() => setRevision((value) => value + 1), [])
  const showReports = useCallback((nextFilters: DailyReportFilters) => {
    setDraftFilters(nextFilters); setFilters(nextFilters); setPage(1); setRevision((value) => value + 1)
  }, [])
  const hasFilters = Object.values(filters).some(Boolean)

  const [detail, setDetail] = useState<DailyReport | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const detailSequence = useRef(0)
  const detailController = useRef<AbortController | null>(null)
  const detailId = useRef('')

  const openDetail = useCallback(async (id: string) => {
    detailId.current = id
    const sequence = ++detailSequence.current
    detailController.current?.abort()
    const controller = new AbortController()
    detailController.current = controller
    setDetailOpen(true)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const result = await readDailyReport(id, controller.signal)
      if (sequence === detailSequence.current) setDetail(result)
    } catch (reason) {
      if (sequence === detailSequence.current && !aborted(reason)) setDetailError(reason instanceof Error ? reason.message : '日报详情暂时无法读取。')
    } finally {
      if (sequence === detailSequence.current) setDetailLoading(false)
    }
  }, [])

  const closeDetail = useCallback(() => {
    detailSequence.current += 1
    detailController.current?.abort()
    setDetailOpen(false)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(false)
  }, [])

  useEffect(() => () => detailController.current?.abort(), [])
  const retryDetail = useCallback(() => detailId.current ? openDetail(detailId.current) : Promise.resolve(), [openDetail])

  return {
    draftFilters, setDraftFilters, filters, reports, page, setPage, pageSize,
    setPageSize: (value: number) => { setPageSize(value); setPage(1) },
    total, totalPages, loading, loaded, error, retry, hasFilters, applyFilters, resetFilters, showReports,
    detail, detailOpen, detailLoading, detailError, openDetail, retryDetail, closeDetail,
  }
}
