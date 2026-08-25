import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { agentPackageRevision, waitForProvisionedPackage } from './agent-package-revision.mjs'
import { agentSandboxRoot, dshBinPath, projectRoot } from './account-agent-runtime-paths-base.mjs'
import { ensureRuntimeWorkspace } from './agent-runtime-workspace.mjs'

const runtimeId = process.argv[2]?.trim() ?? ''
if (!/^[a-z][a-z0-9-]{1,62}--[a-z][a-z0-9]{1,31}$/.test(runtimeId)) throw new Error('必须指定有效 Agent 运行时标识。')
const definitions = JSON.parse(await readFile(path.join(projectRoot, '.runtime', 'agent-runtimes.json'), 'utf8'))
const definition = Array.isArray(definitions) ? definitions.find((item) => item?.runtimeId === runtimeId) : undefined
if (!definition || definition.runtime !== 'dsh-web' || typeof definition.agentId !== 'string' || typeof definition.accountId !== 'string' || typeof definition.port !== 'number' || typeof definition.dshDirectory !== 'string' || typeof definition.workspaceDirectory !== 'string' || typeof definition.packageDirectory !== 'string') throw new Error(`未配置 Agent 运行时：${runtimeId}`)
const workspace = path.resolve(projectRoot, definition.workspaceDirectory)
const dshHome = path.resolve(projectRoot, definition.dshDirectory)
const pluginDirectory = path.resolve(projectRoot, definition.packageDirectory)
if (!workspace.startsWith(`${agentSandboxRoot}${path.sep}`) || !dshHome.startsWith(`${agentSandboxRoot}${path.sep}`)) throw new Error('Agent 工作区路径无效。')
if (!pluginDirectory.startsWith(`${projectRoot}${path.sep}`)) throw new Error('Agent 能力包路径无效。')
const expectedRevision = await agentPackageRevision(pluginDirectory)
await waitForProvisionedPackage(path.join(dshHome, '.package-revision'), expectedRevision)
const child = spawn(process.execPath, [dshBinPath, '--profile', 'web', '--host', '127.0.0.1', '--port', String(definition.port)], { cwd: workspace, env: { ...process.env, DSH_HOME: dshHome, HEGONGZUO_ACCOUNT_ID: definition.accountId, HEGONGZUO_AGENT_ID: definition.agentId, HEGONGZUO_AGENT_WORKSPACE: workspace }, stdio: 'inherit' })
const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
try {
  await ensureRuntimeWorkspace({ port: definition.port, workspacePath: workspace, agentId: definition.agentId, accountId: definition.accountId })
} catch (reason) {
  child.kill('SIGTERM')
  await exited
  throw reason
}
const result = await exited
process.exitCode = result.code === 0 ? 0 : 1
