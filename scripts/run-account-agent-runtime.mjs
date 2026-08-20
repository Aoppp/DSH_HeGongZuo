import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { accountRuntimeRoot, dshBinPath, projectRoot } from './account-agent-runtime-paths-base.mjs'

const accountId = process.argv[2]
if (!accountId || !/^[a-z][a-z0-9]{1,31}$/.test(accountId)) throw new Error('必须指定有效的账号标识。')
const definitions = JSON.parse(await readFile(path.join(projectRoot, '.runtime', 'account-agent-runtimes.json'), 'utf8'))
const definition = Array.isArray(definitions) ? definitions.find((item) => item?.accountId === accountId) : undefined
if (!definition || typeof definition.port !== 'number' || typeof definition.workspaceDirectory !== 'string') throw new Error(`账号 ${accountId} 未配置员工查询运行时。`)
const workspace = path.resolve(projectRoot, definition.workspaceDirectory)
const child = spawn(process.execPath, [dshBinPath, '--profile', 'web', '--host', '127.0.0.1', '--port', String(definition.port)], { cwd: workspace, env: { ...process.env, DSH_HOME: path.join(accountRuntimeRoot, accountId), HEGONGZUO_ACCOUNT_ID: accountId, HEGONGZUO_AGENT_WORKSPACE: workspace }, stdio: 'inherit' })
const result = await new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
process.exitCode = result.code === 0 ? 0 : 1
