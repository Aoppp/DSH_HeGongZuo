import type { AccountRecord } from '../../accounts.js'

/** 仅当员工查询运行空间的身份或授权发生变化时，才需要同步运行时。 */
export function runtimeChangeForAccountUpdate(previous: AccountRecord, updated: AccountRecord): { readonly sync: boolean; readonly provision: boolean } {
  const previouslyEnabled = previous.permissions.includes('employee-query')
  const currentlyEnabled = updated.permissions.includes('employee-query')
  const accountIdChanged = previous.accountId !== updated.accountId
  const sync = previouslyEnabled !== currentlyEnabled || accountIdChanged
  return { sync, provision: sync && currentlyEnabled }
}
