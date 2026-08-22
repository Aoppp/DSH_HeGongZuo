// 员工管理 / 顶部合同到期站内提醒。
import { Bell, ChevronRight, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { AuthenticatedUser } from '../../../app/types'
import { readContractExpiryAlerts, type ContractExpiryAlert } from './contract-alerts-api'
import './contract-alerts.css'

interface ContractExpiryNoticeProps {
  readonly user: AuthenticatedUser
  readonly onNavigateToEmployeeData: () => void
}

function daysLabel(daysLeft: number): string {
  return daysLeft < 0 ? `已逾期 ${-daysLeft} 天` : daysLeft === 0 ? '今日到期' : `剩余 ${daysLeft} 天`
}

export function ContractExpiryNotice({ user, onNavigateToEmployeeData }: ContractExpiryNoticeProps) {
  const [alerts, setAlerts] = useState<readonly ContractExpiryAlert[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!user.permissions.includes('employee-data')) return
    let active = true
    const load = () => { void readContractExpiryAlerts().then((items) => { if (active) setAlerts(items) }).catch(() => { if (active) setAlerts([]) }) }
    load()
    const timer = window.setInterval(load, 5 * 60 * 1000)
    return () => { active = false; window.clearInterval(timer) }
  }, [user.permissions])

  if (!user.permissions.includes('employee-data') || alerts.length === 0) return null

  return <div className="contract-expiry-notice">
    <button className="icon-button contract-expiry-notice__trigger" type="button" onClick={() => setOpen((value) => !value)} title={`合同到期提醒（${alerts.length}）`} aria-label={`合同到期提醒，共 ${alerts.length} 项`} aria-expanded={open}>
      <Bell size={18} />
      <span>{alerts.length > 99 ? '99+' : alerts.length}</span>
    </button>
    {open && <section className="contract-expiry-notice__panel" aria-label="合同到期提醒">
      <header><div><strong>合同到期提醒</strong><small>已逾期 7 天至未来 7 天内的在职员工</small></div><button type="button" onClick={() => setOpen(false)} aria-label="关闭合同到期提醒"><X size={16} /></button></header>
      <ul>{alerts.map((alert) => <li key={alert.employeeId}><div><strong>{alert.displayName}</strong><small>{alert.departmentName} · {alert.jobTitle}</small></div><div><time dateTime={alert.contractEndDate}>{alert.contractEndDate}</time><span className={alert.daysLeft <= 1 ? 'is-urgent' : ''}>{daysLabel(alert.daysLeft)}</span></div></li>)}</ul>
      <button className="contract-expiry-notice__all" type="button" onClick={() => { setOpen(false); onNavigateToEmployeeData() }}>查看员工档案 <ChevronRight size={15} /></button>
    </section>}
  </div>
}
