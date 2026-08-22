import type { ModuleId } from './types'

export async function readPlatformAccess(): Promise<readonly ModuleId[]> {
  const response = await fetch('/api/platform/access', { credentials: 'same-origin' })
  if (!response.ok) throw new Error('无法读取平台模块状态。')
  return (await response.json() as { disabledModuleIds: ModuleId[] }).disabledModuleIds
}
