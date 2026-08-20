// 员工管理 / 数据列表排序规则。
import type { EmployeeRecord } from './employee-data'

export type SortField = 'hireDate' | 'departureDate' | 'tenure' | 'displayName' | 'departmentName' | 'contractEndDate'

export const sortFieldLabels: Record<SortField, string> = {
  hireDate: '入职时间',
  departureDate: '离职时间',
  tenure: '工龄',
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
  if (field === 'departureDate') {
    // 无离职日期的记录始终排在最后；离职页面默认使用降序展示最新变动。
    if (!a.departureDate && !b.departureDate) return a.displayName.localeCompare(b.displayName, 'zh-CN')
    if (!a.departureDate) return 1
    if (!b.departureDate) return -1
    return a.departureDate.localeCompare(b.departureDate) * direction
      || a.displayName.localeCompare(b.displayName, 'zh-CN')
  }
  if (field === 'tenure') {
    const months = (employee: EmployeeRecord) => {
      if (!employee.hireDate || !employee.departureDate) return null
      const hire = new Date(`${employee.hireDate}T00:00:00`)
      const departure = new Date(`${employee.departureDate}T00:00:00`)
      return (departure.getFullYear() - hire.getFullYear()) * 12 + departure.getMonth() - hire.getMonth() - (departure.getDate() < hire.getDate() ? 1 : 0)
    }
    const left = months(a)
    const right = months(b)
    if (left === null && right === null) return a.displayName.localeCompare(b.displayName, 'zh-CN')
    if (left === null) return 1
    if (right === null) return -1
    return (left - right) * direction || a.displayName.localeCompare(b.displayName, 'zh-CN')
  }
  return a.hireDate.localeCompare(b.hireDate) * direction
    || a.displayName.localeCompare(b.displayName, 'zh-CN')
}
