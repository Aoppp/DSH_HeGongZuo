// 为单个账号创建员工查询所需的独立运行空间；由账号创建流程调用。
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { dshBinPath, employeeAgentPath, accountRuntimeRoot, accountWorkspaceRoot, projectRoot } from './account-agent-runtime-paths-base.mjs'

const accountId = process.argv[2]?.trim() ?? ''
if (!/^[a-z][a-z0-9]{1,31}$/.test(accountId)) throw new Error('账号运行空间初始化缺少有效登录名。')

const dshHome = path.join(accountRuntimeRoot, accountId)
const workspacePath = path.join(accountWorkspaceRoot, accountId, 'employee-agent')
await mkdir(dshHome, { recursive: true })
await mkdir(workspacePath, { recursive: true })

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [dshBinPath, 'plugin', '--profile', 'web', 'add', '--save-exact', employeeAgentPath], {
    cwd: projectRoot,
    env: { ...process.env, DSH_HOME: dshHome },
    stdio: 'inherit',
  })
  child.once('error', reject)
  child.once('exit', (code, signal) => code === 0
    ? resolve(undefined)
    : reject(new Error(`账号运行空间初始化失败（code=${String(code)}, signal=${String(signal)}）`)))
})

console.log(`[和工作] 已完成账号 ${accountId} 的员工查询运行空间初始化。`)
