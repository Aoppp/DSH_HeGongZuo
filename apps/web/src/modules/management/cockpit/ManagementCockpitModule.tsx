// 管理 / 驾驶舱模块入口。
import { BriefcaseBusiness } from 'lucide-react'

import type { ModuleProps } from '../../../app/types'
import './management-cockpit.css'

const metricSections = ['员工', '项目', '销售', '财务', '审批'] as const
const systemSections = ['员工', '项目', '销售', '财务', '审批'] as const

export function ManagementCockpitModule(_props: ModuleProps) {
  return (
    <div className="management-cockpit module-page">
      <section className="cockpit-heading">
        <div>
          <h1>管理驾驶舱</h1>
          <p>员工、项目、销售、财务与审批数据的一屏总览</p>
        </div>
        <div className="cockpit-snapshot"><span><i /> 待开发</span><small>待开发</small></div>
      </section>

      <section className="cockpit-metrics" aria-label="核心经营指标">
        {metricSections.map((label, index) => (
          <article className={`cockpit-metric cockpit-metric--${['blue', 'violet', 'green', 'cyan', 'amber'][index]}`} key={label}>
            <div><span>{label}</span><i /></div>
            <strong>待开发</strong>
            <p><small>待开发</small></p>
          </article>
        ))}
      </section>

      <section className="cockpit-main-grid">
        <article className="trend-panel cockpit-panel">
          <header><div><h2>销售与回款趋势</h2><p>待开发</p></div></header>
          <div className="cockpit-placeholder">待开发</div>
        </article>

        <article className="alert-panel cockpit-panel">
          <header><div><h2>异常提醒</h2><p>待开发</p></div><span>待开发</span></header>
          <div className="cockpit-placeholder">待开发</div>
        </article>
      </section>

      <section className="cockpit-bottom-grid">
        <article className="systems-panel cockpit-panel">
          <header><div><h2>业务状态</h2><p>待开发</p></div></header>
          <div>{systemSections.map((label) => <div key={label}><p><strong>{label}</strong><small>待开发</small></p><em>待开发</em></div>)}</div>
        </article>

        <article className="ai-panel">
          <header><span><BriefcaseBusiness size={20} /></span><div><h2>经营提示</h2><p>待开发</p></div></header>
          <div className="cockpit-placeholder cockpit-placeholder--inverse">待开发</div>
        </article>
      </section>
    </div>
  )
}
