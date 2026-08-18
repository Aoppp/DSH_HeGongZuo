import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

import { accountAgentRuntimes } from './account-agent-runtime-paths.mjs'

const AGENT_READY_TIMEOUT_MS = 30_000
const RETRY_DELAY_MS = 250
const REQUIRED_PORTS = [4173, 4174, ...accountAgentRuntimes.map((runtime) => runtime.port)]

/** @typedef {{ name: string, args: string[] }} DevelopmentService */

/** @type {import('node:child_process').ChildProcess[]} */
const children = []
let shuttingDown = false

/** @param {DevelopmentService} service */
function startService(service) {
  const child = spawn('corepack', service.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
  children.push(child)
  child.once('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`[和工作] ${service.name} 服务已退出（code=${String(code)}, signal=${String(signal)}）。`)
      shutdown()
    }
  })
  return child
}

/** @returns {Promise<void>} */
function runSetup() {
  return new Promise((resolve, reject) => {
    const child = spawn('corepack', ['pnpm', 'dsh:accounts:setup'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`Agent 运行时初始化失败（code=${String(code)}, signal=${String(signal)}）`))
    })
  })
}

/** @param {number} delayMs */
function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

/** @param {number} port @returns {Promise<void>} */
function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', (error) => reject(error))
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close((error) => error === undefined ? resolve() : reject(error))
    })
  })
}

async function assertRequiredPortsAvailable() {
  /** @type {number[]} */
  const occupiedPorts = []
  for (const port of REQUIRED_PORTS) {
    try {
      await assertPortAvailable(port)
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EADDRINUSE') {
        occupiedPorts.push(port)
        continue
      }
      throw error
    }
  }
  if (occupiedPorts.length > 0) {
    throw new Error(`端口 ${occupiedPorts.join('、')} 已被占用。已有“和工作”实例运行时，请先在其终端按 Ctrl+C 停止，再重新启动。`)
  }
}

async function waitForAgentRuntimes() {
  const deadline = Date.now() + AGENT_READY_TIMEOUT_MS
  const pending = new Set(accountAgentRuntimes.map((runtime) => runtime.accountId))

  while (pending.size > 0 && Date.now() < deadline) {
    await Promise.all(accountAgentRuntimes.map(async (runtime) => {
      if (!pending.has(runtime.accountId)) return
      try {
        const response = await fetch(`http://127.0.0.1:${runtime.port}/`, { signal: AbortSignal.timeout(1_500) })
        if (response.ok) pending.delete(runtime.accountId)
      } catch {
        // DSH is still starting; retry until the shared deadline.
      }
    }))
    if (pending.size > 0) await wait(RETRY_DELAY_MS)
  }

  if (pending.size > 0) {
    throw new Error(`以下 Agent 运行时未在 ${AGENT_READY_TIMEOUT_MS / 1000} 秒内就绪：${[...pending].join('、')}`)
  }
}

try {
  await assertRequiredPortsAvailable()
  await runSetup()
  startService({ name: '账号 Agent', args: ['pnpm', 'dsh:accounts'] })
  await waitForAgentRuntimes()
  console.log('[和工作] 两个账号专属 Agent 已就绪，正在启动平台 API 与 Web。')
  startService({ name: 'api', args: ['pnpm', '--filter', '@hegongzuo/api', 'dev'] })
  startService({ name: 'web', args: ['pnpm', '--filter', '@hegongzuo/web', 'dev'] })
} catch (error) {
  console.error(`[和工作] 平台启动失败：${error instanceof Error ? error.message : String(error)}`)
  shutdown()
  process.exitCode = 1
}

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

if (!shuttingDown) {
  await Promise.all(children.map((child) => new Promise((resolve) => child.once('exit', resolve))))
}
