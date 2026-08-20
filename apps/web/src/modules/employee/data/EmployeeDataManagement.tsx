// 员工管理 / 数据页面编排。
import { ArrowLeft, Eye, Network, Settings2 } from 'lucide-react'
import { useState } from 'react'

import { EmployeeDirectory } from './EmployeeDirectory'
import { EmployeeEditor } from './EmployeeEditor'
import { OrganizationChart } from './OrganizationChart'
import { readEmployeesForExport } from './employee-data'
import type { PageMode } from './employee-data-types'
import { useEmployeeDataManagement } from './use-employee-data-management'

interface EmployeeDataManagementProps {
  readonly backLabel?: string
  readonly onBack: () => void
}

export function EmployeeDataManagement({ backLabel = '返回员工查询', onBack }: EmployeeDataManagementProps) {
  const [pageMode, setPageMode] = useState<PageMode>('directory')
  const management = useEmployeeDataManagement()
  const departed = management.employeeScope === 'departed'
  const pageTitle = pageMode === 'organization' ? '组织架构图' : pageMode === 'maintenance' ? '员工数据维护' : departed ? '离职人员档案' : '在职员工信息'
  const pageDescription = pageMode === 'organization' ? null : pageMode === 'maintenance' ? '在系统中查询、新增、查看、编辑或办理员工离职。' : management.loading ? '正在加载员工信息…' : departed ? `当前共 ${management.totalEmployees} 名离职人员，按离职时间排序。` : `当前共 ${management.totalEmployees} 名在职员工，查看员工档案与组织信息。`
  const switchScope = (scope: typeof management.employeeScope) => { management.setEmployeeScope(scope); management.setSortField(scope === 'departed' ? 'departureDate' : 'hireDate'); management.setSortAscending(scope !== 'departed') }
  const changePage = (page: number) => { management.setCurrentPage(page); requestAnimationFrame(() => management.tableWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }
  const editPreview = () => { if (!management.draft) return; setPageMode('maintenance'); management.openEditor('edit', management.draft) }
  return <div className="employee-data module-page">
    <header className="employee-data__header"><div className="employee-data__title"><button className="employee-data__back" type="button" onClick={onBack}><ArrowLeft size={16} /> {backLabel}</button><h1>{pageTitle}</h1>{pageDescription && <p>{pageDescription}</p>}</div><div className="employee-data__header-actions">{pageMode === 'directory' ? <><button className="employee-data__secondary" type="button" onClick={() => setPageMode('organization')}><Network size={16} /> 组织架构</button><button className="employee-data__primary" type="button" onClick={() => setPageMode('maintenance')}><Settings2 size={16} /> 进入维护</button></> : pageMode === 'maintenance' ? <button className="employee-data__secondary" type="button" onClick={() => { setPageMode('directory'); management.closeEditor() }}><Eye size={16} /> 退出维护</button> : null}</div></header>
    {pageMode === 'organization' ? <OrganizationChart onBack={() => setPageMode('directory')} /> : <EmployeeDirectory employees={management.pageEmployees} totalEmployees={management.totalEmployees} pageMode={pageMode} loading={management.loading} error={management.dataError} onReload={() => void management.loadEmployees()} query={management.query} onQueryChange={management.setQuery} scope={management.employeeScope} onScopeChange={switchScope} sortField={management.sortField} onSortFieldChange={management.setSortField} sortAscending={management.sortAscending} onSortDirectionChange={() => management.setSortAscending((value) => !value)} currentPage={management.currentPage} totalPages={management.totalPages} employeesPerPage={management.employeesPerPage} onEmployeesPerPageChange={management.setEmployeesPerPage} onPageChange={changePage} tableRef={management.tableWrapRef} onView={(employee) => management.openEditor('view', employee)} onEdit={(employee) => management.openEditor('edit', employee)} onDeparture={management.openDepartureEditor} onCreate={() => management.openEditor('create')} onExport={() => readEmployeesForExport({ query: management.query, scope: management.employeeScope, sort: management.sortField, ascending: management.sortAscending })} />}
    <EmployeeEditor mode={management.editorMode} draft={management.draft} error={management.formError} saving={management.saving} pendingResume={management.pendingResume} resumeInputKey={management.resumeInputKey} onClose={management.closeEditor} onSubmit={(event) => { void management.saveEmployee(event) }} onEdit={editPreview} onUpdate={management.updateDraft} onSelectResume={management.selectResume} onRemoveResume={management.removeResume} />
  </div>
}
