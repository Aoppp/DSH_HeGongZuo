// 管理 / 驾驶舱模块入口。
import { Activity, Bell, ChevronRight, CircleUserRound, Clock3, FileSpreadsheet, LoaderCircle, RefreshCw, Search, Settings, UserMinus, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ModuleId, ModuleProps } from '../../../app/types'
import { readCockpitSnapshot, type CockpitSnapshot } from './cockpit-api'
import './management-cockpit.css'

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function contractTime(daysLeft: number): string {
  if (daysLeft < 0) return `已逾期 ${Math.abs(daysLeft)} 天`
  if (daysLeft === 0) return '今日到期'
  return `${daysLeft} 天后到期`
}

export function ManagementCockpitModule({ user, onNavigate }: ModuleProps) {
  const [snapshot, setSnapshot] = useState<CockpitSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try { setSnapshot(await readCockpitSnapshot(signal)) }
    catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : '无法读取管理驾驶舱。')
    } finally { if (!signal?.aborted) setLoading(false) }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    const timer = window.setInterval(() => void load(), 5 * 60_000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [load])

  const concerns = useMemo(() => {
    if (!snapshot) return []
    const items: string[] = []
    if (snapshot.contracts.expired > 0) items.push(`${snapshot.contracts.expired} 份员工合同已经到期，请优先跟进。`)
    if (snapshot.contracts.dueToday > 0) items.push(`${snapshot.contracts.dueToday} 份员工合同今日到期。`)
    if (snapshot.contracts.upcoming > 0) items.push(`未来 7 天还有 ${snapshot.contracts.upcoming} 份员工合同到期。`)
    if (snapshot.accounts.attention > 0) items.push(`${snapshot.accounts.attention} 个账号正在初始化或初始化失败。`)
    if (snapshot.platform.agentRuntimes.unavailable.length > 0) items.push(`${snapshot.platform.agentRuntimes.unavailable.length} 个功能运行空间当前不可用。`)
    if (items.length === 0) items.push('当前没有需要立即处理的合同、账号或服务异常。')
    return items
  }, [snapshot])

  if (loading && !snapshot) {
    return <div className="management-cockpit module-page"><div className="cockpit-loading"><LoaderCircle className="spin" size={22} /> 正在汇总管理数据…</div></div>
  }

  if (!snapshot) {
    return <div className="management-cockpit module-page"><div className="cockpit-load-error"><strong>管理数据暂时无法读取</strong><span>{error}</span><button type="button" onClick={() => void load()}>重新加载</button></div></div>
  }

  const maximumDepartment = Math.max(1, ...snapshot.employees.departments.map((department) => department.count))
  const modulesEnabled = snapshot.platform.modules.filter((module) => module.enabled).length
  const metrics = [
    { label: '在职员工', value: snapshot.employees.employed, detail: `试用期 ${snapshot.employees.probation} · 休假 ${snapshot.employees.onLeave}`, icon: Users, tone: 'green' },
    { label: '离职员工', value: snapshot.employees.departed, detail: '历史离职档案', icon: UserMinus, tone: 'slate' },
    { label: '合同提醒', value: snapshot.contracts.alerts.length, detail: `逾期 ${snapshot.contracts.expired} · 今日 ${snapshot.contracts.dueToday}`, icon: Bell, tone: snapshot.contracts.expired > 0 ? 'danger' : 'amber' },
    { label: '平台账号', value: snapshot.accounts.total, detail: `正常 ${snapshot.accounts.active} · 需关注 ${snapshot.accounts.attention}`, icon: CircleUserRound, tone: 'blue' },
    { label: '运行空间', value: `${snapshot.platform.agentRuntimes.available}/${snapshot.platform.agentRuntimes.expected}`, detail: `运行 ${snapshot.platform.agentRuntimes.running} · 待命 ${snapshot.platform.agentRuntimes.idle}`, icon: Activity, tone: snapshot.platform.agentRuntimes.unavailable.length > 0 ? 'danger' : 'violet' },
  ] as const

  const quickActions = [
    { id: 'employee-data', label: '员工档案', detail: '查看和维护员工信息', icon: FileSpreadsheet, permission: 'employee-data' },
    { id: 'employee-agent', label: '员工查询', detail: '查询人员与组织信息', icon: Search, permission: 'employee-query' },
    { id: 'work-assistant', label: '工作文件', detail: '处理个人工作区文件', icon: Clock3, permission: null },
    { id: 'developer-console', label: '平台管理', detail: '账号、权限与服务状态', icon: Settings, permission: 'platform-administration' },
  ].filter((action) => !action.permission || user.permissions.includes(action.permission)) as readonly { id: ModuleId; label: string; detail: string; icon: typeof Users }[]

  return (
    <div className="management-cockpit module-page">
      <section className="cockpit-heading">
        <div><h1>管理驾驶舱</h1><p>员工、账号和平台运行情况</p></div>
        <div className="cockpit-heading__status"><span><i /> 数据已更新</span><small>{formatTime(snapshot.generatedAt)}</small><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={14} />刷新</button></div>
      </section>

      {error && <div className="cockpit-inline-error">{error}</div>}

      <section className="cockpit-metrics" aria-label="核心管理指标">
        {metrics.map(({ label, value, detail, icon: Icon, tone }) => <article className={`cockpit-metric cockpit-metric--${tone}`} key={label}><div><span>{label}</span><i><Icon size={16} /></i></div><strong>{value}</strong><p>{detail}</p></article>)}
      </section>

      <section className="cockpit-main-grid">
        <article className="cockpit-panel cockpit-departments">
          <header><div><h2>在职员工部门分布</h2><p>按一级部门统计</p></div><span>{snapshot.employees.departments.length} 个部门</span></header>
          <div className="cockpit-department-list">
            {snapshot.employees.departments.length === 0 ? <p className="cockpit-empty">暂无在职员工数据</p> : snapshot.employees.departments.map((department) => <div key={department.name}><p><strong>{department.name}</strong><span>{department.count} 人</span></p><i><b style={{ width: `${department.count / maximumDepartment * 100}%` }} /></i></div>)}
          </div>
        </article>

        <article className="cockpit-panel cockpit-alerts">
          <header><div><h2>合同到期提醒</h2><p>已逾期7天至未来7天</p></div>{snapshot.contracts.alerts.length > 0 && <span className="is-warning">{snapshot.contracts.alerts.length} 项</span>}</header>
          <div className="cockpit-alert-list">
            {snapshot.contracts.alerts.length === 0 ? <p className="cockpit-empty">当前没有临近到期合同</p> : snapshot.contracts.alerts.slice(0, 6).map((alert) => <div className={alert.daysLeft <= 0 ? 'is-urgent' : ''} key={alert.employeeId}><i /><p><strong>{alert.displayName}</strong><small>{alert.departmentName} · {alert.jobTitle}</small></p><span><time>{alert.contractEndDate}</time><em>{contractTime(alert.daysLeft)}</em></span></div>)}
          </div>
          {user.permissions.includes('employee-data') && <button className="cockpit-panel-link" type="button" onClick={() => onNavigate('employee-data')}>查看员工档案 <ChevronRight size={14} /></button>}
        </article>
      </section>

      <section className="cockpit-bottom-grid">
        <article className="cockpit-panel cockpit-platform">
          <header><div><h2>平台功能状态</h2><p>{modulesEnabled}/{snapshot.platform.modules.length} 个业务模块已启用</p></div><span className={snapshot.platform.agentRuntimes.unavailable.length ? 'is-warning' : 'is-healthy'}>{snapshot.platform.agentRuntimes.unavailable.length ? '需要关注' : '运行正常'}</span></header>
          <div className="cockpit-module-list">{snapshot.platform.modules.map((module) => <div key={module.id}><i className={module.enabled ? 'is-enabled' : ''} /><strong>{module.label}</strong><span>{module.enabled ? '已启用' : '已停用'}</span></div>)}</div>
        </article>

        <article className="cockpit-panel cockpit-activity">
          <header><div><h2>近期操作</h2><p>员工档案与平台变更记录</p></div></header>
          <div className="cockpit-activity-list">{snapshot.recentActivity.length === 0 ? <p className="cockpit-empty">暂无操作记录</p> : snapshot.recentActivity.map((activity) => <div key={activity.id}><p><strong>{activity.action}</strong><small>{activity.targetType} · {activity.targetId}</small></p><span>{activity.actorName ?? '已删除账号'}<time>{formatTime(activity.createdAt)}</time></span></div>)}</div>
        </article>
      </section>

      <section className="cockpit-actions-grid">
        <article className="cockpit-attention"><div><h2>管理关注</h2><p>根据当前已有业务数据汇总</p></div><ul>{concerns.map((concern) => <li key={concern}>{concern}</li>)}</ul></article>
        <article className="cockpit-quick-actions"><header><h2>常用功能</h2><p>快速进入现有业务功能</p></header><div>{quickActions.map(({ id, label, detail, icon: Icon }) => <button type="button" key={id} onClick={() => onNavigate(id)}><Icon size={16} /><span><strong>{label}</strong><small>{detail}</small></span><ChevronRight size={14} /></button>)}</div></article>
      </section>
    </div>
  )
}
