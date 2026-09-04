import type { WeComDirectoryMember } from './wecom-checkin-client.js'
import { WeComDirectoryRepository } from './wecom-directory-repository.js'

export interface WeComDirectoryClient {
  directoryMembers(): Promise<readonly WeComDirectoryMember[]>
}

export interface WeComDirectorySyncResult {
  readonly directoryMembers: number
  readonly candidates: number
  readonly linked: number
  readonly unmatched: number
  readonly ambiguous: number
}

function nameKey(value: string): string {
  return value.replaceAll(/\s+/g, '').toLocaleLowerCase('zh-CN')
}

function grouped<T>(values: readonly T[], key: (value: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>()
  for (const value of values) {
    const groupKey = key(value)
    if (!groupKey) continue
    const current = result.get(groupKey)
    if (current) current.push(value)
    else result.set(groupKey, [value])
  }
  return result
}

// 只在姓名双方均唯一时写入关联，绝不使用企业微信部门覆盖员工档案部门。
export async function synchronizeWeComDirectory(repository: WeComDirectoryRepository, client: WeComDirectoryClient): Promise<WeComDirectorySyncResult> {
  const [employees, members] = await Promise.all([repository.activeEmployees(), client.directoryMembers()])
  const employeesByName = grouped(employees, (employee) => nameKey(employee.displayName))
  const membersByName = grouped(members, (member) => nameKey(member.name))
  let linked = 0
  let unmatched = 0
  let ambiguous = 0
  for (const employee of employees) {
    const key = nameKey(employee.displayName)
    const employeeMatches = employeesByName.get(key) ?? []
    const memberMatches = membersByName.get(key) ?? []
    if (employeeMatches.length !== 1 || memberMatches.length !== 1) {
      if (memberMatches.length === 0) unmatched += 1
      else ambiguous += 1
      continue
    }
    if (employee.wecomUserId === memberMatches[0]!.userId) continue
    if (await repository.linkEmployee(employee.id, memberMatches[0]!.userId)) linked += 1
  }
  return { directoryMembers: members.length, candidates: employees.length, linked, unmatched, ambiguous }
}
