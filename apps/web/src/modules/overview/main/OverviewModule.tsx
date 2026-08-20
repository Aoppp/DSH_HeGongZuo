// 概览模块入口。
import { ArrowRight, CheckCircle2, Code2, Database, ShieldCheck, Users } from 'lucide-react'

import type { ModuleProps } from '../../../app/types'
import './overview.css'

const ownerFacts = [
  { label: '员工查询', value: '已开放', detail: '查询员工与组织信息', icon: Users },
  { label: '员工数据', value: '已接入', detail: '查看和维护员工信息', icon: Users },
  { label: '访问范围', value: '当前账号', detail: '按职位展示可用内容', icon: ShieldCheck },
] as const

const developerFacts = [
  { label: '查询服务版本', value: 'rc.6', detail: '项目内精确锁定', icon: Code2 },
  { label: '查询能力', value: '3', detail: '查询、详情、组织成员', icon: Users },
  { label: '待开发', value: '待开发', detail: '待开发', icon: Database },
] as const

export function OverviewModule({ user, onNavigate }: ModuleProps) {
  const isBoss = user.position === 'CEO'
  const facts = isBoss ? ownerFacts : developerFacts
  const primaryModule = isBoss ? 'management-cockpit' : 'employee-agent'

  return (
    <div className="overview module-page">
      <section className="overview__hero">
        <div>
          <h1>{isBoss ? '你好，陶总' : `你好，${user.displayName}`}</h1>
          <p>{isBoss ? '通过管理驾驶舱查看公司整体运行情况，或查询员工与组织信息。' : '在这里验证平台模块与员工查询服务。'}</p>
        </div>
        <button type="button" className="primary-action" onClick={() => onNavigate(primaryModule)}>
          {isBoss ? '打开管理驾驶舱' : '打开员工查询'} <ArrowRight size={18} />
        </button>
      </section>

      <section className="fact-grid" aria-label="当前状态">
        {facts.map((fact) => {
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
          <p>当前仅开放管理员和开发者账号。其他职位的账号工作台将逐步开放。</p>
        </div>
      </section>
    </div>
  )
}
