import type { EmployeeRecord } from './employee-data'

export type SortField = 'hireDate' | 'displayName' | 'departmentName' | 'contractEndDate'

export const sortFieldLabels: Record<SortField, string> = {
  hireDate: '入职时间',
  displayName: '姓名',
  departmentName: '部门',
  contractEndDate: '合同到期',
}

export function compareEmployees(a: EmployeeRecord, b: EmployeeRecord, field: SortField, ascending: boolean): number {
  const direction = ascending ? 1 : -1
  if (field === 'displayName') {
    return a.displayName.localeCompare(b.displayName, 'zh-CN') * direction
  }
  if (field === 'departmentName') {
    const aKey = `${a.departmentName}${a.departmentLevel2 ?? ''}`
    const bKey = `${b.departmentName}${b.departmentLevel2 ?? ''}`
    return aKey.localeCompare(bKey, 'zh-CN') * direction
      || a.displayName.localeCompare(b.displayName, 'zh-CN')
  }
  if (field === 'contractEndDate') {
    // 无合同到期日期的记录始终排在最后
    if (!a.contractEndDate && !b.contractEndDate) return a.displayName.localeCompare(b.displayName, 'zh-CN')
    if (!a.contractEndDate) return 1
    if (!b.contractEndDate) return -1
    return a.contractEndDate.localeCompare(b.contractEndDate) * direction
  }
  return a.hireDate.localeCompare(b.hireDate) * direction
    || a.displayName.localeCompare(b.displayName, 'zh-CN')
}
