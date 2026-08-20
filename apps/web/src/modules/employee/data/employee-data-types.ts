// 员工管理 / 数据模块共享展示类型。
import type { EmployeeRecord } from './employee-data'
import type { SortField } from './employee-sort'

export type PageMode = 'directory' | 'maintenance' | 'organization'
export type EditorMode = 'view' | 'create' | 'edit' | 'departure'
export type EmployeeScope = 'employed' | 'departed'
export const pageSizeOptions = [10, 20, 50, 100] as const

export const statusLabels = {
  probation: '试用期',
  active: '在职',
  on_leave: '休假',
  inactive: '离职',
} as const

export const employmentTypeLabels = {
  full_time: '全职',
  part_time: '兼职',
  contractor: '外包',
  intern: '实习',
} as const

export function matchesEmployeeQuery(employee: EmployeeRecord, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  if (!normalized) return true
  return [employee.displayName, employee.workEmail ?? '', employee.personalEmail ?? '', employee.departmentName,
    employee.departmentLevel2 ?? '', employee.jobTitle, employee.workLocation, employee.companyName ?? '', employee.responsibilities]
    .some((value) => value.toLocaleLowerCase('zh-CN').includes(normalized))
}

export function sortFieldsFor(scope: EmployeeScope): readonly SortField[] {
  return scope === 'departed'
    ? ['departureDate', 'tenure']
    : ['hireDate', 'displayName', 'departmentName', 'contractEndDate']
}
