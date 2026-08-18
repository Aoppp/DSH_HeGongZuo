import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

import { accountAgentRuntimes, accountRuntimeRoot, accountWorkspaceRoot } from './account-agent-runtime-paths.mjs'

const uniqueHomes = new Set(accountAgentRuntimes.map((runtime) => path.resolve(runtime.dshHome)))
const uniquePorts = new Set(accountAgentRuntimes.map((runtime) => runtime.port))
const uniqueApiBasePaths = new Set(accountAgentRuntimes.map((runtime) => runtime.apiBasePath))
const uniqueWorkspaces = new Set(accountAgentRuntimes.map((runtime) => path.resolve(runtime.workspacePath)))

if (uniqueHomes.size !== accountAgentRuntimes.length) throw new Error('DSH_HOME 未按账号唯一分配。')
if (uniquePorts.size !== accountAgentRuntimes.length) throw new Error('DSH Web 端口未按账号唯一分配。')
if (uniqueApiBasePaths.size !== accountAgentRuntimes.length) throw new Error('DSH API 代理路径未按账号唯一分配。')
if (uniqueWorkspaces.size !== accountAgentRuntimes.length) throw new Error('员工 Agent 工作区未按账号唯一分配。')

for (const runtime of accountAgentRuntimes) {
  const relativeHome = path.relative(accountRuntimeRoot, runtime.dshHome)
  if (relativeHome.startsWith('..') || path.isAbsolute(relativeHome)) {
    throw new Error(`账号 ${runtime.accountId} 的 DSH_HOME 超出项目隔离目录。`)
  }

  const relativeWorkspace = path.relative(accountWorkspaceRoot, runtime.workspacePath)
  if (relativeWorkspace.startsWith('..') || path.isAbsolute(relativeWorkspace)) {
    throw new Error(`账号 ${runtime.accountId} 的工作区超出项目隔离目录。`)
  }
  await access(runtime.workspacePath)

  const packagePath = path.join(runtime.dshHome, 'profiles', 'web', 'package.json')
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }
  if (!dependencies['@hegongzuo/employee-agent']) {
    throw new Error(`账号 ${runtime.accountId} 的独立 profile 未安装员工 Agent。`)
  }

  const response = await fetch(`http://127.0.0.1:${runtime.port}`, { signal: AbortSignal.timeout(3000) })
  if (!response.ok) throw new Error(`账号 ${runtime.accountId} 的 Agent 运行时未正常响应。`)
  const workspaceStorage = JSON.parse(await readFile(path.join(runtime.dshHome, 'storages', 'workspace.json'), 'utf8'))
  const workspaceRecords = Object.values(workspaceStorage.tables?.workspaces ?? {})
  if (!workspaceRecords.some((record) => record && typeof record === 'object' && record.path === runtime.workspacePath)) {
    throw new Error(`账号 ${runtime.accountId} 的 DSH 未自动注册专属工作区。`)
  }

  console.log(`${runtime.accountId}: DSH_HOME=${runtime.dshHome}, workspace=${runtime.workspacePath}, port=${runtime.port}, HTTP ${response.status}`)
}

console.log(`账号级 Agent 隔离验证通过：${accountAgentRuntimes.length} 个独立 DSH_HOME、工作区、API 路径和浏览器 origin。`)
