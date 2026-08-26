import { AlertTriangle, CalendarDays, CheckCircle2, FileText, LoaderCircle, RefreshCw, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { ModuleProps } from '../../../app/types'
import { clock, localDate } from '../work-records/work-records-format'
import { readEmployeeReports, type EmployeeReportsSnapshot } from '../work-records/work-records-api'
import '../work-records/employee-work-records.css'

export function EmployeeReportsModule(_props: ModuleProps) {
  const [date, setDate] = useState(localDate)
  const [snapshot, setSnapshot] = useState<EmployeeReportsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async (nextDate: string, signal?: AbortSignal) => {
    setLoading(true); setError(null)
    try { setSnapshot(await readEmployeeReports(nextDate, signal)) }
    catch (reason) { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(reason instanceof Error ? reason.message : '工作汇报暂时无法读取。') }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [])
  useEffect(() => { const controller = new AbortController(); void load(date, controller.signal); return () => controller.abort() }, [date, load])

  return <div className="employee-work-records module-page">
    <header className="work-records-heading"><div><h1>工作汇报</h1><p>查看员工日报内容与提交情况</p></div><div className="work-records-heading__actions">{snapshot?.connectionStatus === 'demo' && <span className="work-records-demo">演示数据</span>}<label><CalendarDays size={15} /><input aria-label="查询日期" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><button type="button" onClick={() => void load(date)} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={15} />刷新</button></div></header>
    <div className="work-records-connection"><span><i />{snapshot?.connectionStatus === 'connected' ? '企业微信汇报已连接' : '企业微信汇报尚未连接，当前展示演示数据'}</span><small>正式接入后将自动显示企业微信中的实际汇报内容。</small></div>
    {error && <div className="work-records-error"><AlertTriangle size={16} />{error}<button type="button" onClick={() => void load(date)}>重新加载</button></div>}
    {loading && !snapshot ? <div className="work-records-loading"><LoaderCircle className="spin" size={22} />正在加载工作汇报…</div> : snapshot && <>
      <section className="work-records-metrics work-records-metrics--compact"><article><i><FileText size={18} /></i><span>应交日报<strong>{snapshot.reports.expected}</strong><small>人</small></span></article><article><i><CheckCircle2 size={18} /></i><span>已提交<strong>{snapshot.reports.submitted}</strong><small>人</small></span></article><article className={snapshot.reports.missing ? 'is-warning' : ''}><i><Users size={18} /></i><span>未提交<strong>{snapshot.reports.missing}</strong><small>人</small></span></article></section>
      <section className="work-records-panel"><div className="work-records-section-title"><h2>日报记录</h2><span>{snapshot.reports.records.length} 条</span></div><div className="work-report-list">{snapshot.reports.records.length === 0 ? <p className="work-records-empty">当日暂无汇报记录</p> : snapshot.reports.records.map((report) => <article key={report.id}><header><div><strong>{report.employeeName}</strong><span>{report.departmentName}</span></div><p>{report.templateName}<time>{clock(report.submittedAt)} 提交</time></p></header><dl>{report.fields.map((field, index) => <div key={`${field.label}-${index}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></article>)}</div></section>
    </>}
  </div>
}
