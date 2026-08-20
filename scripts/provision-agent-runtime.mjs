// 为一个已生成的 Agent 运行时安装其 DSH 插件；运行时定义来自统一注册表。
import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { accountRuntimeRoot, dshBinPath, projectRoot } from './account-agent-runtime-paths-base.mjs'

const runtimeId = process.argv[2]?.trim() ?? ''
if (!/^[a-z][a-z0-9-]{1,62}--[a-z][a-z0-9]{1,31}$/.test(runtimeId)) throw new Error('缺少有效 Agent 运行时标识。')
const definitions = JSON.parse(await readFile(path.join(projectRoot, '.runtime', 'agent-runtimes.json'), 'utf8'))
const definition = Array.isArray(definitions) ? definitions.find((item) => item?.runtimeId === runtimeId) : undefined
if (!definition || definition.runtime !== 'dsh-web' || typeof definition.agentId !== 'string' || typeof definition.accountId !== 'string' || typeof definition.packageDirectory !== 'string' || typeof definition.workspaceDirectory !== 'string') throw new Error(`未找到可初始化的 Agent 运行时：${runtimeId}`)

const dshHome = path.join(accountRuntimeRoot, definition.agentId, definition.accountId)
const workspace = path.resolve(projectRoot, definition.workspaceDirectory)
const pluginDirectory = path.resolve(projectRoot, definition.packageDirectory)
if (!pluginDirectory.startsWith(`${projectRoot}${path.sep}`) || !workspace.startsWith(`${projectRoot}${path.sep}`)) throw new Error('Agent 路径超出项目目录。')
await mkdir(dshHome, { recursive: true })
await mkdir(workspace, { recursive: true })

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [dshBinPath, 'plugin', '--profile', 'web', 'add', '--save-exact', pluginDirectory], { cwd: projectRoot, env: { ...process.env, DSH_HOME: dshHome }, stdio: 'inherit' })
  child.once('error', reject)
  child.once('exit', (code, signal) => code === 0 ? resolve(undefined) : reject(new Error(`Agent 运行时初始化失败（code=${String(code)}, signal=${String(signal)}）`)))
})
console.log(`[和工作] 已完成 ${runtimeId} 的运行空间初始化。`)
