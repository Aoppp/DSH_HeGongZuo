import { ExternalLink, LoaderCircle, Paperclip, RefreshCw, Search, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { ModuleProps } from '../../../app/types'
import { SkeletonDetail, SkeletonTable } from '../../../components/Skeleton'
import type { DailyReport } from './daily-reports-api'
import { useDailyReportSync } from './use-daily-report-sync'
import { useDailyReports } from './use-daily-reports'
import { CalendarView, DashboardView, EmployeeArchiveView, IndividualReportersView, QualityView, type AnalyticsView } from './ReportAnalyticsViews'
import { shanghaiCalendarDate, shiftCalendarDate } from './report-dates'
import './daily-reports.css'

function date(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[1]}/${match[2]}/${match[3]}` : value
}

function time(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(parsed)
}

function content(value: string | null): string {
  return value?.trim() || '—'
}

function localSubmissionDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(parsed)
}

function delayed(report: DailyReport): boolean {
  return localSubmissionDate(report.submit_time) > report.report_date
}

function department(report: DailyReport): string {
  const values = [report.department.name, report.department.level2].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index)
  return values.join(' / ') || '未记录'
}

function sourceDepartmentDiffers(report: DailyReport): boolean {
  const source = report.source_department.name?.trim()
  return Boolean(source && source !== report.department.name?.trim() && source !== report.department.level2?.trim())
}

function attachmentUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch { return null }
}

function DetailContent({ report }: { readonly report: DailyReport }) {
  return <>
    <dl className="daily-report-detail__meta">
      <div><dt>填写人</dt><dd>{report.employee.name}</dd></div>
      <div><dt>当前部门</dt><dd>{department(report)}</dd></div>
      {sourceDepartmentDiffers(report) && <div><dt>提交时部门</dt><dd>{report.source_department.name}</dd></div>}
      {!report.employee.matched && <div><dt>档案关联</dt><dd><em className="daily-reports__unmatched">未关联员工档案</em></dd></div>}
      <div><dt>汇报日期</dt><dd>{date(report.report_date)}</dd></div>
      <div><dt>填写时间</dt><dd>{time(report.submit_time)}{delayed(report) && <em className="daily-reports__delayed">延后提交</em>}</dd></div>
    </dl>
    <div className="daily-report-detail__content"><h3>今日工作总结</h3><p>{content(report.today_summary)}</p></div>
    <div className="daily-report-detail__content"><h3>明日工作计划</h3><p>{content(report.tomorrow_plan)}</p></div>
    <div className="daily-report-detail__content"><h3>其他事项</h3><p>{content(report.other)}</p></div>
    <div className="daily-report-detail__attachments"><h3>附件</h3>{report.attachments.length === 0 ? <p>无附件</p> : <ul>{report.attachments.map((attachment, index) => {
      const url = attachmentUrl(attachment.url)
      return <li key={`${attachment.name}-${index}`}><Paperclip size={15} /><span>{attachment.name || `附件 ${index + 1}`}</span>{url && <a href={url} target="_blank" rel="noreferrer">查看<ExternalLink size={13} /></a>}</li>
    })}</ul>}</div>
  </>
}

export function EmployeeReportsModule(_props: ModuleProps) {
  const management = useDailyReports()
  const sync = useDailyReportSync(management.retry)
  const today = shanghaiCalendarDate()
  const [view, setView] = useState<AnalyticsView | 'list'>('dashboard')
  const [reportDate, setReportDate] = useState(() => shiftCalendarDate(today, -1))
  const [month, setMonth] = useState(today.slice(0, 7))
  const [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`)
  const [endDate, setEndDate] = useState(today)
  const [analyticsRevision, setAnalyticsRevision] = useState(0)
  function submit(event: FormEvent) { event.preventDefault(); management.applyFilters() }
  const pages = Math.max(1, management.totalPages)
  function openDate(dateValue: string) {
    management.showReports({ startDate: dateValue, endDate: dateValue, department: '', employee: '', keyword: '' })
    setView('list')
  }
  const views: readonly { id: AnalyticsView | 'list'; label: string }[] = [
    { id: 'dashboard', label: '提交看板' }, { id: 'calendar', label: '日历' }, { id: 'list', label: '日报列表' },
    { id: 'employees', label: '员工档案' }, { id: 'individual', label: '单独汇报' }, { id: 'quality', label: '数据检查' },
  ]

  return <div className="daily-reports module-page">
    <header className="daily-reports__heading"><div><h1>日报管理</h1><p>查看提交情况、工作汇总与数据质量</p></div><div className="daily-reports__sync"><span>{sync.error || sync.message}</span><button type="button" disabled={sync.busy} onClick={() => void sync.start().then(() => setAnalyticsRevision((value) => value + 1))}>{sync.busy ? <LoaderCircle className="daily-reports__spinner" size={15} /> : <RefreshCw size={15} />}{sync.busy ? '同步中' : '同步数据'}</button>{view === 'list' && <small>共 {management.total} 条</small>}</div></header>

    <nav className="report-tabs" aria-label="日报功能">{views.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>{item.label}</button>)}</nav>

    {['dashboard','calendar','quality'].includes(view) && <div className="report-scope">
      {view === 'dashboard' && <><label>统计日期<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label><div className="report-scope__presets"><button type="button" onClick={() => setReportDate((value) => shiftCalendarDate(value, -1))}>前一天</button><button type="button" onClick={() => setReportDate((value) => shiftCalendarDate(value, 1))}>下一天</button></div></>}
      {view === 'calendar' && <label>月份<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>}
      {view === 'quality' && <><label>开始日期<input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>结束日期<input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} /></label></>}
    </div>}

    {view === 'dashboard' && <DashboardView date={reportDate} revision={analyticsRevision} />}
    {view === 'calendar' && <CalendarView month={month} onSelectDate={openDate} revision={analyticsRevision} />}
    {view === 'employees' && <EmployeeArchiveView revision={analyticsRevision} />}
    {view === 'individual' && <IndividualReportersView revision={analyticsRevision} />}
    {view === 'quality' && <QualityView startDate={startDate} endDate={endDate} revision={analyticsRevision} />}

    {view === 'list' && <><form className="daily-reports__filters" onSubmit={submit}>
      <div className="daily-reports__date-range"><label><span>开始日期</span><input type="date" value={management.draftFilters.startDate} max={management.draftFilters.endDate || undefined} onChange={(event) => management.setDraftFilters((current) => ({ ...current, startDate: event.target.value }))} /></label><i>至</i><label><span>结束日期</span><input type="date" value={management.draftFilters.endDate} min={management.draftFilters.startDate || undefined} onChange={(event) => management.setDraftFilters((current) => ({ ...current, endDate: event.target.value }))} /></label></div>
      <label><span>部门</span><input maxLength={240} value={management.draftFilters.department} placeholder="部门名称" onChange={(event) => management.setDraftFilters((current) => ({ ...current, department: event.target.value }))} /></label>
      <label><span>员工</span><input maxLength={160} value={management.draftFilters.employee} placeholder="姓名" onChange={(event) => management.setDraftFilters((current) => ({ ...current, employee: event.target.value }))} /></label>
      <label className="daily-reports__keyword"><span>关键词</span><input maxLength={200} value={management.draftFilters.keyword} placeholder="搜索工作总结、明日计划或其他事项" onChange={(event) => management.setDraftFilters((current) => ({ ...current, keyword: event.target.value }))} /></label>
      <div className="daily-reports__filter-actions"><button type="submit" className="daily-reports__search"><Search size={15} />查询</button><button type="button" onClick={management.resetFilters}>重置</button></div>
    </form>

    {management.error && <div className="daily-reports__error"><span>{management.error}</span><button type="button" onClick={management.retry}>重新加载</button></div>}

    <section className="daily-reports__panel">
      <div className="daily-reports__table-wrap"><table><thead><tr><th>汇报日期</th><th>填写人</th><th>所在部门</th><th>今日工作总结</th><th>明日工作计划</th><th>提交时间</th><th aria-label="操作" /></tr></thead>
        <tbody>{!management.loading && !management.error && management.reports.map((report) => <tr key={report.record_id}><td><strong>{date(report.report_date)}</strong></td><td>{report.employee.name}{!report.employee.matched && <em className="daily-reports__unmatched">未关联</em>}</td><td>{department(report)}</td><td><p className="daily-reports__summary">{content(report.today_summary)}</p></td><td><p className="daily-reports__summary">{content(report.tomorrow_plan)}</p></td><td>{time(report.submit_time)}{delayed(report) && <em className="daily-reports__delayed">延后提交</em>}</td><td><button type="button" className="daily-reports__view" onClick={() => void management.openDetail(report.record_id)}>查看</button></td></tr>)}</tbody></table></div>
      {management.loading && <SkeletonTable columns={7} rows={management.pageSize > 10 ? 8 : management.pageSize} header={false} />}
      {!management.loading && !management.error && management.loaded && management.reports.length === 0 && <div className="daily-reports__empty">{management.hasFilters ? '没有符合筛选条件的日报' : '暂无日报记录'}</div>}
    </section>

    {!management.loading && !management.error && management.total > 0 && <nav className="daily-reports__pagination" aria-label="日报分页"><span>共 {management.total} 条・第 {management.page} / {pages} 页</span><label>每页<select value={management.pageSize} onChange={(event) => management.setPageSize(Number(event.target.value))}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select>条</label><div><button type="button" disabled={management.page <= 1} onClick={() => management.setPage((value) => value - 1)}>上一页</button><button type="button" disabled={management.page >= pages} onClick={() => management.setPage((value) => value + 1)}>下一页</button></div></nav>}

    {management.detailOpen && <div className="daily-report-detail" role="dialog" aria-modal="true" aria-label="日报详情"><button type="button" className="daily-report-detail__backdrop" aria-label="关闭详情" onClick={management.closeDetail} /><section><header><div><small>日报详情</small><strong>{management.detail ? `${management.detail.employee.name}・${date(management.detail.report_date)}` : ''}</strong></div><button type="button" aria-label="关闭" onClick={management.closeDetail}><X size={19} /></button></header><main>{management.detailLoading ? <SkeletonDetail /> : management.detailError ? <div className="daily-reports__error"><span>{management.detailError}</span><button type="button" onClick={() => void management.retryDetail()}>重新加载</button></div> : management.detail && <DetailContent report={management.detail} />}</main></section></div>}</>}
  </div>
}
