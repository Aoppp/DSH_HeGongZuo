import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, MapPin, RefreshCw, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ModuleProps } from '../../../app/types'
import { SkeletonCards, SkeletonTable } from '../../../components/Skeleton'
import { exportAttendance } from './export-attendance'
import { clock, localDate } from '../work-records/work-records-format'
import { readEmployeeAttendance, type AttendanceStatus, type EmployeeAttendanceSnapshot } from '../work-records/work-records-api'
import '../work-records/employee-work-records.css'

const statusLabels: Record<AttendanceStatus, string> = { normal: '正常', late: '迟到', early_leave: '早退', missing: '缺卡' }
const statusOptions: readonly { readonly value: '' | AttendanceStatus; readonly label: string }[] = [{ value: '', label: '全部状态' }, { value: 'normal', label: '正常' }, { value: 'late', label: '迟到' }, { value: 'early_leave', label: '早退' }, { value: 'missing', label: '缺卡' }]

function shiftDate(date: string, days: number): string {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!matched) return date
  const value = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]) + days))
  return value.toISOString().slice(0, 10)
}

export function EmployeeAttendanceModule(_props: ModuleProps) {
  const [date, setDate] = useState(localDate)
  const [snapshot, setSnapshot] = useState<EmployeeAttendanceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState<'' | AttendanceStatus>('')
  const [selected, setSelected] = useState<EmployeeAttendanceSnapshot['attendance']['records'][number] | null>(null)
  const load = useCallback(async (nextDate: string, signal?: AbortSignal) => {
    setLoading(true); setError(null)
    try { setSnapshot(await readEmployeeAttendance(nextDate, signal)) }
    catch (reason) { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(reason instanceof Error ? reason.message : '考勤数据暂时无法读取。') }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [])
  useEffect(() => { const controller = new AbortController(); void load(date, controller.signal); return () => controller.abort() }, [date, load])
  const departments = useMemo(() => [...new Set(snapshot?.attendance.records.map((record) => record.departmentName) ?? [])].sort((left, right) => left.localeCompare(right, 'zh-CN')), [snapshot])
  const records = useMemo(() => (snapshot?.attendance.records ?? []).filter((record) => (!query.trim() || `${record.employeeName} ${record.departmentName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) && (!department || record.departmentName === department) && (!status || record.status === status)).sort((left, right) => Number(right.status !== 'normal') - Number(left.status !== 'normal') || left.employeeName.localeCompare(right.employeeName, 'zh-CN')), [snapshot, query, department, status])
  const updateDate = (next: string) => { setDate(next); setSelected(null) }

  return <div className="employee-work-records module-page">
    <header className="work-records-heading"><div><h1>考勤管理</h1><p>查看已同步的员工上下班打卡记录</p></div><div className="work-records-heading__actions"><button type="button" title="前一天" onClick={() => updateDate(shiftDate(date, -1))}><ChevronLeft size={16} />前一天</button><label><CalendarDays size={15} /><input aria-label="查询日期" type="date" value={date} onChange={(event) => updateDate(event.target.value)} /></label><button type="button" title="后一天" onClick={() => updateDate(shiftDate(date, 1))}>后一天<ChevronRight size={16} /></button><button type="button" onClick={() => void load(date)} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={15} />刷新</button></div></header>
    {error && <div className="work-records-error"><AlertTriangle size={16} />{error}<button type="button" onClick={() => void load(date)}>重新加载</button></div>}
    {loading && !snapshot ? <div className="work-records-skeleton"><SkeletonCards count={4} /><SkeletonTable columns={8} rows={6} /></div> : snapshot && <>
      <section className="work-records-metrics work-records-metrics--compact work-records-metrics--four"><article><i><Clock3 size={18} /></i><span>已记录员工<strong>{snapshot.attendance.expected}</strong><small>人</small></span></article><article><i><CheckCircle2 size={18} /></i><span>正常打卡<strong>{snapshot.attendance.normal}</strong><small>人</small></span></article><article className={snapshot.attendance.exceptions ? 'is-danger' : ''}><i><AlertTriangle size={18} /></i><span>企业微信标记异常<strong>{snapshot.attendance.exceptions}</strong><small>人</small></span></article><article><i><MapPin size={18} /></i><span>打卡记录<strong>{snapshot.attendance.records.reduce((total, record) => total + (record.details?.length ?? Number(Boolean(record.checkInAt)) + Number(Boolean(record.checkOutAt))), 0)}</strong><small>条</small></span></article></section>
      <section className="work-records-panel"><div className="work-records-section-title"><div><h2>打卡记录</h2><span>当前筛选 {records.length} 名员工</span></div><button type="button" className="work-records-export" disabled={records.length === 0} onClick={() => void exportAttendance(records, date)}><Download size={15} />导出 Excel</button></div><div className="work-records-filters"><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名或部门" /></label><select aria-label="部门筛选" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">全部部门</option>{departments.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="状态筛选" value={status} onChange={(event) => setStatus(event.target.value as '' | AttendanceStatus)}>{statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div><div className="work-attendance-table"><table><thead><tr><th>员工</th><th>部门</th><th>计划上班</th><th>实际上班</th><th>计划下班</th><th>实际下班</th><th>企业微信状态</th><th>地点</th><th aria-label="操作" /></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{record.employeeName}</strong></td><td>{record.departmentName}</td><td>{record.scheduledStart}</td><td>{clock(record.checkInAt)}</td><td>{record.scheduledEnd}</td><td>{clock(record.checkOutAt)}</td><td><span className={`attendance-status attendance-status--${record.status}`}>{statusLabels[record.status]}</span></td><td><span className="work-attendance-location">{record.checkInLocation || record.checkOutLocation || record.location || '—'}</span></td><td><button className="work-attendance-detail" type="button" onClick={() => setSelected(record)}>详情</button></td></tr>)}</tbody></table>{records.length === 0 && <p className="work-records-empty">当日没有符合筛选条件的已同步打卡记录</p>}</div></section>
    </>}
    {selected && <div className="attendance-detail" role="dialog" aria-modal="true" aria-label={`${selected.employeeName}的打卡详情`}><button className="attendance-detail__backdrop" type="button" aria-label="关闭" onClick={() => setSelected(null)} /><section><header><div><small>{date}</small><strong>{selected.employeeName}的打卡详情</strong><span>{selected.departmentName}</span></div><button type="button" aria-label="关闭" onClick={() => setSelected(null)}><X size={18} /></button></header><main>{(selected.details ?? []).map((item, index) => <article key={`${item.time}-${index}`}><i className={`attendance-status attendance-status--${item.status}`}>{statusLabels[item.status]}</i><div><strong>{item.type}</strong><span>实际 {clock(item.time)}{item.standardTime !== '—' ? ` · 计划 ${item.standardTime}` : ''}</span>{item.exceptionType && item.exceptionType !== '正常' && <em>{item.exceptionType}</em>}</div><p>{item.location ?? '未记录地点'}</p></article>)}</main></section></div>}
  </div>
}
