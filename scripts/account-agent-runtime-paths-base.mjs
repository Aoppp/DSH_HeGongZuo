import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url))

export const projectRoot = path.resolve(scriptsDirectory, '..')
export const dshBinPath = path.join(projectRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
export const employeeAgentPath = path.join(projectRoot, 'packages', 'employee-agent')
export const accountRuntimeRoot = path.join(projectRoot, '.runtime', 'dsh')
export const accountWorkspaceRoot = path.join(projectRoot, '.runtime', 'workspaces')
