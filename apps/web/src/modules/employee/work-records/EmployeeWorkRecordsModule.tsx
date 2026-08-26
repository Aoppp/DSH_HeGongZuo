import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, FileText, LoaderCircle, RefreshCw, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { ModuleProps } from '../../../app/types'
import { readWorkRecords, type AttendanceStatus, type WorkRecordsSnapshot } from './work-records-api'
import './employee-work-records.css'

type View = 'reports' | 'attendance'

const statusLabels: Record<AttendanceStatus, string> = { normal: '正常', late: '迟到', early_leave: '早退', missing: '缺卡' }

function localDate(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function clock(value: string | null): string {
  return value ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '—'
}

export function EmployeeWorkRecordsModule(_props: ModuleProps) {
  const [date, setDate] = useState(localDate)
  const [view, setView] = useState<View>('reports')
  const [snapshot, setSnapshot] = useState<WorkRecordsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (nextDate: string, signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try { setSnapshot(await readWorkRecords(nextDate, signal)) }
    catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : '考勤与汇报数据暂时无法读取。')
    } finally { if (!signal?.aborted) setLoading(false) }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(date, controller.signal)
    return () => controller.abort()
  }, [date, load])

  return <div className="employee-work-records module-page">
    <header className="work-records-heading">
      <div><h1>考勤与汇报</h1><p>查看员工打卡情况与企业微信汇报内容</p></div>
      <div className="work-records-heading__actions">
        {snapshot?.connectionStatus === 'demo' && <span className="work-records-demo">演示数据</span>}
        <label><CalendarDays size={15} /><input aria-label="查询日期" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <button type="button" onClick={() => void load(date)} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={15} />刷新</button>
      </div>
    </header>

    <div className="work-records-connection"><span><i />{snapshot?.connectionStatus === 'connected' ? '企业微信数据已连接' : '企业微信数据尚未连接，当前展示演示数据'}</span><small>正式接入后，页面会沿用相同结构自动显示实际汇报与打卡记录。</small></div>

    {error && <div className="work-records-error"><AlertTriangle size={16} />{error}<button type="button" onClick={() => void load(date)}>重新加载</button></div>}
    {loading && !snapshot ? <div className="work-records-loading"><LoaderCircle className="spin" size={22} />正在加载考勤与汇报…</div> : snapshot && <>
      <section className="work-records-metrics">
        <article><i><FileText size={18} /></i><span>应交日报<strong>{snapshot.reports.expected}</strong><small>人</small></span></article>
        <article><i><CheckCircle2 size={18} /></i><span>已提交<strong>{snapshot.reports.submitted}</strong><small>人</small></span></article>
        <article className={snapshot.reports.missing ? 'is-warning' : ''}><i><Users size={18} /></i><span>未提交<strong>{snapshot.reports.missing}</strong><small>人</small></span></article>
        <article><i><Clock3 size={18} /></i><span>正常出勤<strong>{snapshot.attendance.normal}</strong><small>人</small></span></article>
        <article className={snapshot.attendance.exceptions ? 'is-danger' : ''}><i><AlertTriangle size={18} /></i><span>考勤异常<strong>{snapshot.attendance.exceptions}</strong><small>人</small></span></article>
      </section>

      <section className="work-records-panel">
        <nav className="work-records-tabs" aria-label="数据分类">
          <button type="button" className={view === 'reports' ? 'is-active' : ''} onClick={() => setView('reports')}>日报记录 <span>{snapshot.reports.records.length}</span></button>
          <button type="button" className={view === 'attendance' ? 'is-active' : ''} onClick={() => setView('attendance')}>打卡记录 <span>{snapshot.attendance.records.length}</span></button>
        </nav>
        {view === 'reports' ? <div className="work-report-list">
          {snapshot.reports.records.length === 0 ? <p className="work-records-empty">当日暂无汇报记录</p> : snapshot.reports.records.map((report) => <article key={report.id}>
            <header><div><strong>{report.employeeName}</strong><span>{report.departmentName}</span></div><p>{report.templateName}<time>{clock(report.submittedAt)} 提交</time></p></header>
            <dl>{report.fields.map((field, index) => <div key={`${field.label}-${index}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
          </article>)}
        </div> : <div className="work-attendance-table"><table><thead><tr><th>员工</th><th>部门</th><th>班次</th><th>上班打卡</th><th>下班打卡</th><th>状态</th><th>地点</th></tr></thead><tbody>{snapshot.attendance.records.map((record) => <tr key={record.id}><td><strong>{record.employeeName}</strong></td><td>{record.departmentName}</td><td>{record.scheduledStart}—{record.scheduledEnd}</td><td>{clock(record.checkInAt)}</td><td>{clock(record.checkOutAt)}</td><td><span className={`attendance-status attendance-status--${record.status}`}>{statusLabels[record.status]}</span></td><td>{record.location ?? '—'}</td></tr>)}</tbody></table>{snapshot.attendance.records.length === 0 && <p className="work-records-empty">当日暂无打卡记录</p>}</div>}
      </section>
    </>}
  </div>
}
