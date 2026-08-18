// 从 accounts 表生成账号 Agent 运行时配置（.runtime/account-agent-runtimes.json）。
// 端口按账号创建顺序从 3180 起分配；旧配置目录（如 boss）自动迁移到新登录名。
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { pool } from '../apps/api/scripts/database.mjs'

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptsDirectory, '..')
const generatedPath = path.join(projectRoot, '.runtime', 'account-agent-runtimes.json')
const legacyConfigPath = path.join(projectRoot, 'config', 'account-agent-runtimes.json')
const runtimeRoot = path.join(projectRoot, '.runtime', 'dsh')
const workspaceRoot = path.join(projectRoot, '.runtime', 'workspaces')

/** @type {{ account_id: string }[]} */
const accountRows = (await pool.query(
  `SELECT account_id FROM accounts WHERE status = 'active' ORDER BY created_at, id`,
)).rows
/** @type {string[]} */
const accountIds = accountRows.map((row) => row.account_id)

/** @returns {Promise<string | null>} 上一版配置 JSON 文本（生成文件优先，其次旧静态 config） */
async function readPreviousConfig() {
  try {
    return await readFile(generatedPath, 'utf8')
  } catch {
    // 生成文件不存在时回退到旧静态配置
  }
  try {
    return await readFile(legacyConfigPath, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

// 旧账号顺序 → 新账号顺序按端口对应迁移
/** @type {string | null} */
const legacyText = await readPreviousConfig()
/** @type {{ accountId?: string }[]} */
const legacyDefinitions = legacyText ? JSON.parse(legacyText) : []
for (let index = 0; index < legacyDefinitions.length; index++) {
  const legacyAccount = legacyDefinitions[index]?.accountId ?? ''
  const currentAccount = accountIds[index] ?? ''
  if (!legacyAccount || !currentAccount || legacyAccount === currentAccount) continue
  const oldHome = path.join(runtimeRoot, legacyAccount)
  const newHome = path.join(runtimeRoot, currentAccount)
  const oldWorkspace = path.join(workspaceRoot, legacyAccount)
  const newWorkspace = path.join(workspaceRoot, currentAccount)
  /** @type {[string, string][]} */
  const directoryPairs = [[oldHome, newHome], [oldWorkspace, newWorkspace]]
  for (const [oldPath, newPath] of directoryPairs) {
    try {
      await access(oldPath)
    } catch {
      continue
    }
    try {
      await access(newPath)
      console.log(`[和工作] ${path.relative(projectRoot, newPath)} 已存在，旧目录 ${path.relative(projectRoot, oldPath)} 保留未迁移。`)
    } catch {
      await rename(oldPath, newPath)
      console.log(`[和工作] 账号目录迁移：${path.relative(projectRoot, oldPath)} → ${path.relative(projectRoot, newPath)}`)
    }
  }
}

const definitions = accountIds.map((accountId, index) => ({
  accountId,
  port: 3180 + index,
  apiBasePath: `/dsh/${accountId}`,
  workspaceDirectory: `.runtime/workspaces/${accountId}/employee-agent`,
}))

await mkdir(path.dirname(generatedPath), { recursive: true })
await writeFile(generatedPath, `${JSON.stringify(definitions, null, 2)}\n`, 'utf8')
console.log(`[和工作] 账号 Agent 运行时配置已同步（${definitions.length} 个启用账号）：${definitions.map((definition) => `${definition.accountId}→${definition.port}`).join('、')}。`)

await pool.end()
