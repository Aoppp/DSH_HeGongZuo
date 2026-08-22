import { platformManagementPermissionIds } from '@hegongzuo/employee-domain'

export const accountPermissionIds = platformManagementPermissionIds

/**
 * 权限标识由模块与 Agent 清单扩展；账号层只校验安全格式，避免新增能力时还要改
 * 账号表、登录会话和初始化流程三处白名单。
 */
export type AccountPermissionId = string
const permissionIdPattern = /^[a-z][a-z0-9-]{1,62}$/

export function isAccountPermissionId(value: string): value is AccountPermissionId {
  return permissionIdPattern.test(value)
}

export function parsePermissions(value: unknown): AccountPermissionId[] {
  if (!Array.isArray(value)) throw new Error('请至少选择一项业务权限。')
  const permissions = [...new Set(value.filter((item): item is string => typeof item === 'string'))]
  if (permissions.length === 0) throw new Error('请至少选择一项业务权限。')
  if (permissions.some((permission) => !isAccountPermissionId(permission))) {
    throw new Error('包含不支持的业务权限。')
  }
  return permissions as AccountPermissionId[]
}
