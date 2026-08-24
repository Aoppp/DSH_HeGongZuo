import { spawn } from 'node:child_process'
import { access, appendFile, readFile, rename } from 'node:fs/promises'
import path from 'node:path'

import { projectRoot } from './account-agent-runtime-paths-base.mjs'

const definitions = JSON.parse(await readFile(path.join(projectRoot, '.runtime', 'agent-runtimes.json'), 'utf8'))
if (!Array.isArray(definitions)) throw new Error('Agent 运行时配置无效。')
for (const definition of definitions) {
  if (typeof definition?.runtimeId !== 'string') throw new Error('Agent 运行时标识无效。')
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(projectRoot, 'scripts', 'provision-agent-runtime.mjs'), definition.runtimeId], { cwd: projectRoot, env: { ...process.env, HEGONGZUO_DEFER_AGENT_RESTART: '1' }, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve(undefined) : reject(new Error(`Agent ${definition.runtimeId} 初始化失败。`)))
  })
}

const pendingRestartPath = path.join(projectRoot, '.runtime', 'agent-restart-pending')
const restartRequestPath = path.join(projectRoot, '.runtime', 'agent-restart-request')
try {
  await access(pendingRestartPath)
  // 保留可能由单独运行时初始化写入的请求，再原子发布完整批次。
  let existing = ''
  try { existing = await readFile(restartRequestPath, 'utf8') } catch { /* 不存在时直接发布。 */ }
  if (existing) await appendFile(pendingRestartPath, existing)
  await rename(pendingRestartPath, restartRequestPath)
} catch { /* 本批次没有能力包版本变化，无需触发重启。 */ }
console.log('\n[和工作] 已完成所有已启用 Agent 运行空间配置。')
