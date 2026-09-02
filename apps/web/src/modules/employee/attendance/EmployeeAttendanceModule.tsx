import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { ModuleProps } from '../../../app/types'
import { SkeletonCards, SkeletonTable } from '../../../components/Skeleton'
import { clock, localDate } from '../work-records/work-records-format'
import { readEmployeeAttendance, type AttendanceStatus, type EmployeeAttendanceSnapshot } from '../work-records/work-records-api'
import '../work-records/employee-work-records.css'

const statusLabels: Record<AttendanceStatus, string> = { normal: '正常', late: '迟到', early_leave: '早退', missing: '缺卡' }

export function EmployeeAttendanceModule(_props: ModuleProps) {
  const [date, setDate] = useState(localDate)
  const [snapshot, setSnapshot] = useState<EmployeeAttendanceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async (nextDate: string, signal?: AbortSignal) => {
    setLoading(true); setError(null)
    try { setSnapshot(await readEmployeeAttendance(nextDate, signal)) }
    catch (reason) { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(reason instanceof Error ? reason.message : '考勤数据暂时无法读取。') }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [])
  useEffect(() => { const controller = new AbortController(); void load(date, controller.signal); return () => controller.abort() }, [date, load])

  return <div className="employee-work-records module-page">
    <header className="work-records-heading"><div><h1>考勤管理</h1><p>查看员工上下班打卡与异常情况</p></div><div className="work-records-heading__actions">{snapshot?.connectionStatus === 'demo' && <span className="work-records-demo">演示数据</span>}<label><CalendarDays size={15} /><input aria-label="查询日期" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><button type="button" onClick={() => void load(date)} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={15} />刷新</button></div></header>
    <div className="work-records-connection"><span><i />{snapshot?.connectionStatus === 'connected' ? '企业微信打卡已连接' : '企业微信打卡尚未连接，当前展示演示数据'}</span><small>正式接入后将自动显示企业微信中的实际打卡记录。</small></div>
    {error && <div className="work-records-error"><AlertTriangle size={16} />{error}<button type="button" onClick={() => void load(date)}>重新加载</button></div>}
    {loading && !snapshot ? <div className="work-records-skeleton"><SkeletonCards count={3} /><SkeletonTable columns={7} rows={6} /></div> : snapshot && <>
      <section className="work-records-metrics work-records-metrics--compact"><article><i><Clock3 size={18} /></i><span>应出勤<strong>{snapshot.attendance.expected}</strong><small>人</small></span></article><article><i><CheckCircle2 size={18} /></i><span>正常出勤<strong>{snapshot.attendance.normal}</strong><small>人</small></span></article><article className={snapshot.attendance.exceptions ? 'is-danger' : ''}><i><AlertTriangle size={18} /></i><span>考勤异常<strong>{snapshot.attendance.exceptions}</strong><small>人</small></span></article></section>
      <section className="work-records-panel"><div className="work-records-section-title"><h2>打卡记录</h2><span>{snapshot.attendance.records.length} 条</span></div><div className="work-attendance-table"><table><thead><tr><th>员工</th><th>部门</th><th>班次</th><th>上班打卡</th><th>下班打卡</th><th>状态</th><th>地点</th></tr></thead><tbody>{snapshot.attendance.records.map((record) => <tr key={record.id}><td><strong>{record.employeeName}</strong></td><td>{record.departmentName}</td><td>{record.scheduledStart}—{record.scheduledEnd}</td><td>{clock(record.checkInAt)}</td><td>{clock(record.checkOutAt)}</td><td><span className={`attendance-status attendance-status--${record.status}`}>{statusLabels[record.status]}</span></td><td>{record.location ?? '—'}</td></tr>)}</tbody></table>{snapshot.attendance.records.length === 0 && <p className="work-records-empty">当日暂无打卡记录</p>}</div></section>
    </>}
  </div>
}
