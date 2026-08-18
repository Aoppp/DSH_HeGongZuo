import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url))

export const projectRoot = path.resolve(scriptsDirectory, '..')
export const dshBinPath = path.join(projectRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
export const employeeAgentPath = path.join(projectRoot, 'packages', 'employee-agent')
export const accountRuntimeRoot = path.join(projectRoot, '.runtime', 'dsh')
export const accountWorkspaceRoot = path.join(projectRoot, '.runtime', 'workspaces')

/** @typedef {{ accountId: string, port: number, apiBasePath: string, workspaceDirectory: string }} AccountAgentRuntimeDefinition */
/** @type {AccountAgentRuntimeDefinition[]} */
const accountAgentRuntimeDefinitions = JSON.parse(await readFile(path.join(projectRoot, 'config', 'account-agent-runtimes.json'), 'utf8'))

export const accountAgentRuntimes = accountAgentRuntimeDefinitions.map((definition) => {
  const workspacePath = path.resolve(projectRoot, definition.workspaceDirectory)
  const relativeWorkspace = path.relative(accountWorkspaceRoot, workspacePath)

  if (relativeWorkspace.startsWith('..') || path.isAbsolute(relativeWorkspace)) {
    throw new Error(`账号 ${definition.accountId} 的工作区超出项目隔离目录。`)
  }

  return {
    ...definition,
    dshHome: path.join(accountRuntimeRoot, definition.accountId),
    workspacePath,
  }
})
