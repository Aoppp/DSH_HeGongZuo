// 员工管理 / 组织架构展示。
import { ArrowLeft, ChevronDown, ChevronRight, Download, Users } from 'lucide-react'
import { useEffect, useState } from 'react'

import { readEmployeesForExport, type EmployeeRecord } from './employee-data'
import { buildOrganizationChart, exportOrganizationChartToPdf, type OrganizationDepartment, type OrganizationUnit } from './organization-chart'
import './organization-chart.css'

interface OrganizationChartProps {
  readonly onBack: () => void
}

function NodeToggle({ expanded, onClick, label }: { readonly expanded: boolean, readonly onClick: () => void, readonly label: string }) {
  return <button className="organization-chart__toggle" type="button" onClick={onClick} aria-expanded={expanded} aria-label={label}>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
}

function EmployeeNode({ employee }: { readonly employee: EmployeeRecord }) {
  return <li className="organization-chart__employee-node"><strong>{employee.displayName}</strong><span>{employee.jobTitle || '未设置岗位'}</span></li>
}

function UnitBranch({ unit, defaultExpanded }: { readonly unit: OrganizationUnit, readonly defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  return <li className="organization-chart__tree-item organization-chart__tree-item--unit">
    <article className="organization-chart__node organization-chart__node--unit">
      <NodeToggle expanded={expanded} onClick={() => setExpanded((value) => !value)} label={`${expanded ? '收起' : '展开'}${unit.name}`} />
      <div><strong>{unit.name}</strong><span>{unit.employees.length} 名员工</span></div>
    </article>
    {expanded && <ul className="organization-chart__children organization-chart__children--employees">{unit.employees.map((employee) => <EmployeeNode key={employee.id} employee={employee} />)}</ul>}
  </li>
}

function DepartmentBranch({ department }: { readonly department: OrganizationDepartment }) {
  const [expanded, setExpanded] = useState(true)
  const memberCount = department.units.reduce((count, unit) => count + unit.employees.length, 0)
  return <li className="organization-chart__tree-item organization-chart__tree-item--department">
    <article className="organization-chart__node organization-chart__node--department">
      <NodeToggle expanded={expanded} onClick={() => setExpanded((value) => !value)} label={`${expanded ? '收起' : '展开'}${department.name}`} />
      <div><strong>{department.name}</strong><span>{department.units.length} 个组别 · {memberCount} 名员工</span></div>
    </article>
    {expanded && <ul className="organization-chart__children">{department.units.map((unit) => <UnitBranch key={unit.name} unit={unit} defaultExpanded={department.units.length === 1} />)}</ul>}
  </li>
}

export function OrganizationChart({ onBack }: OrganizationChartProps) {
  const [employees, setEmployees] = useState<readonly EmployeeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadOrganization = async () => {
    setLoading(true)
    setError(null)
    try { setEmployees(await readEmployeesForExport({ query: '', scope: 'employed', sort: 'departmentName', ascending: true })) } catch (loadError) { setError(loadError instanceof Error ? loadError.message : String(loadError)) } finally { setLoading(false) }
  }
  useEffect(() => { void loadOrganization() }, [])
  const departments = buildOrganizationChart(employees)
  const employeeCount = departments.reduce((count, department) => count + department.units.reduce((unitCount, unit) => unitCount + unit.employees.length, 0), 0)
  return (
    <section className="organization-chart">
      <header className="organization-chart__header">
        <div><p>按部门、二级部门和岗位展示在职员工</p><strong>{departments.length} 个一级部门 · {employeeCount} 名在职员工</strong></div>
        <div><button className="employee-data__secondary" type="button" onClick={onBack}><ArrowLeft size={15} /> 返回员工信息</button><button className="employee-data__primary" type="button" onClick={() => exportOrganizationChartToPdf(departments)}><Download size={15} /> 导出 PDF</button></div>
      </header>
      <div className="organization-chart__canvas" aria-label="组织架构图">
        {loading ? <p className="organization-chart__empty">正在加载组织架构…</p> : error ? <div className="organization-chart__empty"><p>{error}</p><button className="employee-data__secondary" type="button" onClick={() => void loadOrganization()}>重新加载</button></div> : departments.length > 0 ? <div className="organization-chart__tree"><article className="organization-chart__root"><Users size={20} /><div><strong>组织架构</strong><span>在职员工 {employeeCount} 名</span></div></article><ul className="organization-chart__children organization-chart__children--root">{departments.map((department) => <DepartmentBranch key={department.name} department={department} />)}</ul></div> : <p className="organization-chart__empty">暂无在职员工组织信息。</p>}
      </div>
    </section>
  )
}
