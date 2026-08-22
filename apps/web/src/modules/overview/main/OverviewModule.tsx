// 概览模块入口。
import { ArrowRight, CheckCircle2, ShieldCheck, Users } from 'lucide-react'

import type { ModuleProps } from '../../../app/types'
import './overview.css'

const overviewFacts = [
  { label: '员工查询', value: '已开放', detail: '查询员工与组织信息', icon: Users },
  { label: '员工数据', value: '已接入', detail: '查看和维护员工信息', icon: Users },
  { label: '访问范围', value: '当前账号', detail: '按职位展示可用内容', icon: ShieldCheck },
] as const

export function OverviewModule({ user, onNavigate }: ModuleProps) {
  const canUseCockpit = user.position === 'CEO' && user.permissions.includes('management-cockpit')
  const primaryModule = canUseCockpit ? 'management-cockpit' : user.permissions.includes('employee-query') ? 'employee-agent' : user.permissions.includes('employee-data') ? 'employee-data' : 'overview'

  return (
    <div className="overview module-page">
      <section className="overview__hero">
        <div>
          <h1>你好，{user.displayName}</h1>
          <p>已按你的账号功能权限展示可用工作入口。</p>
        </div>
        <button type="button" className="primary-action" onClick={() => onNavigate(primaryModule)}>
          {canUseCockpit ? '打开管理驾驶舱' : '打开工作入口'} <ArrowRight size={18} />
        </button>
      </section>

      <section className="fact-grid" aria-label="当前状态">
        {overviewFacts.map((fact) => {
          const Icon = fact.icon
          return (
            <article className="fact-card" key={fact.label}>
              <span><Icon size={20} /></span>
              <div><p>{fact.label}</p><strong>{fact.value}</strong><small>{fact.detail}</small></div>
            </article>
          )
        })}
      </section>

      <section className="focus-card">
        <div className="focus-card__icon"><Users size={26} /></div>
        <div className="focus-card__content">
          <span className="status-label"><i /> 已集成</span>
          <h2>员工查询</h2>
          <p>直接在平台内查询员工、部门与汇报关系。</p>
          <div>
            <span><CheckCircle2 size={15} /> 员工信息查询</span>
            <span><CheckCircle2 size={15} /> 组织关系查询</span>
            <span><CheckCircle2 size={15} /> 平台原生界面</span>
          </div>
        </div>
        <button type="button" className="secondary-action" onClick={() => onNavigate('employee-agent')}>立即使用 <ArrowRight size={16} /></button>
      </section>

      <section className="scope-note">
        <ShieldCheck size={19} />
        <div>
          <strong>当前开放范围</strong>
          <p>账号可独立分配员工、财务、项目、驾驶舱和平台管理等功能权限。</p>
        </div>
      </section>
    </div>
  )
}
