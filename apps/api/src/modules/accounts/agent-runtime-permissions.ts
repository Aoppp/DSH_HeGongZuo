import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export interface RegisteredAgentPermission {
  readonly id: string
  readonly permissionId: string
  readonly label: string
}

/** 读取全部已注册 Agent 的账号权限与展示名称。 */
export async function registeredAgentPermissions(projectRoot: string): Promise<readonly RegisteredAgentPermission[]> {
  const packagesDirectory = path.join(projectRoot, 'packages')
  const entries = await readdir(packagesDirectory, { withFileTypes: true })
  const agents: RegisteredAgentPermission[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const raw = JSON.parse(await readFile(path.join(packagesDirectory, entry.name, 'hegongzuo-agent.json'), 'utf8')) as unknown
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('清单必须为对象。')
      const manifest = raw as Record<string, unknown>
      const id = manifest.id
      const permissionId = manifest.permissionId
      const label = manifest.label
      if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{1,62}$/.test(id)) throw new Error('缺少有效 id。')
      if (typeof permissionId !== 'string' || !/^[a-z][a-z0-9-]{1,62}$/.test(permissionId)) throw new Error('缺少有效 permissionId。')
      const access = manifest.access === undefined ? 'permission' : manifest.access
      if (access !== 'permission' && access !== 'base') throw new Error('access 必须为 permission 或 base。')
      if (access === 'base') continue
      agents.push({ id, permissionId, label: typeof label === 'string' && label.trim() ? label.trim() : id })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue
      throw new Error(`无法读取 Agent 清单 ${entry.name}：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return agents.sort((left, right) => left.id.localeCompare(right.id))
}

/** 从所有 Agent 清单读取权限标识；新增 Agent 无需再改账号运行时判断逻辑。 */
export async function registeredAgentPermissionIds(projectRoot: string): Promise<readonly string[]> {
  return [...new Set((await registeredAgentPermissions(projectRoot)).map((agent) => agent.permissionId))].sort()
}
