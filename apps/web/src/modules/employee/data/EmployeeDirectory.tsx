// 员工管理 / 数据列表、筛选与分页。
import { ArrowDown, ArrowUp, Download, Eye, Pencil, Plus, Search } from 'lucide-react'
import type { RefObject } from 'react'

import { contractDaysLeft, type EmployeeRecord } from './employee-data'
import { exportEmployeesToExcel, exportEmployeesToPdf } from './export-employees'
import { employmentTypeLabels, pageSizeOptions, sortFieldsFor, statusLabels, type EmployeeScope, type PageMode } from './employee-data-types'
import { sortFieldLabels, type SortField } from './employee-sort'

interface EmployeeDirectoryProps {
  readonly employees: readonly EmployeeRecord[]
  readonly totalEmployees: number
  readonly pageMode: Exclude<PageMode, 'organization'>
  readonly loading: boolean
  readonly error: string | null
  readonly onReload: () => void
  readonly query: string
  readonly onQueryChange: (query: string) => void
  readonly scope: EmployeeScope
  readonly onScopeChange: (scope: EmployeeScope) => void
  readonly sortField: SortField
  readonly onSortFieldChange: (field: SortField) => void
  readonly sortAscending: boolean
  readonly onSortDirectionChange: () => void
  readonly currentPage: number
  readonly totalPages: number
  readonly employeesPerPage: (typeof pageSizeOptions)[number]
  readonly onEmployeesPerPageChange: (count: (typeof pageSizeOptions)[number]) => void
  readonly onPageChange: (page: number) => void
  readonly tableRef: RefObject<HTMLDivElement>
  readonly onView: (employee: EmployeeRecord) => void
  readonly onEdit: (employee: EmployeeRecord) => void
  readonly onDeparture: (employee: EmployeeRecord) => void
  readonly onCreate: () => void
  readonly onExport: () => Promise<readonly EmployeeRecord[]>
}

function tenure(employee: EmployeeRecord): string {
  if (!employee.hireDate) return '—'
  const end = employee.departureDate ? new Date(employee.departureDate) : new Date()
  const start = new Date(employee.hireDate)
  const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()
  return months < 12 ? `${months} 个月` : `${Math.floor(months / 12)} 年 ${months % 12} 个月`
}

export function EmployeeDirectory(props: EmployeeDirectoryProps) {
  const departed = props.scope === 'departed'
  const visible = props.employees
  const start = props.totalEmployees ? (props.currentPage - 1) * props.employeesPerPage + 1 : 0
  const end = Math.min(props.currentPage * props.employeesPerPage, props.totalEmployees)
  const exportFile = async () => { try { await exportEmployeesToExcel(await props.onExport(), props.scope) } catch { /* export helper handles browser errors */ } }
  return <section className="employee-data__panel">
    {props.error && <div className="employee-data__database-error"><span>{props.error}</span><button type="button" onClick={props.onReload}>重新加载</button></div>}
    <div className="employee-data__toolbar">
      <label className="employee-data__search"><Search size={15} /><input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="搜索姓名、邮箱、部门、岗位或地点" /></label>
      <span>显示 {start}–{end} / {props.totalEmployees} 人</span>
      <div className="employee-data__scope" aria-label="员工范围"><button type="button" className={!departed ? 'is-active' : ''} onClick={() => props.onScopeChange('employed')}>在职</button><button type="button" className={departed ? 'is-active' : ''} onClick={() => props.onScopeChange('departed')}>离职</button></div>
      <div className="employee-data__sort"><label>排序<select value={props.sortField} onChange={(event) => props.onSortFieldChange(event.target.value as SortField)}>{sortFieldsFor(props.scope).map((field) => <option key={field} value={field}>{sortFieldLabels[field]}</option>)}</select></label><button type="button" onClick={props.onSortDirectionChange}>{props.sortAscending ? <ArrowUp size={15} /> : <ArrowDown size={15} />}</button></div>
      {props.pageMode === 'directory' && <div className="employee-data__export"><button className="employee-data__secondary" type="button" onClick={() => void exportFile()}><Download size={15} /> 导出 Excel</button><button className="employee-data__secondary" type="button" onClick={() => void props.onExport().then((employees) => exportEmployeesToPdf(employees, props.scope))}>导出 PDF</button></div>}
      {props.pageMode === 'maintenance' && !departed && <button className="employee-data__primary" type="button" onClick={props.onCreate}><Plus size={16} /> 新增员工</button>}
    </div>
    <div className="employee-data__table-wrap" ref={props.tableRef}><table className={`employee-data__table${departed ? ' employee-data__table--departed' : ''}`}><thead><tr>{departed ? <><th>员工</th><th>部门 / 岗位</th><th>联系方式</th><th>入职时间</th><th>离职时间 / 工龄</th><th>离职原因</th><th>{props.pageMode === 'directory' ? '档案' : '操作'}</th></> : <><th>员工</th><th>部门 / 岗位</th><th>联系方式</th><th>用工状态</th><th>入职时间</th><th>合同到期</th><th>{props.pageMode === 'directory' ? '档案' : '操作'}</th></>}</tr></thead><tbody>{visible.map((employee) => <tr key={employee.id}>{departed ? <><td><strong>{employee.displayName}</strong><small>{employee.id}</small></td><td><strong>{employee.departmentName}</strong><small>{employee.jobTitle}</small></td><td><strong>{employee.workPhone}</strong><small>{employee.workEmail ?? '未填写邮箱'}</small></td><td>{employee.hireDate}</td><td><strong>{employee.departureDate ?? '—'}</strong><small>工龄 {tenure(employee)}</small></td><td>{employee.departureReason ?? '—'}</td></> : <><td><strong>{employee.displayName}</strong><small>{employee.id}</small></td><td><strong>{employee.departmentName}</strong><small>{employee.jobTitle}</small></td><td><strong>{employee.workPhone}</strong><small>{employee.workEmail ?? '未填写邮箱'}</small></td><td><span className={`employee-status employee-status--${employee.status}`}>{statusLabels[employee.status]}</span><small>{employmentTypeLabels[employee.employmentType]}</small></td><td>{employee.hireDate}</td><td>{employee.contractEndDate ? <><strong>{employee.contractEndDate}</strong><small>{(() => { const days = contractDaysLeft(employee.contractEndDate); return days === null ? '' : days < 0 ? `已到期 ${-days} 天` : `剩余 ${days} 天` })()}</small></> : '—'}</td></>}<td><div className="employee-data__row-actions">{props.pageMode === 'directory' ? <button type="button" title="查看员工档案" onClick={() => props.onView(employee)}><Eye size={14} /></button> : <><button type="button" title="编辑" onClick={() => props.onEdit(employee)}><Pencil size={14} /></button>{employee.status !== 'inactive' && <button className="is-danger employee-data__departure" type="button" onClick={() => props.onDeparture(employee)}>员工离职</button>}</>}</div></td></tr>)}</tbody></table>{props.loading ? <div className="employee-data__empty">正在加载员工数据…</div> : visible.length === 0 && <div className="employee-data__empty">没有找到匹配的员工</div>}</div>
    {!props.loading && visible.length > 0 && <nav className="employee-data__pagination" aria-label="员工分页"><div className="employee-data__pagination-summary"><span>第 {props.currentPage} / {props.totalPages} 页</span><label>每页<select value={props.employeesPerPage} onChange={(event) => props.onEmployeesPerPageChange(Number(event.target.value) as (typeof pageSizeOptions)[number])}>{pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}</select>人</label></div><div className="employee-data__pagination-actions"><button type="button" disabled={props.currentPage === 1} onClick={() => props.onPageChange(props.currentPage - 1)}>上一页</button><button type="button" disabled={props.currentPage === props.totalPages} onClick={() => props.onPageChange(props.currentPage + 1)}>下一页</button></div></nav>}
  </section>
}
