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
  const content = departments.map((department) => `<section class="department"><div class="department-line"></div><article class="department-node"><h2>${escapeHtml(department.name)}</h2><span>${department.units.length} 个组别 · ${department.units.reduce((count, unit) => count + unit.employees.length, 0)} 名员工</span></article><div class="units">${department.units.map((unit) => `<article class="unit"><h3>${escapeHtml(unit.name)}</h3><span class="unit-count">${unit.employees.length} 名员工</span><ul>${unit.employees.map((employee) => `<li><strong>${escapeHtml(employee.displayName)}</strong><span>${escapeHtml(employee.jobTitle || '未设置岗位')}</span></li>`).join('')}</ul></article>`).join('')}</div></section>`).join('')
  printWindow.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>组织架构图</title><style>
body{margin:18px;font-family:"PingFang SC","Microsoft YaHei",sans-serif;color:#172b4d}h1{margin:0 0 5px;font-size:21px}p{margin:0 0 22px;color:#667085;font-size:12px}.tree{min-width:1000px}.root{width:210px;margin:0 auto;padding:11px 14px;border:1px solid #174f43;border-radius:8px;color:#fff;text-align:center;background:#1f5d50}.root strong,.root span{display:block}.root span{margin-top:3px;font-size:11px;color:#d9ece6}.departments{display:flex;align-items:flex-start;justify-content:center;gap:16px;margin-top:42px;padding-top:24px;border-top:1px solid #b9c9c1}.department{position:relative;width:250px;break-inside:avoid}.department-line{position:absolute;top:-25px;left:50%;height:25px;border-left:1px solid #b9c9c1}.department-node{border:1px solid #7994b5;border-radius:8px;padding:9px 11px;color:#183c67;background:#f8fbff}.department-node h2{margin:0;font-size:14px}.department-node span,.unit-count{display:block;margin-top:3px;color:#667085;font-size:10px}.units{display:grid;gap:12px;margin:15px 0 0 24px;padding-left:17px;border-left:1px solid #b9c9c1}.unit{position:relative;border:1px solid #a887ba;border-radius:8px;overflow:hidden;background:#fdfaff}.unit:before{position:absolute;top:22px;left:-18px;width:18px;border-top:1px solid #b9c9c1;content:""}.unit h3{margin:0;padding:8px 10px 0;color:#513563;font-size:12px}.unit-count{padding:0 10px 8px}.unit ul{display:grid;gap:6px;margin:0;padding:8px 10px;list-style:none;border-top:1px solid #eadff0;background:#fff}.unit li{border:1px solid #dbb351;border-radius:5px;padding:6px 8px;color:#5a430d;background:#fffdf7;font-size:11px}.unit li strong,.unit li span{display:block}.unit li span{margin-top:2px;color:#7a6950;font-size:10px}@page{size:A4 landscape;margin:10mm}</style></head><body><h1>组织架构图</h1><p>已展开全部部门、组别与员工 · 在职员工 ${employeeCount} 名</p><div class="tree"><div class="root"><strong>组织架构</strong><span>在职员工 ${employeeCount} 名</span></div><div class="departments">${content}</div></div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150))</script></body></html>`)
  printWindow.document.close()
}
