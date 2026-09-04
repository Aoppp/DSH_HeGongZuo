import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, RefreshCw, Search, UserCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ModuleProps } from '../../../app/types'
import { SkeletonCards, SkeletonTable } from '../../../components/Skeleton'
import { exportAttendance } from './export-attendance'
import { AttendanceAnomalyDialog, AttendanceHistoryDialog, AttendanceOverviewDialog, attendanceClock, attendanceStatusLabels } from './AttendanceInsights'
import { AttendanceMonthlyOverview } from './AttendanceMonthlyOverview'
import { localDate } from '../work-records/work-records-format'
import { readEmployeeAttendance, type AttendanceRecord, type AttendanceStatus, type EmployeeAttendanceSnapshot } from '../work-records/work-records-api'
import '../work-records/employee-work-records.css'

const statusOptions: readonly { readonly value: '' | AttendanceStatus; readonly label: string }[] = [{ value: '', label: '全部' }, { value: 'normal', label: '正常' }, { value: 'late', label: '迟到' }, { value: 'missing', label: '缺卡' }, { value: 'leave', label: '请假' }]
const anomalyStatuses = new Set<AttendanceStatus>(['late', 'late_severe', 'early_leave', 'missing'])
type OverviewKind = 'expected' | 'attended' | 'late' | 'missing' | 'leave'

function shiftDate(date: string, days: number): string {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!matched) return date
  const value = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]) + days))
  return value.toISOString().slice(0, 10)
}

export function EmployeeAttendanceModule(_props: ModuleProps) {
  const latestDate = shiftDate(localDate(), -1)
  const [view, setView] = useState<'daily' | 'monthly'>('daily')
  const [date, setDate] = useState(latestDate)
  const [snapshot, setSnapshot] = useState<EmployeeAttendanceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState<'' | AttendanceStatus>('')
  const [onlyAnomalies, setOnlyAnomalies] = useState(false)
  const [overviewOpen, setOverviewOpen] = useState<OverviewKind | null>(null)
  const [historyEmployee, setHistoryEmployee] = useState<{ readonly id: string; readonly name: string; readonly month: string } | null>(null)
  const [anomaliesOpen, setAnomaliesOpen] = useState(false)
  const load = useCallback(async (nextDate: string, signal?: AbortSignal) => {
    setLoading(true); setError(null)
    try { setSnapshot(await readEmployeeAttendance(nextDate, signal)) }
    catch (reason) { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(reason instanceof Error ? reason.message : '考勤数据暂时无法读取。') }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [])
  useEffect(() => { const controller = new AbortController(); void load(date, controller.signal); return () => controller.abort() }, [date, load])
  const departments = useMemo(() => [...new Set(snapshot?.attendance.records.map((record) => record.departmentName) ?? [])].sort((left, right) => left.localeCompare(right, 'zh-CN')), [snapshot])
  const records = useMemo(() => (snapshot?.attendance.records ?? []).filter((record) => (!query.trim() || `${record.employeeName} ${record.departmentName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) && (!department || record.departmentName === department) && (!status || record.status === status || (status === 'late' && record.status === 'late_severe')) && (!onlyAnomalies || anomalyStatuses.has(record.status))).sort((left, right) => {
    const priority = { missing: 5, late_severe: 4, late: 3, early_leave: 2, leave: 1, normal: 0 }
    return priority[right.status] - priority[left.status] || left.employeeName.localeCompare(right.employeeName, 'zh-CN')
  }), [snapshot, query, department, status, onlyAnomalies])
  const overview = useMemo(() => {
    const source = snapshot?.attendance.records ?? []
    return {
      expected: snapshot?.attendance.expected ?? 0,
      attended: source.filter((record) => record.status !== 'leave' && Boolean(record.checkInAt || record.checkOutAt)).length,
      late: source.filter((record) => record.status === 'late' || record.status === 'late_severe').length,
      missing: source.filter((record) => record.status === 'missing').length,
      leave: source.filter((record) => record.status === 'leave').length,
    }
  }, [snapshot])
  const overviewRecords = useMemo<Record<OverviewKind, readonly AttendanceRecord[]>>(() => {
    const source = snapshot?.attendance.records ?? []
    return {
      expected: source,
      attended: source.filter((record) => record.status !== 'leave' && Boolean(record.checkInAt || record.checkOutAt)),
      late: source.filter((record) => record.status === 'late' || record.status === 'late_severe'),
      missing: source.filter((record) => record.status === 'missing'),
      leave: source.filter((record) => record.status === 'leave'),
    }
  }, [snapshot])
  const overviewLabels: Record<OverviewKind, string> = { expected: '应出勤人员', attended: '已出勤人员', late: '迟到人员', missing: '缺卡人员', leave: '请假人员' }
  const updateDate = (next: string) => setDate(next > latestDate ? latestDate : next)

  return <div className="employee-work-records module-page">
    <header className="work-records-heading"><div><h1>考勤管理</h1><p>查看已同步的员工上下班打卡记录</p></div>{view === 'daily' && <div className="work-records-heading__actions"><button type="button" title="前一天" onClick={() => updateDate(shiftDate(date, -1))}><ChevronLeft size={16} />前一天</button><label><CalendarDays size={15} /><input aria-label="查询日期" type="date" max={latestDate} value={date} onChange={(event) => updateDate(event.target.value)} /></label><button type="button" title="后一天" disabled={date >= latestDate} onClick={() => updateDate(shiftDate(date, 1))}>后一天<ChevronRight size={16} /></button><button type="button" onClick={() => void load(date)} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={15} />刷新</button></div>}</header>
    <nav className="attendance-tabs" aria-label="考勤功能"><button type="button" className={view === 'daily' ? 'active' : ''} onClick={() => setView('daily')}>每日考勤</button><button type="button" className={view === 'monthly' ? 'active' : ''} onClick={() => setView('monthly')}>月度考勤</button></nav>
    {view === 'daily' && error && <div className="work-records-error"><AlertTriangle size={16} />{error}<button type="button" onClick={() => void load(date)}>重新加载</button></div>}
    {view === 'daily' && (loading && !snapshot ? <div className="work-records-skeleton"><SkeletonCards count={5} /><SkeletonTable columns={6} rows={6} /></div> : snapshot && <>
      <section className="work-records-metrics attendance-overview">
        <button type="button" className="attendance-overview-card" onClick={() => setOverviewOpen('expected')}><i><CalendarDays size={18} /></i><span>应出勤<strong>{overview.expected}</strong><small>人</small></span></button>
        <button type="button" className="attendance-overview-card is-success" onClick={() => setOverviewOpen('attended')}><i><UserCheck size={18} /></i><span>已出勤<strong>{overview.attended}</strong><small>人</small></span></button>
        <button type="button" className={`attendance-overview-card${overview.late ? ' is-warning' : ''}`} onClick={() => setOverviewOpen('late')}><i><Clock3 size={18} /></i><span>迟到<strong>{overview.late}</strong><small>人</small></span></button>
        <button type="button" className={`attendance-overview-card${overview.missing ? ' is-danger' : ''}`} onClick={() => setOverviewOpen('missing')}><i><AlertTriangle size={18} /></i><span>缺卡<strong>{overview.missing}</strong><small>人</small></span></button>
        <button type="button" className="attendance-overview-card is-leave" onClick={() => setOverviewOpen('leave')}><i><CheckCircle2 size={18} /></i><span>请假<strong>{overview.leave}</strong><small>人</small></span></button>
      </section>
      <section className="work-records-panel">
        <div className="work-records-section-title"><div><h2>考勤明细</h2><span>当前筛选 {records.length} 名员工</span></div><div className="work-records-section-actions"><button type="button" className="work-records-export" onClick={() => setAnomaliesOpen(true)}><AlertTriangle size={15} />月度异常</button><button type="button" className="work-records-export" disabled={records.length === 0} onClick={() => void exportAttendance(records, date)}><Download size={15} />导出 Excel</button></div></div>
        <div className="work-records-filters"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名或部门" /></label><select aria-label="部门筛选" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">全部部门</option>{departments.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="状态筛选" value={status} onChange={(event) => { setStatus(event.target.value as '' | AttendanceStatus); setOnlyAnomalies(false) }}>{statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><button type="button" className={`attendance-anomaly-filter${onlyAnomalies ? ' is-active' : ''}`} aria-pressed={onlyAnomalies} onClick={() => { setOnlyAnomalies((current) => !current); setStatus('') }}><AlertTriangle size={14} />仅看异常</button></div>
        <div className="work-attendance-table"><table><thead><tr><th>姓名</th><th>部门</th><th>上班时间</th><th>下班时间</th><th>状态</th><th>地点</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><button className="attendance-employee-link" type="button" onClick={() => setHistoryEmployee({ id: record.externalUserId, name: record.employeeName, month: date.slice(0, 7) })}>{record.employeeName}</button></td><td>{record.departmentName}</td><td>{attendanceClock(record.checkInAt, record.checkInState)}</td><td>{attendanceClock(record.checkOutAt, record.checkOutState)}</td><td><span className={`attendance-status attendance-status--${record.status}`}>{attendanceStatusLabels[record.status]}</span></td><td><span className="work-attendance-location">{record.checkInLocation || record.checkOutLocation || record.location || '—'}</span></td></tr>)}</tbody></table>{records.length === 0 && <p className="work-records-empty">当天没有排班或没有符合筛选条件的考勤记录</p>}</div>
      </section>
    </>)}
    {view === 'monthly' && <AttendanceMonthlyOverview initialMonth={date.slice(0, 7)} />}
    {historyEmployee && <AttendanceHistoryDialog employeeId={historyEmployee.id} employeeName={historyEmployee.name} month={historyEmployee.month} onClose={() => setHistoryEmployee(null)} />}
    {overviewOpen && <AttendanceOverviewDialog title={overviewLabels[overviewOpen]} records={overviewRecords[overviewOpen]} onClose={() => setOverviewOpen(null)} onEmployee={(record) => { setOverviewOpen(null); setHistoryEmployee({ id: record.externalUserId, name: record.employeeName, month: date.slice(0, 7) }) }} />}
    {anomaliesOpen && <AttendanceAnomalyDialog month={date.slice(0, 7)} onClose={() => setAnomaliesOpen(false)} onEmployee={(employee) => { setAnomaliesOpen(false); setHistoryEmployee({ id: employee.employeeId, name: employee.employeeName, month: date.slice(0, 7) }) }} />}
  </div>
}
