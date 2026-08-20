// 员工管理 / 组织架构数据构建与导出。
import type { EmployeeRecord } from './employee-data'

export interface OrganizationUnit {
  readonly name: string
  readonly employees: readonly EmployeeRecord[]
}

export interface OrganizationDepartment {
  readonly name: string
  readonly units: readonly OrganizationUnit[]
}

export function buildOrganizationChart(employees: readonly EmployeeRecord[]): readonly OrganizationDepartment[] {
  const departments = new Map<string, Map<string, EmployeeRecord[]>>()
  for (const employee of employees) {
    if (employee.status === 'inactive') continue
    const departmentName = employee.departmentName.trim() || '未设置一级部门'
    const unitName = employee.departmentLevel2?.trim() || '未设置二级部门'
    const units = departments.get(departmentName) ?? new Map<string, EmployeeRecord[]>()
    const members = units.get(unitName) ?? []
    members.push(employee)
    units.set(unitName, members)
    departments.set(departmentName, units)
  }
  return [...departments.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'zh-CN'))
    .map(([name, units]) => ({
      name,
      units: [...units.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'zh-CN'))
        .map(([unitName, members]) => ({
          name: unitName,
          employees: [...members].sort((left, right) => left.displayName.localeCompare(right.displayName, 'zh-CN')),
        })),
    }))
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character)
}

export function exportOrganizationChartToPdf(departments: readonly OrganizationDepartment[]): void {
  const printWindow = window.open('', '_blank', 'width=1400,height=900')
  if (!printWindow) return
  const content = departments.map((department) => `<section class="department"><h2>${escapeHtml(department.name)}</h2><div class="units">${department.units.map((unit) => `<article class="unit"><h3>${escapeHtml(unit.name)}</h3><ul>${unit.employees.map((employee) => `<li><strong>${escapeHtml(employee.displayName)}</strong><span>${escapeHtml(employee.jobTitle || '未设置岗位')}</span></li>`).join('')}</ul></article>`).join('')}</div></section>`).join('')
  printWindow.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>组织架构图</title><style>
body{margin:18px;font-family:"PingFang SC","Microsoft YaHei",sans-serif;color:#172b4d}h1{margin:0 0 5px;font-size:21px}p{margin:0 0 18px;color:#667085;font-size:12px}.department{break-inside:avoid;margin:0 0 22px;padding:15px;border:1px solid #bfd5cd;border-radius:10px}.department h2{margin:0 0 12px;padding-bottom:9px;border-bottom:1px solid #dce8e4;font-size:16px}.units{display:flex;flex-wrap:wrap;gap:12px}.unit{min-width:190px;flex:1;border:1px solid #d7e3df;border-radius:8px;overflow:hidden}.unit h3{margin:0;padding:9px 11px;color:#175c4c;font-size:13px;background:#edf7f3}.unit ul{margin:0;padding:6px 11px;list-style:none}.unit li{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #eef2f0;font-size:12px}.unit li:last-child{border:0}.unit span{color:#667085}@page{size:A4 landscape;margin:10mm}</style></head><body><h1>组织架构图</h1><p>按一级部门与二级部门生成</p>${content}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150))</script></body></html>`)
  printWindow.document.close()
}
