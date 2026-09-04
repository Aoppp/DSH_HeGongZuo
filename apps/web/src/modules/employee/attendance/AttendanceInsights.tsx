import { AlertTriangle, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { SkeletonList, SkeletonTable } from '../../../components/Skeleton'
import { clock } from '../work-records/work-records-format'
import {
  readAttendanceAnomalies,
  readEmployeeAttendanceHistory,
  type AttendanceAnomalyRanking,
  type AttendanceRecord,
  type AttendanceStatus,
} from '../work-records/work-records-api'

export const attendanceStatusLabels: Record<AttendanceStatus, string> = {
  normal: '正常', late: '迟到', late_severe: '迟到', early_leave: '早退', missing: '缺卡', leave: '请假',
}

export function attendanceClock(value: string | null, state?: 'recorded' | 'leave' | 'missing'): string {
  return state === 'leave' ? '请假' : clock(value)
}

export function AttendanceHistoryDialog({ employeeId, employeeName, onClose }: { readonly employeeId: string; readonly employeeName: string; readonly onClose: () => void }) {
  const [records, setRecords] = useState<readonly AttendanceRecord[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { const controller = new AbortController(); void readEmployeeAttendanceHistory(employeeId, controller.signal).then(({ records: items }) => setRecords(items)).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '考勤记录加载失败。') }); return () => controller.abort() }, [employeeId])
  return <div className="attendance-detail attendance-history" role="dialog" aria-modal="true"><button className="attendance-detail__backdrop" type="button" aria-label="关闭" onClick={onClose} /><section><header><div><small>全部已同步记录</small><strong>{employeeName}的出勤记录</strong></div><button type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button></header>{error ? <p className="work-records-empty">{error}</p> : !records ? <SkeletonTable columns={5} rows={7} /> : <div className="work-attendance-table"><table><thead><tr><th>日期</th><th>上班</th><th>下班</th><th>状态</th><th>地点</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td>{record.date}</td><td>{attendanceClock(record.checkInAt, record.checkInState)}</td><td>{attendanceClock(record.checkOutAt, record.checkOutState)}</td><td><span className={`attendance-status attendance-status--${record.status}`}>{attendanceStatusLabels[record.status]}</span></td><td>{record.checkInLocation || record.checkOutLocation || record.location || '—'}</td></tr>)}</tbody></table>{records.length === 0 && <p className="work-records-empty">暂无已同步的出勤记录</p>}</div>}</section></div>
}

export function AttendanceAnomalyDialog({ month, onEmployee, onClose }: { readonly month: string; readonly onEmployee: (employee: AttendanceAnomalyRanking) => void; readonly onClose: () => void }) {
  const [rankings, setRankings] = useState<readonly AttendanceAnomalyRanking[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { const controller = new AbortController(); void readAttendanceAnomalies(month, controller.signal).then((result) => setRankings(result.rankings)).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '异常统计加载失败。') }); return () => controller.abort() }, [month])
  return <div className="attendance-detail attendance-anomalies" role="dialog" aria-modal="true"><button className="attendance-detail__backdrop" type="button" aria-label="关闭" onClick={onClose} /><section><header><div><small>{month}</small><strong>打卡异常</strong><span>按当月迟到次数从高到低排列</span></div><button type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button></header>{error ? <p className="work-records-empty">{error}</p> : !rankings ? <div className="attendance-insights-loading"><SkeletonList count={6} /></div> : <main className="attendance-ranking">{rankings.map((item, index) => <button key={item.employeeId} type="button" onClick={() => onEmployee(item)}><b>{index + 1}</b><div><strong>{item.employeeName}</strong><span>{item.departmentName}</span></div><dl><div><dt>迟到</dt><dd>{item.lateCount}</dd></div><div><dt>超过15分钟</dt><dd>{item.severeLateCount}</dd></div><div><dt>缺卡</dt><dd>{item.missingCount}</dd></div><div><dt>早退</dt><dd>{item.earlyLeaveCount}</dd></div></dl></button>)}{rankings.length === 0 && <p className="work-records-empty"><AlertTriangle size={16} />当月没有打卡异常</p>}</main>}</section></div>
}
