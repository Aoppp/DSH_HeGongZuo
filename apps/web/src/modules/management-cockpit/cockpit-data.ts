export type CockpitMetricIcon = 'employees' | 'projects' | 'sales' | 'finance' | 'approvals'
export type MetricTone = 'blue' | 'violet' | 'green' | 'cyan' | 'amber'
export type AlertLevel = 'high' | 'medium' | 'low'

export interface CockpitMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly change: string
  readonly note: string
  readonly icon: CockpitMetricIcon
  readonly tone: MetricTone
}

export interface TrendPoint {
  readonly month: string
  readonly sales: number
  readonly receipts: number
}

export interface BusinessSystemSummary {
  readonly id: string
  readonly label: string
  readonly status: string
  readonly detail: string
  readonly health: 'healthy' | 'attention'
}

export interface CockpitAlert {
  readonly id: string
  readonly level: AlertLevel
  readonly source: string
  readonly title: string
  readonly detail: string
}

export const cockpitSnapshot = {
  updatedAt: '2026-08-17 10:00',
  scope: '本地模拟数据',
} as const

export const cockpitMetrics: readonly CockpitMetric[] = [
  { id: 'employees', label: '在职员工', value: '128', change: '本月 +4', note: '试用期 9 人', icon: 'employees', tone: 'blue' },
  { id: 'projects', label: '进行中项目', value: '18', change: '按期率 83%', note: '3 个需关注', icon: 'projects', tone: 'violet' },
  { id: 'sales', label: '本月销售额', value: '328.6 万', change: '同比 +12.4%', note: '目标达成 76%', icon: 'sales', tone: 'green' },
  { id: 'finance', label: '可用资金', value: '862 万', change: '较上月 +5.8%', note: '预估可支撑 7.2 月', icon: 'finance', tone: 'cyan' },
  { id: 'approvals', label: '待老板审批', value: '7', change: '2 项紧急', note: '最长等待 18 小时', icon: 'approvals', tone: 'amber' },
]

export const operatingTrend: readonly TrendPoint[] = [
  { month: '3 月', sales: 238, receipts: 221 },
  { month: '4 月', sales: 265, receipts: 248 },
  { month: '5 月', sales: 257, receipts: 244 },
  { month: '6 月', sales: 301, receipts: 272 },
  { month: '7 月', sales: 315, receipts: 281 },
  { month: '8 月', sales: 329, receipts: 268 },
]

export const businessSystems: readonly BusinessSystemSummary[] = [
  { id: 'employee', label: '员工', status: '稳定', detail: '离职率 1.6%', health: 'healthy' },
  { id: 'project', label: '项目', status: '需关注', detail: '3 个进度偏离', health: 'attention' },
  { id: 'sales', label: '销售', status: '增长', detail: '同比 +12.4%', health: 'healthy' },
  { id: 'finance', label: '财务', status: '健康', detail: '现金流为正', health: 'healthy' },
  { id: 'approval', label: '审批', status: '待处理', detail: '2 项已超 12 小时', health: 'attention' },
]

export const cockpitAlerts: readonly CockpitAlert[] = [
  { id: 'receivable', level: 'high', source: '财务', title: '逾期应收款 46.8 万', detail: '2 个客户账期超过 30 天' },
  { id: 'project-delay', level: 'medium', source: '项目', title: '交付进度出现偏离', detail: '海州项目预计延迟 6 天' },
  { id: 'sales-gap', level: 'medium', source: '销售', title: '华北区域目标完成偏低', detail: '当前达成率 61%，低于公司均值' },
  { id: 'approval-wait', level: 'low', source: '审批', title: '2 项采购申请等待处理', detail: '涉及金额共 18.4 万' },
]

export const aiAnalysis = {
  summary: '公司整体运行平稳，销售保持增长，但回款速度与项目交付开始承压。',
  confidence: '87%',
  recommendations: [
    '本周优先跟进 46.8 万逾期应收款。',
    '要求海州项目负责人提交进度恢复计划。',
    '复盘华北销售线索质量，将资源向高转化行业倾斜。',
  ],
} as const
