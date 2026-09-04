import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'

import { SkeletonCards, SkeletonTable } from '../../../components/Skeleton'
import { readAttendanceMonthlySummary, type AttendanceMonthlySummary } from '../work-records/work-records-api'

function shiftMonth(month: string, offset: number): string {
  const value = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + offset, 1))
  return value.toISOString().slice(0, 7)
}

function change(current: number, previous: number, suffix = ''): string {
  const difference = Math.round((current - previous) * 10) / 10
  return `${difference > 0 ? '+' : ''}${difference}${suffix}`
}

export function AttendanceMonthlyOverview({ initialMonth }: { readonly initialMonth: string }) {
  const latestMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
  const [month, setMonth] = useState(initialMonth)
  const [summary, setSummary] = useState<AttendanceMonthlySummary | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { setMonth(initialMonth) }, [initialMonth])
  useEffect(() => {
    const controller = new AbortController(); setError('')
    void readAttendanceMonthlySummary(month, controller.signal).then(setSummary).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '月度考勤加载失败。') })
    return () => controller.abort()
  }, [month])

  return <section className="attendance-monthly">
    <header><div><h2>月度考勤</h2><span>汇总考勤趋势、部门情况和异常人员</span></div><div className="attendance-month-picker"><button type="button" aria-label="上一月" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={15} /></button><label><CalendarDays size={14} /><input type="month" max={latestMonth} value={month} onChange={(event) => setMonth(event.target.value)} /></label><button type="button" aria-label="下一月" disabled={month >= latestMonth} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={15} /></button></div></header>
    {error ? <div className="work-records-error"><AlertTriangle size={16} />{error}</div> : !summary ? <div className="attendance-monthly-loading"><SkeletonCards count={5} /><SkeletonTable columns={6} rows={4} /></div> : <>
      <div className="attendance-month-metrics">
        <article><span>应出勤人次</span><strong>{summary.metrics.expected}</strong><small>上月 {summary.previousMetrics.expected}</small></article>
        <article className="is-success"><span>已出勤人次</span><strong>{summary.metrics.attended}</strong><small>上月 {summary.previousMetrics.attended}</small></article>
        <article className="is-warning"><span>迟到人次</span><strong>{summary.metrics.late}</strong><small>环比 {change(summary.metrics.late, summary.previousMetrics.late)}</small></article>
        <article className="is-danger"><span>缺卡人次</span><strong>{summary.metrics.missing}</strong><small>环比 {change(summary.metrics.missing, summary.previousMetrics.missing)}</small></article>
        <article><span>出勤率</span><strong>{summary.metrics.attendanceRate}%</strong><small>环比 {change(summary.metrics.attendanceRate, summary.previousMetrics.attendanceRate, '个百分点')}</small></article>
      </div>
      <div className="attendance-month-grid">
        <section className="attendance-departments"><div className="attendance-subheading"><h3>部门考勤</h3><span>异常优先</span></div><div className="work-attendance-table"><table><thead><tr><th>部门</th><th>应出勤</th><th>已出勤</th><th>迟到</th><th>缺卡</th><th>请假</th><th>出勤率</th></tr></thead><tbody>{summary.departments.map((item) => <tr key={item.departmentName}><td><strong>{item.departmentName}</strong></td><td>{item.expected}</td><td>{item.attended}</td><td className={item.late ? 'attendance-number--warning' : ''}>{item.late}</td><td className={item.missing ? 'attendance-number--danger' : ''}>{item.missing}</td><td>{item.leave}</td><td>{item.attendanceRate}%</td></tr>)}</tbody></table></div></section>
        <section className="attendance-top-ranking"><div className="attendance-subheading"><h3>异常排行</h3><span>前 10 名</span></div><div>{summary.rankings.map((item, index) => <article key={item.employeeId}><b>{index + 1}</b><span><strong>{item.employeeName}</strong><small>{item.departmentName}</small></span><dl><div><dt>迟到</dt><dd>{item.lateCount}</dd></div><div><dt>缺卡</dt><dd>{item.missingCount}</dd></div><div><dt>异常</dt><dd>{item.total}</dd></div></dl></article>)}{summary.rankings.length === 0 && <p className="work-records-empty">本月暂无考勤异常</p>}</div></section>
      </div>
    </>}
  </section>
}
