import { spawn } from 'node:child_process'

/** @typedef {{ name: string, args: string[] }} ProductionService */

/** @type {import('node:child_process').ChildProcess[]} */
const children = []
let shuttingDown = false

/** @param {ProductionService} service */
function startService(service) {
  const child = spawn('corepack', service.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
  children.push(child)
  child.once('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`[和工作] ${service.name} 服务已退出（code=${String(code)}, signal=${String(signal)}）。`)
    shutdown()
    process.exitCode = 1
  })
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

// 构建与账号运行时初始化必须在启动前由 platform:prepare 完成。
startService({ name: '账号查询运行时', args: ['pnpm', 'dsh:accounts'] })
startService({ name: '平台 API', args: ['pnpm', '--filter', '@hegongzuo/api', 'start'] })

await Promise.all(children.map((child) => new Promise((resolve) => child.once('exit', resolve))))
