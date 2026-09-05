import { Download, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { SkeletonCards, SkeletonList } from '../../../components/Skeleton'
import { readDailyReports, type DailyReport } from './daily-reports-api'
import { exportDelayed, exportMissing } from './export-report-analytics'
import {
  readEmployeeReportProfiles, readIndividualReporters, readReportCalendar, readReportQuality, readSubmissionDashboard,
  type CalendarDay, type EmployeeReportProfile, type EmployeeReportProfileScope, type IndividualReporter, type QualityFinding, type SubmissionDashboard, type SubmissionEmployee,
} from './report-analytics-api'

export type AnalyticsView = 'dashboard' | 'calendar' | 'employees' | 'individual' | 'quality'

function Loading() { return <div className="daily-reports__skeleton"><SkeletonCards count={4} /><SkeletonList count={5} /></div> }
function ErrorState({ message }: { readonly message: string }) { return <div className="daily-reports__error"><span>{message}</span></div> }
function stateName(state: SubmissionEmployee['state']) { return state === 'missing' ? '未提交' : state === 'delayed' ? '延后提交' : '已提交' }

function EmployeeDialog({ title, employees, onClose }: { readonly title: string; readonly employees: readonly SubmissionEmployee[]; readonly onClose: () => void }) {
  return <div className="report-dialog" role="dialog" aria-modal="true"><button className="report-dialog__backdrop" onClick={onClose} aria-label="关闭" /><section><header><strong>{title}</strong><button onClick={onClose} aria-label="关闭"><X size={18} /></button></header><div className="report-dialog__list">{employees.length === 0 ? <p>暂无人员</p> : employees.map((employee) => <article key={employee.id}><div><strong>{employee.name}</strong><span>{employee.department}{employee.departmentLevel2 ? ` / ${employee.departmentLevel2}` : ''}</span></div><em className={`report-state report-state--${employee.state}`}>{stateName(employee.state)}</em></article>)}</div></section></div>
}

function ExpectedEmployeesDialog({ employees, excluded, onClose }: { readonly employees: readonly SubmissionEmployee[]; readonly excluded: readonly { readonly name: string; readonly reason: '请假' | '未排班' | '单独汇报' }[]; readonly onClose: () => void }) {
  const leave = excluded.filter((item) => item.reason === '请假')
  const unscheduled = excluded.filter((item) => item.reason === '未排班')
  return <div className="report-dialog" role="dialog" aria-modal="true"><button className="report-dialog__backdrop" onClick={onClose} aria-label="关闭" /><section className="report-expected-dialog"><header><div><strong>当日应提交说明</strong><span>应提交人数已排除请假和未排班人员</span></div><button onClick={onClose} aria-label="关闭"><X size={18} /></button></header><main className="report-expected"><div className="report-expected__summary"><article><span>应提交</span><strong>{employees.length}</strong><small>人</small></article><article><span>请假</span><strong>{leave.length}</strong><small>人</small></article><article><span>未排班</span><strong>{unscheduled.length}</strong><small>人</small></article></div><section><header><div><h3>请假与未排班人员</h3><span>不纳入当日应提交统计</span></div><strong>{leave.length + unscheduled.length} 人</strong></header>{leave.length + unscheduled.length === 0 ? <p className="report-expected__empty">当日没有请假或未排班人员</p> : <div className="report-expected__excluded">{leave.map((item) => <span key={`leave-${item.name}`}><strong>{item.name}</strong><em>请假</em></span>)}{unscheduled.map((item) => <span key={`unscheduled-${item.name}`}><strong>{item.name}</strong><em>未排班</em></span>)}</div>}</section><section><header><div><h3>当日应提交名单</h3><span>以下人员需提交日报</span></div><strong>{employees.length} 人</strong></header>{employees.length === 0 ? <p className="report-expected__empty">当日没有应提交人员</p> : <div className="report-expected__employees">{employees.map((employee) => <article key={employee.id}><strong>{employee.name}</strong><span>{employee.department}{employee.departmentLevel2 ? ` / ${employee.departmentLevel2}` : ''}</span></article>)}</div>}</section></main></section></div>
}

export function DashboardView({ date, revision }: { readonly date: string; readonly revision: number }) {
  const [data, setData] = useState<SubmissionDashboard | null>(null), [error, setError] = useState(''), [selected, setSelected] = useState<{ title: string; employees: readonly SubmissionEmployee[] } | null>(null), [expectedOpen, setExpectedOpen] = useState(false)
  useEffect(() => { const controller = new AbortController(); setData(null); setError(''); void readSubmissionDashboard(date).then(setData).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '看板读取失败。') }); return () => controller.abort() }, [date, revision])
  if (error) return <ErrorState message={error} />
  if (!data) return <Loading />
  const cards = [
    ['当日应提交', data.expected, data.employees], ['已提交', data.submitted, data.employees.filter((item) => item.state !== 'missing')],
    ['未提交', data.missing, data.employees.filter((item) => item.state === 'missing')], ['延后提交', data.delayed, data.employees.filter((item) => item.state === 'delayed')],
  ] as const
  return <><div className="report-dashboard__cards">{cards.map(([label, value, employees]) => <button key={label} onClick={() => label === '当日应提交' ? setExpectedOpen(true) : setSelected({ title: `${label}人员`, employees })}><span>{label}</span><strong>{value}</strong><small>{label === '当日应提交' ? '查看名单与人数说明' : '点击查看人员'}</small></button>)}</div><div className="report-dashboard__actions"><button onClick={() => void exportMissing(data)}><Download size={15} />导出未提交名单</button><button onClick={() => void exportDelayed(data)}><Download size={15} />导出延后提交名单</button></div><section className="report-card"><header><h2>部门完成情况</h2><span>{data.date}</span></header><div className="report-departments">{data.departments.map((department) => { const rate = department.expected ? Math.round(department.submitted / department.expected * 100) : 0; return <button key={department.name} onClick={() => setSelected({ title: `${department.name}提交情况`, employees: data.employees.filter((item) => item.department === department.name) })}><div><strong>{department.name}</strong><span>{department.submitted}/{department.expected} 人</span></div><i><b style={{ width: `${rate}%` }} /></i><small>完成 {rate}%・未提交 {department.missing}・延后 {department.delayed}</small></button> })}</div></section>{selected && <EmployeeDialog {...selected} onClose={() => setSelected(null)} />}{expectedOpen && <ExpectedEmployeesDialog employees={data.employees} excluded={data.excluded} onClose={() => setExpectedOpen(false)} />}</>
}

export function CalendarView({ month, onSelectDate, revision }: { readonly month: string; readonly onSelectDate: (date: string) => void; readonly revision: number }) {
  const [days, setDays] = useState<readonly CalendarDay[] | null>(null), [error, setError] = useState('')
  useEffect(() => { setDays(null); setError(''); void readReportCalendar(month).then(setDays).catch((reason) => setError(reason instanceof Error ? reason.message : '日历读取失败。')) }, [month, revision])
  if (error) return <ErrorState message={error} />; if (!days) return <Loading />
  const first = new Date(`${month}-01T00:00:00`).getDay(); const cells: (CalendarDay | null)[] = [...Array.from({ length: first }, () => null), ...days]
  return <section className="report-card"><header><h2>{month.replace('-', '年')}月提交日历</h2><div className="report-calendar__legend"><span className="complete">全部提交</span><span className="delayed">存在延后</span><span className="missing">存在未提交</span></div></header><div className="report-calendar"><div className="report-calendar__week">{['日','一','二','三','四','五','六'].map((day) => <span key={day}>周{day}</span>)}</div><div className="report-calendar__grid">{cells.map((day, index) => day ? <button key={day.date} className={`report-calendar__day report-calendar__day--${day.status}`} onClick={() => onSelectDate(day.date)}><strong>{Number(day.date.slice(-2))}</strong><span>{day.submitted}/{day.expected} 人</span>{day.delayed > 0 && <small>延后 {day.delayed}</small>}</button> : <i key={`blank-${index}`} />)}</div></div></section>
}

export function EmployeeHistoryDialog({ employeeId, employeeName, onClose }: { readonly employeeId: string; readonly employeeName: string; readonly onClose: () => void }) {
  const [history, setHistory] = useState<readonly DailyReport[]>([]), [historyLoading, setHistoryLoading] = useState(true)
  useEffect(() => { let active = true; setHistoryLoading(true); setHistory([]); void (async () => {
    try {
      const filters = { startDate: '', endDate: '', department: '', employee: employeeId, keyword: '' }
      const first = await readDailyReports(filters, 1, 100)
      const reports = [...first.reports]
      for (let page = 2; page <= first.totalPages; page += 1) reports.push(...(await readDailyReports(filters, page, 100)).reports)
      if (active) setHistory(reports)
    } finally { if (active) setHistoryLoading(false) }
  })(); return () => { active = false } }, [employeeId])
  return <div className="report-dialog" role="dialog" aria-modal="true"><button className="report-dialog__backdrop" onClick={onClose} aria-label="关闭" /><section className="report-dialog__wide"><header><div><strong>{employeeName}的日报档案</strong><span>全部历史日报</span></div><button onClick={onClose} aria-label="关闭"><X size={18} /></button></header><main><h3>历史日报</h3>{historyLoading ? <Loading /> : history.length ? <div className="report-history">{history.map((report) => <article key={report.record_id}><strong>{report.report_date}</strong><p>{report.today_summary || '未填写工作总结'}</p><span>{new Date(report.submit_time).toLocaleString('zh-CN')}</span></article>)}</div> : <div className="daily-reports__empty">暂无历史日报</div>}</main></section></div>
}

export function EmployeeArchiveView({ revision, scope = 'active' }: { readonly revision: number; readonly scope?: EmployeeReportProfileScope }) {
  const [profiles, setProfiles] = useState<readonly EmployeeReportProfile[] | null>(null), [error, setError] = useState(''), [query, setQuery] = useState(''), [selected, setSelected] = useState<EmployeeReportProfile | null>(null)
  useEffect(() => { setProfiles(null); setError(''); void readEmployeeReportProfiles(scope).then(setProfiles).catch((reason) => setError(reason instanceof Error ? reason.message : '员工日报档案读取失败。')) }, [revision, scope])
  const visibleProfiles = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('zh-CN')
    return keyword ? profiles?.filter((profile) => profile.name.toLocaleLowerCase('zh-CN').includes(keyword)) ?? [] : profiles ?? []
  }, [profiles, query])
  if (error) return <ErrorState message={error} />
  if (!profiles) return <Loading />
  return <>
    <section className="report-card">
      <header><div><h2>{scope === 'departed' ? '离职归档' : '员工日报档案'}</h2><span>{scope === 'departed' ? '仅保留存在日报记录的离职员工' : '在职员工的全部历史日报'}</span></div><div className="report-profile-tools"><label className="report-profile-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按姓名搜索" /></label></div></header>
      {visibleProfiles.length ? <div className="report-profile-list">{visibleProfiles.map((profile) => <button key={profile.id} type="button" onClick={() => setSelected(profile)}><strong>{profile.name}</strong><span>{profile.department}{profile.departmentLevel2 ? ` / ${profile.departmentLevel2}` : ''}</span></button>)}</div> : <div className="daily-reports__empty">没有找到匹配的员工</div>}
    </section>
    {selected && <EmployeeHistoryDialog employeeId={selected.id} employeeName={selected.name} onClose={() => setSelected(null)} />}
  </>
}

export function IndividualReportersView({ revision }: { readonly revision: number }) {
  const [reporters, setReporters] = useState<readonly IndividualReporter[] | null>(null)
  useEffect(() => { setReporters(null); void readIndividualReporters().then(setReporters).catch(() => setReporters([])) }, [revision])
  if (!reporters) return <Loading />
  return <section className="report-card"><header><div><h2>单独汇报</h2><span>以下人员不纳入每日应提交统计</span></div></header><div className="report-profile-grid">{reporters.map((reporter) => <article key={reporter.name}><strong>{reporter.name}</strong><span>{reporter.linked ? '员工档案已关联' : '暂未建立员工档案'}</span></article>)}</div></section>
}

const qualityNames: Record<QualityFinding['type'], string> = { duplicate: '重复日报', future_report_date: '日期异常', missing_identity: '人员或部门缺失', empty_content: '内容为空', unmatched_employee: '档案未关联' }
export function QualityView({ startDate, endDate, revision }: { readonly startDate: string; readonly endDate: string; readonly revision: number }) {
  const [findings, setFindings] = useState<readonly QualityFinding[] | null>(null), [error, setError] = useState(''), [type, setType] = useState<QualityFinding['type'] | 'all'>('all')
  useEffect(() => { setFindings(null); setError(''); void readReportQuality(startDate, endDate).then(setFindings).catch((reason) => setError(reason instanceof Error ? reason.message : '数据检查失败。')) }, [startDate, endDate, revision])
  const visible = useMemo(() => findings?.filter((item) => type === 'all' || item.type === type) ?? [], [findings, type])
  if (error) return <ErrorState message={error} />; if (!findings) return <Loading />
  return <section className="report-card"><header><h2>数据检查</h2><label>异常类型<select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="all">全部（{findings.length}）</option>{Object.entries(qualityNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></header><div className="report-quality-list">{visible.length ? visible.map((finding, index) => <article key={`${finding.type}-${finding.recordId}-${index}`}><em>{qualityNames[finding.type]}</em><div><strong>{finding.employee}</strong><span>{finding.date}・{finding.department || '部门未记录'}</span></div><p>{finding.detail}</p></article>) : <div className="daily-reports__empty">当前范围未发现异常</div>}</div></section>
}
