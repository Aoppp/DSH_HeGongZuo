import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { projectRoot } from './account-agent-runtime-paths-base.mjs'

const packagesDirectory = path.join(projectRoot, 'packages')
const identifier = /^[a-z][a-z0-9-]{1,62}$/

/** @typedef {{ id: string, permissionId: string, runtime: 'dsh-web', apiBasePath: string, packageDirectory: string }} AgentManifest */

/**
 * 读取项目内所有 Agent 清单。新增 DSH 网页 Agent 时，只需在 packages/<name>/
 * 添加 hegongzuo-agent.json；运行时同步器会在部署后自动发现它。
 */
export async function agentRuntimeRegistry() {
  const packageNames = await readdir(packagesDirectory, { withFileTypes: true })
  /** @type {AgentManifest[]} */
  const manifests = []
  for (const entry of packageNames) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(packagesDirectory, entry.name, 'hegongzuo-agent.json')
    let raw
    try {
      raw = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue
      throw new Error(`无法读取 Agent 清单 ${path.relative(projectRoot, manifestPath)}：${error instanceof Error ? error.message : String(error)}`)
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Agent 清单格式无效：${path.relative(projectRoot, manifestPath)}`)
    const manifest = raw
    if (typeof manifest.id !== 'string' || !identifier.test(manifest.id)) throw new Error(`Agent 清单缺少有效 id：${path.relative(projectRoot, manifestPath)}`)
    if (typeof manifest.permissionId !== 'string' || !identifier.test(manifest.permissionId)) throw new Error(`Agent ${manifest.id} 缺少有效 permissionId。`)
    if (manifest.runtime !== 'dsh-web') throw new Error(`Agent ${manifest.id} 的 runtime 必须为 dsh-web。`)
    if (typeof manifest.apiBasePath !== 'string' || !manifest.apiBasePath.startsWith('/')) throw new Error(`Agent ${manifest.id} 缺少有效 apiBasePath。`)
    manifests.push({
      id: manifest.id,
      permissionId: manifest.permissionId,
      runtime: manifest.runtime,
      apiBasePath: manifest.apiBasePath,
      packageDirectory: path.relative(projectRoot, path.join(packagesDirectory, entry.name)),
    })
  }
  const ids = new Set()
  for (const manifest of manifests) {
    if (ids.has(manifest.id)) throw new Error(`Agent id 重复：${manifest.id}`)
    ids.add(manifest.id)
  }
  return manifests.sort((left, right) => left.id.localeCompare(right.id))
}

/** @param {string} agentId @param {string} accountId */
export function runtimeId(agentId, accountId) {
  if (!identifier.test(agentId) || !/^[a-z][a-z0-9]{1,31}$/.test(accountId)) throw new Error('Agent 或账号标识无效。')
  return `${agentId}--${accountId}`
}
