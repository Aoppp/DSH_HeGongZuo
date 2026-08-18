import { spawn } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'

import { accountAgentRuntimes, dshBinPath, projectRoot } from './account-agent-runtime-paths.mjs'

try {
  process.loadEnvFile(path.join(projectRoot, '.env'))
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
}

/** @param {(typeof accountAgentRuntimes)[number]} runtime */
async function assertRuntimeReady(runtime) {
  const packagePath = path.join(runtime.dshHome, 'profiles', 'web', 'package.json')
  await access(packagePath)
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }
  if (!dependencies['@hegongzuo/employee-agent']) {
    throw new Error(`账号 ${runtime.accountId} 的 DSH profile 未安装员工 Agent。`)
  }
}

/**
 * @param {import('node:stream').Readable} stream
 * @param {string} prefix
 * @param {import('node:stream').Writable} destination
 */
function pipeOutput(stream, prefix, destination) {
  const reader = readline.createInterface({ input: stream })
  reader.on('line', (line) => destination.write(`[${prefix}] ${line}\n`))
}

try {
  await Promise.all(accountAgentRuntimes.map(assertRuntimeReady))
} catch (error) {
  console.error(`[\u548c工作] ${error instanceof Error ? error.message : String(error)}`)
  console.error('[和工作] 请先执行：corepack pnpm dsh:accounts:setup')
  process.exit(1)
}

const children = accountAgentRuntimes.map((runtime) => {
  const child = spawn(process.execPath, [dshBinPath, '--profile', 'web', '--host', '127.0.0.1', '--port', String(runtime.port)], {
    cwd: runtime.workspacePath,
    env: {
      ...process.env,
      DSH_HOME: runtime.dshHome,
      HEGONGZUO_ACCOUNT_ID: runtime.accountId,
      HEGONGZUO_AGENT_WORKSPACE: runtime.workspacePath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  pipeOutput(child.stdout, runtime.accountId, process.stdout)
  pipeOutput(child.stderr, runtime.accountId, process.stderr)
  console.log(`[和工作] ${runtime.accountId} 专属 Agent 正在启动：http://127.0.0.1:${runtime.port}（工作区已自动绑定）`)
  return { child, runtime }
})

let shuttingDown = false

/** @param {NodeJS.Signals} [signal] */
function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return
  shuttingDown = true
  for (const { child } of children) {
    if (!child.killed) child.kill(signal)
  }
}

process.once('SIGINT', () => shutdown('SIGTERM'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

/** @type {Promise<void>} */
const allRuntimesExited = new Promise((resolve) => {
  let remaining = children.length
  for (const { child, runtime } of children) {
    child.once('exit', (code, signal) => {
      remaining -= 1
      if (!shuttingDown && code !== 0) {
        console.error(`[和工作] ${runtime.accountId} 专属 Agent 异常退出（code=${String(code)}, signal=${String(signal)}）。`)
        shutdown('SIGTERM')
      }
      if (remaining === 0) resolve()
    })
  }
})

await allRuntimesExited

if (!shuttingDown) process.exitCode = 1
