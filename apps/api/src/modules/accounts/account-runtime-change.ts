import type { AccountRecord } from '../../accounts.js'

/** 仅当任一已注册 Agent 的身份或授权发生变化时，才需要同步运行时。 */
export function runtimeChangeForAccountUpdate(previous: AccountRecord, updated: AccountRecord, agentPermissionIds: readonly string[]): { readonly sync: boolean; readonly provision: boolean } {
  const agentPermissions = new Set(agentPermissionIds)
  const previouslyEnabled = previous.permissions.filter((permission) => agentPermissions.has(permission))
  const currentlyEnabled = updated.permissions.filter((permission) => agentPermissions.has(permission))
  const accountIdChanged = previous.accountId !== updated.accountId
  const permissionsChanged = previouslyEnabled.length !== currentlyEnabled.length || previouslyEnabled.some((permission) => !currentlyEnabled.includes(permission))
  const sync = permissionsChanged || accountIdChanged
  return { sync, provision: sync && currentlyEnabled.length > 0 }
}
