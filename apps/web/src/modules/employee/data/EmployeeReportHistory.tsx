import { useEffect, useState } from 'react'

import { SkeletonList } from '../../../components/Skeleton'
import { Pagination } from '../../../components/Pagination'
import { readEmployeeReportHistory, type EmployeeReportHistoryPage } from './employee-report-history-api'
import './employee-report-history.css'

export function EmployeeReportHistory({ employeeId }: { readonly employeeId: string }) {
  const [page, setPage] = useState(1)
  const [history, setHistory] = useState<EmployeeReportHistoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setPage(1)
    return () => controller.abort()
  }, [employeeId])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void readEmployeeReportHistory(employeeId, page, controller.signal)
      .then(setHistory)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '历史日报读取失败。')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [employeeId, page])

  return <section className="employee-report-history">
    <h3>历史日报</h3>
    {loading ? <SkeletonList count={5} />
      : error ? <div className="employee-report-history__state is-error">{error}</div>
        : history && !history.linked ? <div className="employee-report-history__state">该员工暂未关联企业微信账号</div>
          : history && history.reports.length ? <>
            <div className="employee-report-history__list">{history.reports.map((report) => <article key={report.id}><time>{report.date}</time><p>{report.content}</p></article>)}</div>
            {history.totalPages > 1 && <nav aria-label="历史日报分页"><span>共 {history.total} 条</span><Pagination page={page} totalPages={history.totalPages} onChange={setPage} label="历史日报分页" /></nav>}
          </> : <div className="employee-report-history__state">暂无历史日报</div>}
  </section>
}
