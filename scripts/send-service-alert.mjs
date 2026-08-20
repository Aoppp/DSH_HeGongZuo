const [failedUnit = '未知服务'] = process.argv.slice(2)
const webhook = process.env.HEGONGZUO_ALERT_WEBHOOK_URL?.trim()

if (!webhook) {
  console.error(`[和工作] ${failedUnit} 发生故障；未配置 HEGONGZUO_ALERT_WEBHOOK_URL。`)
  process.exit(0)
}

const response = await fetch(webhook, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: `和工作服务健康检查失败：${failedUnit}` }),
  signal: AbortSignal.timeout(10_000),
})
if (!response.ok) throw new Error(`告警通知发送失败（HTTP ${response.status}）。`)
