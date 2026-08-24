import { readFile } from 'node:fs/promises'
import path from 'node:path'

export { projectRoot, dshBinPath, employeeAgentPath, accountRuntimeRoot, accountWorkspaceRoot, agentSandboxRoot } from './account-agent-runtime-paths-base.mjs'
import { agentSandboxRoot, projectRoot, accountRuntimeRoot } from './account-agent-runtime-paths-base.mjs'

/** @typedef {{ accountId: string, port: number, apiBasePath: string, dshDirectory?: string, workspaceDirectory: string }} AccountAgentRuntimeDefinition */
/** @type {AccountAgentRuntimeDefinition[]} */
const accountAgentRuntimeDefinitions = JSON.parse(await readFile(path.join(projectRoot, '.runtime', 'account-agent-runtimes.json'), 'utf8'))

export const accountAgentRuntimes = accountAgentRuntimeDefinitions.map((definition) => {
  const workspacePath = path.resolve(projectRoot, definition.workspaceDirectory)
  const relativeWorkspace = path.relative(agentSandboxRoot, workspacePath)

  if (relativeWorkspace.startsWith('..') || path.isAbsolute(relativeWorkspace)) {
    throw new Error(`账号 ${definition.accountId} 的工作区超出项目隔离目录。`)
  }

  return {
    ...definition,
    dshHome: typeof definition.dshDirectory === 'string' ? path.resolve(projectRoot, definition.dshDirectory) : path.join(accountRuntimeRoot, definition.accountId),
    workspacePath,
  }
})
