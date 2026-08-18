import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'

import { accountAgentRuntimes, dshBinPath, employeeAgentPath, projectRoot } from './account-agent-runtime-paths.mjs'

/**
 * @param {readonly string[]} args
 * @param {string} dshHome
 * @returns {Promise<void>}
 */
function runDsh(args, dshHome) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [dshBinPath, ...args], {
      cwd: projectRoot,
      env: { ...process.env, DSH_HOME: dshHome },
      stdio: 'inherit',
    })

    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`DSH 运行时初始化失败（code=${String(code)}, signal=${String(signal)}）`))
    })
  })
}

for (const runtime of accountAgentRuntimes) {
  await mkdir(runtime.dshHome, { recursive: true })
  await mkdir(runtime.workspacePath, { recursive: true })
  console.log(`\n[和工作] 正在配置账号 ${runtime.accountId} 的独立 DSH_HOME…`)
  await runDsh(['plugin', '--profile', 'web', 'add', '--save-exact', employeeAgentPath], runtime.dshHome)
  console.log(`[和工作] 已分配员工 Agent 工作区：${runtime.workspacePath}`)
}

console.log('\n[和工作] 账号专属 Agent 运行空间已配置完成。')
