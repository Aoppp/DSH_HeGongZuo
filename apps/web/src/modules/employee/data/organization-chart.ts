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
  const employeeCount = departments.reduce((count, department) => count + department.units.reduce((unitCount, unit) => unitCount + unit.employees.length, 0), 0)
  const content = departments.map((department) => `<section class="department"><article class="department-node"><div><h2>${escapeHtml(department.name)}</h2><span>${department.units.length} 个二级部门</span></div><b>${department.units.reduce((count, unit) => count + unit.employees.length, 0)} 人</b></article><div class="units">${department.units.map((unit) => `<article class="unit"><header><div><h3>${escapeHtml(unit.name)}</h3><span>${unit.employees.length} 名员工</span></div></header></article>`).join('')}</div></section>`).join('')
  printWindow.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>组织架构图</title><style>
*{box-sizing:border-box}body{margin:18px;font-family:"PingFang SC","Microsoft YaHei",sans-serif;color:#213c34}h1{margin:0 0 5px;font-size:21px}p{margin:0 0 22px;color:#6b7e78;font-size:12px}.root{width:230px;margin:0 auto 24px;padding:12px 15px;border:1px solid #174f43;border-radius:11px;color:#fff;text-align:center;background:linear-gradient(135deg,#153f37,#236b5b)}.root strong,.root span{display:block}.root span{margin-top:3px;font-size:10px;color:#d9ece6}.departments{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:start;gap:16px}.department{min-width:0;break-inside:avoid}.department-node{display:flex;align-items:center;justify-content:space-between;border:1px solid #d6e2de;border-top:3px solid #2c725f;border-radius:10px;padding:9px 11px;background:#fff}.department-node h2,.unit h3{margin:0;font-size:13px}.department-node span,.unit header span{display:block;margin-top:3px;color:#71827d;font-size:9px}.department-node b{border-radius:999px;padding:4px 7px;color:#236b5b;font-size:9px;background:#edf5f2}.units{display:grid;gap:9px;margin-top:10px}.unit{border:1px solid #dde6e3;border-radius:9px;overflow:hidden;background:#fff}.unit header{padding:9px 10px;background:#f5f8f7}@page{size:A4 landscape;margin:10mm}</style></head><body><h1>组织架构图</h1><p>按一级部门和二级部门展示 · 在职员工 ${employeeCount} 名</p><div class="tree"><div class="root"><strong>组织架构</strong><span>${departments.length} 个部门 · ${employeeCount} 名员工</span></div><div class="departments">${content}</div></div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150))</script></body></html>`)
  printWindow.document.close()
}
