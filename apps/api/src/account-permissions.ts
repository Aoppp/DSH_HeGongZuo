import { platformManagementPermissionIds, type PlatformManagementPermissionId } from '@hegongzuo/employee-domain'

export const accountPermissionIds = platformManagementPermissionIds

export type AccountPermissionId = PlatformManagementPermissionId

export function parsePermissions(value: unknown): AccountPermissionId[] {
  if (!Array.isArray(value)) throw new Error('请至少选择一项业务权限。')
  const permissions = [...new Set(value.filter((item): item is string => typeof item === 'string'))]
  if (permissions.length === 0) throw new Error('请至少选择一项业务权限。')
  if (permissions.some((permission) => !accountPermissionIds.includes(permission as AccountPermissionId))) {
    throw new Error('包含不支持的业务权限。')
  }
  return permissions as AccountPermissionId[]
}
