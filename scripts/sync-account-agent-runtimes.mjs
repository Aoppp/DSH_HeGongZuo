// 从账号权限与 packages/*/hegongzuo-agent.json 生成统一 Agent 运行时配置。
// 新增同类 Agent 只需提交清单；无需修改本同步器或服务器 systemd 单元。
import { access, appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { pool } from '../apps/api/scripts/database.mjs'
import { projectRoot } from './account-agent-runtime-paths-base.mjs'
import { agentRuntimeRegistry, runtimeId } from './agent-runtime-registry.mjs'

const runtimeDirectory = path.join(projectRoot, '.runtime')
const generatedPath = path.join(runtimeDirectory, 'agent-runtimes.json')
const legacyPath = path.join(runtimeDirectory, 'account-agent-runtimes.json')
const runtimeRoot = path.join(runtimeDirectory, 'dsh')
const workspaceRoot = path.join(runtimeDirectory, 'workspaces')
const sandboxRoot = path.join(runtimeDirectory, 'agent-sandboxes')
const manifests = await agentRuntimeRegistry()

const permissionManifests = manifests.filter((manifest) => manifest.access === 'permission')
const baseManifests = manifests.filter((manifest) => manifest.access === 'base')
const permissionIds = permissionManifests.map((manifest) => manifest.permissionId)
const rows = permissionIds.length === 0 ? [] : (await pool.query(
  `SELECT a.account_id, a.created_at, a.id, p.permission_id
   FROM accounts a
   JOIN account_module_permissions p ON p.account_id = a.id
   -- 初始化期间也必须保留运行时定义：否则同步器会清理正在更新账号的服务目录，
   -- 导致账号恢复为正常后仍无法重新连接。
   WHERE a.status IN ('active', 'initializing') AND p.permission_id = ANY($1::text[])
   ORDER BY a.created_at, a.id, p.permission_id`,
  [permissionIds],
)).rows
const activeAccounts = baseManifests.length === 0 ? [] : (await pool.query(
  `SELECT account_id, created_at, id
     FROM accounts
    WHERE status IN ('active', 'initializing')
    ORDER BY created_at, id`,
)).rows

const manifestByPermission = new Map(manifests.map((manifest) => [manifest.permissionId, manifest]))
const requested = [
  ...baseManifests.flatMap((manifest) => activeAccounts.map((account) => ({ ...manifest, accountId: account.account_id, runtimeId: runtimeId(manifest.id, account.account_id) }))),
  ...rows.map((row) => {
  const manifest = manifestByPermission.get(row.permission_id)
  if (!manifest) throw new Error(`账号权限 ${row.permission_id} 没有对应 Agent 清单。`)
  return { ...manifest, accountId: row.account_id, runtimeId: runtimeId(manifest.id, row.account_id) }
  }),
].sort((left, right) => left.runtimeId.localeCompare(right.runtimeId))

let previous = []
try {
  const parsed = JSON.parse(await readFile(generatedPath, 'utf8'))
  if (Array.isArray(parsed)) previous = parsed
} catch (error) {
  if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
}
const previousPorts = new Map(previous
  .filter((item) => item && typeof item === 'object' && typeof item.runtimeId === 'string' && typeof item.port === 'number')
  .map((item) => [item.runtimeId, item.port]))
const usedPorts = new Set(previousPorts.values())
let nextPort = 3180
function availablePort() {
  while (usedPorts.has(nextPort)) nextPort += 1
  const port = nextPort
  usedPorts.add(port)
  nextPort += 1
  return port
}

const definitions = requested.map((request) => {
  const port = previousPorts.get(request.runtimeId) ?? availablePort()
  const sandboxDirectory = `.runtime/agent-sandboxes/${request.runtimeId}`
  return {
    runtimeId: request.runtimeId,
    agentId: request.id,
    accountId: request.accountId,
    permissionId: request.permissionId,
    access: request.access,
    runtime: request.runtime,
    port,
    apiBasePath: request.apiBasePath.replace('{accountId}', request.accountId),
    packageDirectory: request.packageDirectory,
    dshDirectory: `${sandboxDirectory}/dsh`,
    workspaceDirectory: `${sandboxDirectory}/workspace`,
  }
})

const previousByRuntimeId = new Map(previous
  .filter((item) => item && typeof item === 'object' && typeof item.runtimeId === 'string')
  .map((item) => [item.runtimeId, item]))
const relocatedRuntimeIds = []
for (const definition of definitions) {
  const prior = previousByRuntimeId.get(definition.runtimeId)
  const oldDshDirectory = typeof prior?.dshDirectory === 'string'
    ? path.resolve(projectRoot, prior.dshDirectory)
    : path.join(runtimeRoot, definition.agentId, definition.accountId)
  const oldWorkspaceDirectory = typeof prior?.workspaceDirectory === 'string'
    ? path.resolve(projectRoot, prior.workspaceDirectory)
    : path.join(workspaceRoot, definition.agentId, definition.accountId)
  const newDshDirectory = path.resolve(projectRoot, definition.dshDirectory)
  const newWorkspaceDirectory = path.resolve(projectRoot, definition.workspaceDirectory)
  for (const [oldPath, newPath] of [[oldDshDirectory, newDshDirectory], [oldWorkspaceDirectory, newWorkspaceDirectory]]) {
    if (oldPath === newPath) continue
    try { await access(oldPath) } catch { continue }
    try { await access(newPath) } catch {
      await mkdir(path.dirname(newPath), { recursive: true })
      await rename(oldPath, newPath)
      relocatedRuntimeIds.push(definition.runtimeId)
    }
  }
}

// 仅对既有员工 Agent 保持旧配置文件，避免正在使用的前端代理和本地开发命令中断。
const employeeDefinitions = definitions.filter((definition) => definition.agentId === 'employee-query')

// 迁移旧员工运行目录到按 Agent 隔离的新目录；不存在时不做任何删除或覆盖。
for (const definition of employeeDefinitions) {
  /** @type {[string, string][]} */
  const pairs = [
    [path.join(runtimeRoot, definition.accountId), path.join(runtimeRoot, definition.agentId, definition.accountId)],
    [path.join(workspaceRoot, definition.accountId, 'employee-agent'), path.join(workspaceRoot, definition.agentId, definition.accountId)],
  ]
  for (const [oldPath, newPath] of pairs) {
    try { await access(oldPath) } catch { continue }
    try { await access(newPath) } catch {
      await mkdir(path.dirname(newPath), { recursive: true })
      await rename(oldPath, newPath)
    }
  }
}

const desiredIds = new Set(definitions.map((definition) => definition.runtimeId))
for (const oldDefinition of previous) {
  if (!oldDefinition || typeof oldDefinition !== 'object' || typeof oldDefinition.runtimeId !== 'string' || desiredIds.has(oldDefinition.runtimeId)) continue
  if (typeof oldDefinition.agentId !== 'string' || typeof oldDefinition.accountId !== 'string') continue
  for (const target of [path.join(runtimeRoot, oldDefinition.agentId, oldDefinition.accountId), path.join(workspaceRoot, oldDefinition.agentId, oldDefinition.accountId)]) {
    try { await access(target) } catch { continue }
    await rm(target, { recursive: true, force: true })
    console.log(`[和工作] Agent 运行目录清理：${path.relative(projectRoot, target)}`)
  }
}

await mkdir(runtimeDirectory, { recursive: true })
await writeFile(generatedPath, `${JSON.stringify(definitions, null, 2)}\n`, 'utf8')
await writeFile(legacyPath, `${JSON.stringify(employeeDefinitions.map(({ runtimeId: _runtimeId, agentId: _agentId, permissionId: _permissionId, runtime: _runtime, packageDirectory: _packageDirectory, ...definition }) => definition), null, 2)}\n`, 'utf8')
console.log(`[和工作] Agent 运行时配置已同步（${definitions.length} 个实例）：${definitions.map((definition) => `${definition.runtimeId}→${definition.port}`).join('、')}。`)
if (relocatedRuntimeIds.length > 0) {
  await appendFile(path.join(runtimeDirectory, 'agent-restart-request'), `${[...new Set(relocatedRuntimeIds)].join('\n')}\n`, 'utf8')
}

await pool.end()
