import { AlertTriangle, ArrowUpRight, BriefcaseBusiness, CheckSquare, CircleDollarSign, FolderKanban, Gauge, Users } from 'lucide-react'

import type { ModuleProps } from '../../app/types'
import { aiAnalysis, businessSystems, cockpitAlerts, cockpitMetrics, cockpitSnapshot, operatingTrend, type CockpitMetricIcon } from './cockpit-data'
import './management-cockpit.css'

const metricIcons = {
  employees: Users,
  projects: FolderKanban,
  sales: BriefcaseBusiness,
  finance: CircleDollarSign,
  approvals: CheckSquare,
} satisfies Record<CockpitMetricIcon, typeof Users>

const chart = { width: 650, height: 190, left: 14, right: 14, top: 18, bottom: 24 } as const

function trendPoints(values: readonly number[]): string {
  const allValues = operatingTrend.flatMap((point) => [point.sales, point.receipts])
  const min = Math.min(...allValues) - 20
  const max = Math.max(...allValues) + 20
  const usableWidth = chart.width - chart.left - chart.right
  const usableHeight = chart.height - chart.top - chart.bottom

  return values.map((value, index) => {
    const x = chart.left + (usableWidth * index) / (values.length - 1)
    const y = chart.top + usableHeight - ((value - min) / (max - min)) * usableHeight
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

export function ManagementCockpitModule(_props: ModuleProps) {
  const salesPoints = trendPoints(operatingTrend.map((point) => point.sales))
  const receiptPoints = trendPoints(operatingTrend.map((point) => point.receipts))

  return (
    <div className="management-cockpit module-page">
      <section className="cockpit-heading">
        <div>
          <span className="eyebrow"><Gauge size={15} /> 经营概览</span>
          <h1>管理驾驶舱</h1>
          <p>员工、项目、销售、财务与审批数据的一屏总览</p>
        </div>
        <div className="cockpit-snapshot"><span><i /> 数据已汇总</span><small>{cockpitSnapshot.scope} · {cockpitSnapshot.updatedAt}</small></div>
      </section>

      <section className="cockpit-metrics" aria-label="核心经营指标">
        {cockpitMetrics.map((metric) => {
          const Icon = metricIcons[metric.icon]
          return (
            <article className={`cockpit-metric cockpit-metric--${metric.tone}`} key={metric.id}>
              <div><span>{metric.label}</span><i><Icon size={18} /></i></div>
              <strong>{metric.value}</strong>
              <p><em><ArrowUpRight size={12} /> {metric.change}</em><small>{metric.note}</small></p>
            </article>
          )
        })}
      </section>

      <section className="cockpit-main-grid">
        <article className="trend-panel cockpit-panel">
          <header><div><h2>销售与回款趋势</h2><p>近 6 个月，单位：万元</p></div><div className="chart-legend"><span><i /> 销售额</span><span><i /> 回款额</span></div></header>
          <div className="trend-chart">
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="近六个月销售额与回款额趋势图" preserveAspectRatio="none">
              {[0, 1, 2, 3].map((line) => <line x1="0" x2={chart.width} y1={chart.top + line * 44} y2={chart.top + line * 44} key={line} />)}
              <polyline className="trend-line trend-line--sales" points={salesPoints} />
              <polyline className="trend-line trend-line--receipts" points={receiptPoints} />
              {salesPoints.split(' ').map((point) => { const [cx, cy] = point.split(','); return <circle className="trend-dot trend-dot--sales" cx={cx} cy={cy} r="3.5" key={`sales-${point}`} /> })}
              {receiptPoints.split(' ').map((point) => { const [cx, cy] = point.split(','); return <circle className="trend-dot trend-dot--receipts" cx={cx} cy={cy} r="3.5" key={`receipts-${point}`} /> })}
            </svg>
            <div className="trend-labels">{operatingTrend.map((point) => <span key={point.month}>{point.month}</span>)}</div>
          </div>
        </article>

        <article className="alert-panel cockpit-panel">
          <header><div><h2>异常提醒</h2><p>{cockpitAlerts.length} 项需要关注</p></div><span><AlertTriangle size={16} /> 1 项高优先级</span></header>
          <div className="alert-list">
            {cockpitAlerts.map((alert) => <div className={`cockpit-alert cockpit-alert--${alert.level}`} key={alert.id}><i /><div><span>{alert.source}</span><strong>{alert.title}</strong><p>{alert.detail}</p></div></div>)}
          </div>
        </article>
      </section>

      <section className="cockpit-bottom-grid">
        <article className="systems-panel cockpit-panel">
          <header><div><h2>子系统健康度</h2><p>关键业务状态汇总</p></div></header>
          <div>{businessSystems.map((system) => <div key={system.id}><span className={`system-health system-health--${system.health}`}><i /></span><p><strong>{system.label}</strong><small>{system.detail}</small></p><em>{system.status}</em></div>)}</div>
        </article>

        <article className="ai-panel">
          <header><span><BriefcaseBusiness size={20} /></span><div><h2>经营提示</h2><p>基于当前汇总数据生成</p></div><em>参考度 {aiAnalysis.confidence}</em></header>
          <blockquote>{aiAnalysis.summary}</blockquote>
          <div className="ai-recommendations">{aiAnalysis.recommendations.map((recommendation, index) => <p key={recommendation}><span>{index + 1}</span>{recommendation}</p>)}</div>
          <small>此处信息仅供工作参考，重要结论需要人工确认。</small>
        </article>
      </section>
    </div>
  )
}
