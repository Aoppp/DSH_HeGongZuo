// 账号查询运行时监督器：配置变更时增删对应进程；单个账号失败不影响平台 API 或其他账号。
import { spawn } from 'node:child_process'
import { access, readFile, watch } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'

import { accountRuntimeRoot, accountWorkspaceRoot, dshBinPath, projectRoot } from './account-agent-runtime-paths-base.mjs'

const runtimeConfigPath = path.join(projectRoot, '.runtime', 'account-agent-runtimes.json')
try {
  process.loadEnvFile(path.join(projectRoot, '.env'))
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
}
/** @type {Map<string, { child: import('node:child_process').ChildProcess, port: number }>} */
const running = new Map()
let shuttingDown = false
/** @type {NodeJS.Timeout | undefined} */
let reloadTimer

/** @typedef {{ accountId: string, port: number, workspaceDirectory: string }} RuntimeDefinition */

/** @param {import('node:stream').Readable} stream @param {string} prefix @param {import('node:stream').Writable} destination */
function pipeOutput(stream, prefix, destination) {
  const reader = readline.createInterface({ input: stream })
  reader.on('line', (line) => destination.write(`[${prefix}] ${line}\n`))
}

/** @returns {Promise<RuntimeDefinition[]>} */
async function readDefinitions() {
  const raw = JSON.parse(await readFile(runtimeConfigPath, 'utf8'))
  if (!Array.isArray(raw)) throw new Error('账号运行时配置格式无效。')
  return raw.filter((item) => typeof item === 'object' && item !== null
    && typeof item.accountId === 'string' && /^[a-z][a-z0-9]{1,31}$/.test(item.accountId)
    && typeof item.port === 'number' && Number.isInteger(item.port)
    && typeof item.workspaceDirectory === 'string')
}

/** @param {RuntimeDefinition} definition */
async function startRuntime(definition) {
  const existing = running.get(definition.accountId)
  if (existing && existing.port === definition.port) return
  if (existing) {
    existing.child.kill('SIGTERM')
    return
  }

  const dshHome = path.join(accountRuntimeRoot, definition.accountId)
  const workspacePath = path.resolve(projectRoot, definition.workspaceDirectory)
  const relativeWorkspace = path.relative(accountWorkspaceRoot, workspacePath)
  if (relativeWorkspace.startsWith('..') || path.isAbsolute(relativeWorkspace)) {
    console.error(`[和工作] 账号 ${definition.accountId} 的工作区路径无效。`)
    return
  }
  try {
    await access(path.join(dshHome, 'profiles', 'web', 'package.json'))
  } catch {
    console.error(`[和工作] 账号 ${definition.accountId} 尚未完成员工查询运行空间初始化。`)
    return
  }

  const child = spawn(process.execPath, [dshBinPath, '--profile', 'web', '--host', '127.0.0.1', '--port', String(definition.port)], {
    cwd: workspacePath,
    env: { ...process.env, DSH_HOME: dshHome, HEGONGZUO_ACCOUNT_ID: definition.accountId, HEGONGZUO_AGENT_WORKSPACE: workspacePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  pipeOutput(child.stdout, definition.accountId, process.stdout)
  pipeOutput(child.stderr, definition.accountId, process.stderr)
  running.set(definition.accountId, { child, port: definition.port })
  console.log(`[和工作] ${definition.accountId} 的员工查询服务已启动：127.0.0.1:${definition.port}`)
  child.once('exit', (code, signal) => {
    if (running.get(definition.accountId)?.child === child) running.delete(definition.accountId)
    if (!shuttingDown) {
      console.error(`[和工作] ${definition.accountId} 的员工查询服务已退出（code=${String(code)}, signal=${String(signal)}），将重试。`)
      scheduleReload(5000)
    }
  })
}

async function reload() {
  if (shuttingDown) return
  try {
    const definitions = await readDefinitions()
    const desired = new Map(definitions.map((definition) => [definition.accountId, definition]))
    for (const [accountId, runtime] of running) {
      const next = desired.get(accountId)
      if (!next || next.port !== runtime.port) runtime.child.kill('SIGTERM')
    }
    for (const definition of definitions) await startRuntime(definition)
  } catch (error) {
    console.error(`[和工作] 无法加载账号查询运行时配置：${error instanceof Error ? error.message : String(error)}`)
  }
}

function scheduleReload(delay = 150) {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => { reloadTimer = undefined; void reload() }, delay)
}

await reload()
const watchAbortController = new AbortController()
const watcher = watch(path.dirname(runtimeConfigPath), { signal: watchAbortController.signal })
void (async () => {
  for await (const event of watcher) {
    if (event.filename?.toString() === path.basename(runtimeConfigPath)) scheduleReload()
  }
})()

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  watchAbortController.abort()
  for (const { child } of running.values()) child.kill('SIGTERM')
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
