// 从 accounts 表生成账号 Agent 运行时配置（.runtime/account-agent-runtimes.json）。
// 端口按账号创建顺序从 3180 起分配；旧配置目录（如 boss）自动迁移到新登录名；
// 已删除账号的运行时目录与工作区自动清理。
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
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
  `SELECT a.account_id
   FROM accounts a
   WHERE a.status = 'active'
     AND EXISTS (
       SELECT 1 FROM account_module_permissions p
       WHERE p.account_id = a.id AND p.permission_id = 'employee-query'
     )
   ORDER BY a.created_at, a.id`,
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

// 旧账号顺序 → 新账号顺序按端口对应迁移（仅账号数量不变时执行，如登录名修改；
// 账号增删时跳过迁移，避免把已删除账号的目录误迁移给同位置的新账号。
// 已知边界：等数量"删除+新增"组合（删一个加一个，总数不变）无法与登录名修改
// 从配置数据上区分，会按登录名修改处理（目录迁移而非删除）；这是误迁移而非误
// 删除，数据不丢失，且真实使用中删增之间有中间同步，实际几乎不会触发）
/** @type {string | null} */
const legacyText = await readPreviousConfig()
/** @type {{ accountId?: string }[]} */
const legacyDefinitions = legacyText ? JSON.parse(legacyText) : []
if (legacyDefinitions.length === accountIds.length) {
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
}

// 清理已删除账号的运行时目录与工作区（旧配置有、当前账号列表没有的账号）。
// 迁移在前：登录名修改的账号目录已改名，清理遍历旧名时目录不存在，跳过
// 清理本身（access 检查），不会误删已迁移的数据
const legacyAccountIds = legacyDefinitions
  .map((definition) => definition?.accountId ?? '')
  .filter((accountId) => accountId !== '')
for (const removedAccountId of legacyAccountIds) {
  if (accountIds.includes(removedAccountId)) continue
  const removedDirectories = [
    path.join(runtimeRoot, removedAccountId),
    path.join(workspaceRoot, removedAccountId),
  ]
  for (const removedPath of removedDirectories) {
    try {
      await access(removedPath)
    } catch {
      continue
    }
    await rm(removedPath, { recursive: true, force: true })
    console.log(`[和工作] 账号目录清理（账号已删除）：${path.relative(projectRoot, removedPath)}`)
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
