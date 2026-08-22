import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

/** 从所有 Agent 清单读取权限标识；新增 Agent 无需再改账号运行时判断逻辑。 */
export async function registeredAgentPermissionIds(projectRoot: string): Promise<readonly string[]> {
  const packagesDirectory = path.join(projectRoot, 'packages')
  const entries = await readdir(packagesDirectory, { withFileTypes: true })
  const permissionIds = new Set<string>()
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const raw = JSON.parse(await readFile(path.join(packagesDirectory, entry.name, 'hegongzuo-agent.json'), 'utf8')) as unknown
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('清单必须为对象。')
      const permissionId = (raw as Record<string, unknown>).permissionId
      if (typeof permissionId !== 'string' || !/^[a-z][a-z0-9-]{1,62}$/.test(permissionId)) throw new Error('缺少有效 permissionId。')
      permissionIds.add(permissionId)
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue
      throw new Error(`无法读取 Agent 清单 ${entry.name}：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return [...permissionIds].sort()
}
