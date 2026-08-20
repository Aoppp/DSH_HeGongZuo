import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { projectRoot } from './account-agent-runtime-paths-base.mjs'

const accountId = process.argv[2]?.trim() ?? ''
if (!/^[a-z][a-z0-9]{1,31}$/.test(accountId)) throw new Error('缺少有效账号标识。')
const definitions = JSON.parse(await readFile(path.join(projectRoot, '.runtime', 'agent-runtimes.json'), 'utf8'))
if (!Array.isArray(definitions)) throw new Error('Agent 运行时配置无效。')
for (const definition of definitions.filter((item) => item?.accountId === accountId)) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(projectRoot, 'scripts', 'provision-agent-runtime.mjs'), definition.runtimeId], { cwd: projectRoot, env: process.env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve(undefined) : reject(new Error(`Agent ${definition.runtimeId} 初始化失败。`)))
  })
}
