import { ArrowLeft, Download } from 'lucide-react'

import type { EmployeeRecord } from './employee-data'
import { buildOrganizationChart, exportOrganizationChartToPdf } from './organization-chart'
import './organization-chart.css'

interface OrganizationChartProps {
  readonly employees: readonly EmployeeRecord[]
  readonly onBack: () => void
}

export function OrganizationChart({ employees, onBack }: OrganizationChartProps) {
  const departments = buildOrganizationChart(employees)
  const employeeCount = departments.reduce((count, department) => count + department.units.reduce((unitCount, unit) => unitCount + unit.employees.length, 0), 0)
  return (
    <section className="organization-chart">
      <header className="organization-chart__header">
        <div><p>按一级部门与二级部门展示在职员工</p><strong>{departments.length} 个一级部门 · {employeeCount} 名在职员工</strong></div>
        <div><button className="employee-data__secondary" type="button" onClick={onBack}><ArrowLeft size={15} /> 返回员工信息</button><button className="employee-data__primary" type="button" onClick={() => exportOrganizationChartToPdf(departments)}><Download size={15} /> 导出 PDF</button></div>
      </header>
      <div className="organization-chart__canvas">
        {departments.map((department) => <section className="organization-chart__department" key={department.name}><h2>{department.name}</h2><div>{department.units.map((unit) => <article className="organization-chart__unit" key={unit.name}><h3>{unit.name}</h3><ul>{unit.employees.map((employee) => <li key={employee.id}><strong>{employee.displayName}</strong><span>{employee.jobTitle || '未设置岗位'}</span></li>)}</ul></article>)}</div></section>)}
        {departments.length === 0 && <p className="organization-chart__empty">暂无在职员工组织信息。</p>}
      </div>
    </section>
  )
}
