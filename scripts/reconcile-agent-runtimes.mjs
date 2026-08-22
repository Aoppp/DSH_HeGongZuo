// 定期按能力包清单和账号权限重建运行空间。
// 它不包含任何具体业务 Agent 名称：新增 packages/*/hegongzuo-agent.json 后会自动纳入。
import { spawn } from 'node:child_process'
import path from 'node:path'

import { projectRoot } from './account-agent-runtime-paths-base.mjs'

/** @param {string} script */
function run(script) {
  /** @type {Promise<void>} */
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(projectRoot, 'scripts', script)], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve(undefined) : reject(new Error(`${script} 执行失败（code=${String(code)}）`)))
  })
}

await run('sync-account-agent-runtimes.mjs')
await run('setup-account-agent-runtimes.mjs')
console.log('[和工作] Agent 运行空间自动协调完成。')
