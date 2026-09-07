import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const [failedUnit = '未知服务'] = process.argv.slice(2)
const webhook = process.env.HEGONGZUO_ALERT_WEBHOOK_URL?.trim()

if (failedUnit.includes('work-daily-sync') || failedUnit.includes('checkin-sync')) {
  await promisify(execFile)(process.execPath, ['apps/api/dist/modules/platform/notification-failure-cli.js', failedUnit], { timeout: 20_000 }).catch((error) => console.error(`[和工作] 站内故障通知写入失败：${error.message}`))
}

if (webhook) {
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: `和工作服务健康检查失败：${failedUnit}` }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`告警通知发送失败（HTTP ${response.status}）。`)
} else console.error(`[和工作] ${failedUnit} 发生故障；未配置外部告警地址。`)
