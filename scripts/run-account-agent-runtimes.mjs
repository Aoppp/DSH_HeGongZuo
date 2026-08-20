// 本地开发监督器：按统一 Agent 注册表启动全部实例。
import { spawn } from 'node:child_process'
import { readFile, watch } from 'node:fs/promises'
import path from 'node:path'

import { projectRoot } from './account-agent-runtime-paths-base.mjs'

const runtimeConfigPath = path.join(projectRoot, '.runtime', 'agent-runtimes.json')
const running = new Map()
let stopping = false
/** @type {NodeJS.Timeout | undefined} */
let reloadTimer

/** @typedef {{ runtimeId: string }} RuntimeDefinition */

/** @returns {Promise<RuntimeDefinition[]>} */
async function definitions() {
  const items = JSON.parse(await readFile(runtimeConfigPath, 'utf8'))
  if (!Array.isArray(items)) throw new Error('Agent 运行时配置格式无效。')
  return items.filter((item) => item && typeof item.runtimeId === 'string' && /^[a-z][a-z0-9-]{1,62}--[a-z][a-z0-9]{1,31}$/.test(item.runtimeId))
}

/** @param {RuntimeDefinition} definition */
function start(definition) {
  if (running.has(definition.runtimeId)) return
  const child = spawn(process.execPath, [path.join(projectRoot, 'scripts', 'run-agent-runtime.mjs'), definition.runtimeId], { cwd: projectRoot, env: process.env, stdio: 'inherit' })
  running.set(definition.runtimeId, child)
  child.once('exit', () => {
    if (running.get(definition.runtimeId) === child) running.delete(definition.runtimeId)
    if (!stopping) scheduleReload(5_000)
  })
}

async function reload() {
  if (stopping) return
  try {
    const items = await definitions()
    const desired = new Set(items.map((item) => item.runtimeId))
    for (const [id, child] of running) if (!desired.has(id)) child.kill('SIGTERM')
    for (const item of items) start(item)
  } catch (error) {
    console.error(`[和工作] 无法加载 Agent 运行时配置：${error instanceof Error ? error.message : String(error)}`)
  }
}

function scheduleReload(delay = 150) {
  clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => { reloadTimer = undefined; void reload() }, delay)
}

await reload()
const watchAbortController = new AbortController()
const watcher = watch(path.dirname(runtimeConfigPath), { signal: watchAbortController.signal })
void (async () => { for await (const event of watcher) if (event.filename?.toString() === path.basename(runtimeConfigPath)) scheduleReload() })()
function shutdown() {
  stopping = true
  watchAbortController.abort()
  for (const child of running.values()) child.kill('SIGTERM')
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
