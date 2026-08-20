import { readFile } from 'node:fs/promises'

const api = await fetch('http://127.0.0.1:4174/health', { signal: AbortSignal.timeout(4_000) })
if (!api.ok) throw new Error(`API 健康检查失败（HTTP ${api.status}）。`)

const configPath = process.env.HEGONGZUO_ALL_AGENT_RUNTIME_CONFIG ?? '.runtime/agent-runtimes.json'
const definitions = JSON.parse(await readFile(configPath, 'utf8'))
if (!Array.isArray(definitions)) throw new Error('Agent 运行时配置无效。')
const runtimes = definitions.filter((item) => typeof item === 'object' && item !== null && typeof item.port === 'number')
const checks = await Promise.all(runtimes.map(async ({ port }) => {
  const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2_000) })
  if (response.status >= 500) throw new Error(`Agent 运行时 ${port} 不可用。`)
}))
void checks
