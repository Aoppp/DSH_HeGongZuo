import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Download,
  Eye,
  FileText,
  Network,
  Pencil,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  contractDaysLeft,
  createEmployeeRecord,
  departEmployeeRecord,
  employeeAge,
  employeeResumeUrl,
  employeeStatuses,
  employmentTypes,
  nextEmployeeIdentity,
  readEmployeeRecords,
  resumeUploadPayload,
  tenureMonths,
  updateEmployeeRecord,
  type EmployeeRecord,
  type EmployeeStatus,
  type EmploymentType,
} from './employee-data'
import { MaskedText } from './MaskedText'
import { OrganizationChart } from './OrganizationChart'
import { exportEmployeesToExcel, exportEmployeesToPdf } from './export-employees'
import { compareEmployees, sortFieldLabels, type SortField } from './employee-sort'

const statusLabels: Record<EmployeeStatus, string> = {
  probation: '试用期',
  active: '在职',
  on_leave: '休假',
  inactive: '离职',
}

const employmentTypeLabels: Record<EmploymentType, string> = {
  full_time: '全职',
  part_time: '兼职',
  contractor: '外包',
  intern: '实习',
}

type PageMode = 'directory' | 'maintenance' | 'organization'
type EditorMode = 'view' | 'create' | 'edit' | 'departure'
type EmployeeScope = 'employed' | 'departed'
const pageSizeOptions = [10, 20, 50, 100] as const

interface EmployeeDataManagementProps {
  readonly backLabel?: string
  readonly onBack: () => void
}

function matchesQuery(employee: EmployeeRecord, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  if (!normalized) return true
  return [
    employee.displayName,
    employee.workEmail ?? '',
    employee.personalEmail ?? '',
    employee.departmentName,
    employee.departmentLevel2 ?? '',
    employee.jobTitle,
    employee.workLocation,
    employee.companyName ?? '',
    employee.responsibilities,
  ].some((value) => value.toLocaleLowerCase('zh-CN').includes(normalized))
}

function emptyEmployee(employees: readonly EmployeeRecord[]): EmployeeRecord {
  const identity = nextEmployeeIdentity(employees)
  return {
    ...identity,
    displayName: '',
    workEmail: null,
    workPhone: '',
    departmentName: '',
    jobTitle: '',
    employmentType: 'full_time',
    status: 'active',
    hireDate: '',
    workLocation: '',
    responsibilities: '',
    resumeFileName: null,
    resumeMimeType: null,
    resumeSize: null,
    companyName: null,
    gender: null,
    idNumber: null,
    birthDate: null,
    personalEmail: null,
    education: null,
    major: null,
    school: null,
    graduationDate: null,
    maritalStatus: null,
    hasChildren: null,
    hometown: null,
    emergencyContact: null,
    emergencyContactPhone: null,
    residentialAddress: null,
    idAddress: null,
    bankAccount: null,
    bankName: null,
    archiveNo: null,
    notes: null,
    departmentLevel2: null,
    probationMonths: null,
    expectedRegularDate: null,
    actualRegularDate: null,
    contractEndDate: null,
  }
}

function validateEmployee(draft: EmployeeRecord, employees: readonly EmployeeRecord[]): string | null {
  const requiredValues = [
    draft.displayName,
    draft.workPhone,
    draft.departmentName,
    draft.jobTitle,
    draft.hireDate,
  ]
  if (requiredValues.some((value) => !value.trim())) return '请填写全部必填字段。'
  if (draft.workEmail && employees.some((employee) => employee.id !== draft.id && employee.workEmail?.toLocaleLowerCase() === draft.workEmail?.trim().toLocaleLowerCase())) {
    return '工作邮箱不能重复。'
  }
  if (draft.idNumber && employees.some((employee) => employee.id !== draft.id && employee.idNumber?.trim() === draft.idNumber?.trim())) {
    return '身份证号不能重复。'
  }
  return null
}

// 档案字段分组：任职 / 身份 / 联系 / 教育 / 财务
const activeArchiveSections = [
  {
    title: '任职信息',
    items: [
      { label: '所属公司', field: 'companyName' },
      { label: '一级部门', field: 'departmentName' },
      { label: '二级部门', field: 'departmentLevel2' },
      { label: '岗位', field: 'jobTitle' },
      { label: '用工类型', field: 'employmentType' },
      { label: '状态', field: 'status' },
      { label: '入职时间', field: 'hireDate' },
      { label: '试用期（月）', field: 'probationMonths' },
      { label: '预计转正', field: 'expectedRegularDate' },
      { label: '实际转正', field: 'actualRegularDate' },
      { label: '合同到期', field: 'contractEndDate' },
      { label: '档案编号', field: 'archiveNo' },
      { label: '工作地点', field: 'workLocation' },
    ],
  },
  {
    title: '身份信息',
    items: [
      { label: '性别', field: 'gender' },
      { label: '出生日期', field: 'birthDate' },
      { label: '身份证', field: 'idNumber' },
      { label: '籍贯', field: 'hometown' },
      { label: '婚否', field: 'maritalStatus' },
      { label: '育否', field: 'hasChildren' },
      { label: '居住住址', field: 'residentialAddress' },
      { label: '身份证地址', field: 'idAddress' },
    ],
  },
  {
    title: '联系方式',
    items: [
      { label: '工作电话', field: 'workPhone' },
      { label: '个人邮箱', field: 'personalEmail' },
      { label: '企业邮箱', field: 'workEmail' },
      { label: '紧急联系人', field: 'emergencyContact' },
      { label: '紧急联系人电话', field: 'emergencyContactPhone' },
    ],
  },
  {
    title: '教育背景',
    items: [
      { label: '学历', field: 'education' },
      { label: '专业', field: 'major' },
      { label: '毕业学校', field: 'school' },
      { label: '毕业时间', field: 'graduationDate' },
    ],
  },
  {
    title: '财务信息',
    items: [
      { label: '银行卡', field: 'bankAccount' },
      { label: '开户行', field: 'bankName' },
    ],
  },
] as const

const departureArchiveSections = [
  {
    title: '任职与离职信息',
    items: [
      { label: '所属公司', field: 'companyName' }, { label: '一级部门', field: 'departmentName' },
      { label: '二级部门', field: 'departmentLevel2' }, { label: '岗位', field: 'jobTitle' },
      { label: '用工类型', field: 'employmentType' }, { label: '入职时间', field: 'hireDate' },
      { label: '离职日期', field: 'departureDate' }, { label: '离职原因', field: 'departureReason' },
      { label: '档案编号', field: 'archiveNo' },
    ],
  },
  {
    title: '身份信息',
    items: [
      { label: '性别', field: 'gender' }, { label: '出生日期', field: 'birthDate' },
      { label: '身份证', field: 'idNumber' }, { label: '籍贯', field: 'hometown' },
      { label: '婚否', field: 'maritalStatus' }, { label: '育否', field: 'hasChildren' },
      { label: '居住住址', field: 'residentialAddress' }, { label: '身份证地址', field: 'idAddress' },
    ],
  },
  {
    title: '联系方式',
    items: [
      { label: '工作电话', field: 'workPhone' }, { label: '个人邮箱', field: 'personalEmail' },
      { label: '企业邮箱', field: 'workEmail' }, { label: '紧急联系人', field: 'emergencyContact' },
      { label: '紧急联系人电话', field: 'emergencyContactPhone' },
    ],
  },
  {
    title: '教育背景',
    items: [
      { label: '学历', field: 'education' }, { label: '专业', field: 'major' },
      { label: '毕业学校', field: 'school' }, { label: '毕业时间', field: 'graduationDate' },
    ],
  },
  {
    title: '财务信息',
    items: [{ label: '银行卡', field: 'bankAccount' }, { label: '开户行', field: 'bankName' }],
  },
] as const

const sensitiveMasks: Partial<Record<keyof EmployeeRecord, 'idNumber' | 'bankAccount' | 'address'>> = {
  idNumber: 'idNumber',
  bankAccount: 'bankAccount',
  residentialAddress: 'address',
  idAddress: 'address',
}

function archiveFieldValue(employee: EmployeeRecord, field: keyof EmployeeRecord, employees: readonly EmployeeRecord[]): ReactNode {
  const value = employee[field]
  const mask = sensitiveMasks[field]
  if (mask) return <MaskedText value={typeof value === 'string' ? value : null} kind={mask} />
  if (field === 'employmentType') return value ? employmentTypeLabels[value as EmploymentType] : '—'
  if (field === 'status') return value ? statusLabels[value as EmployeeStatus] : '—'
  if (field === 'birthDate') {
    if (!value) return '—'
    const age = employeeAge(employee.birthDate)
    return age === null ? String(value) : `${value}（${age} 岁）`
  }
  if (field === 'hireDate') {
    if (!value) return '—'
    const months = tenureMonths(employee.hireDate, employee.departureDate)
    if (months === null) return String(value)
    const years = Math.floor(months / 12)
    return years > 0 ? `${value}（${years} 年 ${months % 12} 个月）` : `${value}（${months} 个月）`
  }
  if (field === 'contractEndDate') {
    if (!value) return '—'
    const days = contractDaysLeft(employee.contractEndDate)
    return days === null ? String(value) : days < 0 ? `${value}（已到期 ${-days} 天）` : `${value}（剩余 ${days} 天）`
  }
  if (field === 'probationMonths') return value ? `${value} 个月` : '—'
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function employmentTenure(employee: EmployeeRecord): string {
  const months = tenureMonths(employee.hireDate, employee.departureDate)
  if (months === null || months < 0) return '—'
  const years = Math.floor(months / 12)
  return years > 0 ? `${years} 年 ${months % 12} 个月` : `${months} 个月`
}

function departureReasonText(reason: string | null | undefined): string {
  if (!reason) return '—'
  if (!/^\d{4,5}(?:\.0+)?$/.test(reason)) return reason
  const serial = Number(reason)
  if (serial < 30_000 || serial > 60_000) return reason
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10)
}

function todayDate(): string {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const optionalTextProfileFields = [
  'companyName', 'gender', 'idNumber', 'personalEmail', 'education', 'major', 'school',
  'maritalStatus', 'hasChildren', 'hometown', 'emergencyContact', 'emergencyContactPhone',
  'residentialAddress', 'idAddress', 'bankAccount', 'bankName', 'archiveNo', 'notes',
  'departmentLevel2', 'birthDate', 'graduationDate', 'expectedRegularDate',
  'actualRegularDate', 'contractEndDate',
] as const

function trimEmployeeProfile(draft: EmployeeRecord): EmployeeRecord {
  const trimmed: Record<string, unknown> = { ...draft }
  for (const field of optionalTextProfileFields) {
    const value = trimmed[field]
    if (typeof value === 'string') trimmed[field] = value.trim() || null
  }
  return trimmed as unknown as EmployeeRecord
}

export function EmployeeDataManagement({ backLabel = '返回员工查询', onBack }: EmployeeDataManagementProps) {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [dataError, setDataError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pageMode, setPageMode] = useState<PageMode>('directory')
  const [query, setQuery] = useState('')
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null)
  const [draft, setDraft] = useState<EmployeeRecord | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingResume, setPendingResume] = useState<File | null>(null)
  const [resumeRemoved, setResumeRemoved] = useState(false)
  const [resumeInputKey, setResumeInputKey] = useState(0)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [sortField, setSortField] = useState<SortField>('hireDate')
  const [sortAscending, setSortAscending] = useState(true)
  const [employeeScope, setEmployeeScope] = useState<EmployeeScope>('employed')
  const [currentPage, setCurrentPage] = useState(1)
  const [employeesPerPage, setEmployeesPerPage] = useState<(typeof pageSizeOptions)[number]>(10)
  const tableWrapRef = useRef<HTMLDivElement>(null)

  const employedCount = employees.filter((employee) => employee.status !== 'inactive').length
  const departedCount = employees.filter((employee) => employee.status === 'inactive').length
  const isDepartedView = employeeScope === 'departed'
  const availableSortFields: readonly SortField[] = isDepartedView
    ? ['departureDate', 'displayName', 'departmentName']
    : ['hireDate', 'displayName', 'departmentName', 'contractEndDate']

  const visibleEmployees = useMemo(
    () => employees
      .filter((employee) => employeeScope === 'departed' ? employee.status === 'inactive' : employee.status !== 'inactive')
      .filter((employee) => matchesQuery(employee, query))
      .sort((a, b) => compareEmployees(a, b, sortField, sortAscending)),
    [employees, employeeScope, query, sortField, sortAscending],
  )
  const totalPages = Math.max(1, Math.ceil(visibleEmployees.length / employeesPerPage))
  const pageEmployees = visibleEmployees.slice((currentPage - 1) * employeesPerPage, currentPage * employeesPerPage)
  const pageStart = visibleEmployees.length === 0 ? 0 : (currentPage - 1) * employeesPerPage + 1
  const pageEnd = Math.min(currentPage * employeesPerPage, visibleEmployees.length)

  useEffect(() => {
    setCurrentPage(1)
  }, [employeeScope, query, sortField, sortAscending, employeesPerPage])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  function selectEmployeeScope(scope: EmployeeScope) {
    setEmployeeScope(scope)
    setSortField(scope === 'departed' ? 'departureDate' : 'hireDate')
    setSortAscending(scope !== 'departed')
  }

  function goToPage(page: number) {
    setCurrentPage(page)
    requestAnimationFrame(() => tableWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const loadEmployees = useCallback(async () => {
    setLoading(true)
    setDataError(null)
    try {
      setEmployees(await readEmployeeRecords())
    } catch (error) {
      setDataError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadEmployees()
  }, [loadEmployees])

  function openEditor(mode: EditorMode, employee?: EmployeeRecord) {
    setDraft(employee ? { ...employee } : emptyEmployee(employees))
    setEditorMode(mode)
    setFormError(null)
    setPendingResume(null)
    setResumeRemoved(false)
  }

  function openDepartureEditor(employee: EmployeeRecord) {
    setDraft({
      ...employee,
      status: 'inactive',
      departureDate: employee.departureDate ?? todayDate(),
      departureReason: employee.departureReason ?? '',
    })
    setEditorMode('departure')
    setFormError(null)
    setPendingResume(null)
    setResumeRemoved(false)
  }

  function closeEditor() {
    setEditorMode(null)
    setDraft(null)
    setFormError(null)
    setPendingResume(null)
    setResumeRemoved(false)
  }

  function updateDraft<K extends keyof EmployeeRecord>(field: K, value: EmployeeRecord[K]) {
    setDraft((current) => current ? { ...current, [field]: value } : current)
  }

  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    if (editorMode === 'departure') {
      const departureDate = draft.departureDate?.trim() ?? ''
      const departureReason = draft.departureReason?.trim() ?? ''
      if (!departureDate || !departureReason) {
        setFormError('请填写离职日期和离职原因。')
        return
      }
      setSaving(true)
      setFormError(null)
      try {
        const saved = await departEmployeeRecord(draft.id, departureDate, departureReason)
        setEmployees((current) => current.map((employee) => employee.id === saved.id ? saved : employee))
        setEmployeeScope('departed')
        closeEditor()
      } catch (error) {
        setFormError(error instanceof Error ? error.message : String(error))
      } finally {
        setSaving(false)
      }
      return
    }
    const error = validateEmployee(draft, employees)
    if (error) {
      setFormError(error)
      return
    }
    const normalized: EmployeeRecord = {
      ...trimEmployeeProfile(draft),
      displayName: draft.displayName.trim(),
      workEmail: draft.workEmail?.trim() || null,
      workPhone: draft.workPhone.trim(),
      departmentName: draft.departmentName.trim(),
      jobTitle: draft.jobTitle.trim(),
      hireDate: draft.hireDate.trim(),
      workLocation: draft.workLocation.trim(),
      responsibilities: draft.responsibilities.trim(),
    }
    setSaving(true)
    setFormError(null)
    try {
      const resume = pendingResume
        ? await resumeUploadPayload(pendingResume)
        : resumeRemoved ? null : undefined
      const saved = editorMode === 'create'
        ? await createEmployeeRecord(normalized, resume)
        : await updateEmployeeRecord(normalized, resume)
      setEmployees((current) => editorMode === 'create'
        ? [...current, saved]
        : current.map((employee) => employee.id === saved.id ? saved : employee))
      closeEditor()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  function selectResume(file: File | undefined) {
    if (!file) {
      setPendingResume(null)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('简历文件不能超过 5 MB。')
      return
    }
    const extension = file.name.split('.').at(-1)?.toLocaleLowerCase()
    if (!['pdf', 'doc', 'docx'].includes(extension ?? '')) {
      setFormError('简历只支持 PDF、DOC 或 DOCX。')
      return
    }
    setPendingResume(file)
    setResumeRemoved(false)
    setFormError(null)
  }

  function removeResume() {
    setPendingResume(null)
    setResumeRemoved(true)
    setResumeInputKey((current) => current + 1)
    setDraft((current) => current ? {
      ...current,
      resumeFileName: null,
      resumeMimeType: null,
      resumeSize: null,
    } : current)
    setFormError(null)
  }

  function editEmployeeFromPreview() {
    if (!draft) return
    const employee = { ...draft }
    setPageMode('maintenance')
    openEditor('edit', employee)
  }

  return (
    <div className="employee-data module-page">
      <header className="employee-data__header">
        <div className="employee-data__title">
          <button className="employee-data__back" type="button" onClick={onBack}><ArrowLeft size={16} /> {backLabel}</button>
          <h1>{pageMode === 'organization' ? '组织架构图' : pageMode === 'directory' ? isDepartedView ? '离职人员档案' : '在职员工信息' : '员工数据维护'}</h1>
          <p>{pageMode === 'organization' ? '按一级部门和二级部门查看在职员工组织分布。' : pageMode === 'directory' ? isDepartedView ? `当前共 ${departedCount} 名离职人员，按离职时间排序。` : `当前共 ${employedCount} 名在职员工，查看员工档案与组织信息。` : '在系统中查询、新增、查看、编辑或删除员工。'}</p>
        </div>
        <div className="employee-data__header-actions">
          {pageMode === 'directory' ? (
            <><button className="employee-data__secondary" type="button" onClick={() => setPageMode('organization')}><Network size={16} /> 组织架构</button><button className="employee-data__primary" type="button" onClick={() => setPageMode('maintenance')}><Settings2 size={16} /> 进入维护</button></>
          ) : pageMode === 'organization' ? (
            <button className="employee-data__secondary" type="button" onClick={() => setPageMode('directory')}><ArrowLeft size={16} /> 返回员工信息</button>
          ) : (
            <button className="employee-data__secondary" type="button" onClick={() => { setPageMode('directory'); closeEditor() }}><Eye size={16} /> 退出维护</button>
          )}
        </div>
      </header>

      {pageMode === 'organization' ? <OrganizationChart employees={employees} onBack={() => setPageMode('directory')} /> : <section className="employee-data__panel">
        {dataError && (
          <div className="employee-data__database-error">
            <span>{dataError}</span>
            <button type="button" onClick={() => void loadEmployees()}>重新加载</button>
          </div>
        )}
        <div className="employee-data__toolbar">
          <label className="employee-data__search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、邮箱、部门、岗位或地点" />
          </label>
          <span>显示 {pageStart}–{pageEnd} / {visibleEmployees.length} 人</span>
          <div className="employee-data__scope" aria-label="员工范围">
            <button type="button" className={employeeScope === 'employed' ? 'is-active' : ''} onClick={() => selectEmployeeScope('employed')}>在职</button>
            <button type="button" className={employeeScope === 'departed' ? 'is-active' : ''} onClick={() => selectEmployeeScope('departed')}>离职</button>
          </div>
          <div className="employee-data__sort">
            <label>
              排序
              <select value={sortField} onChange={(event) => setSortField(event.target.value as SortField)}>
                {availableSortFields.map((field) => (
                  <option key={field} value={field}>{sortFieldLabels[field]}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              title={sortAscending ? '当前升序，点击切换为降序' : '当前降序，点击切换为升序'}
              onClick={() => setSortAscending((current) => !current)}
            >
              {sortAscending ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
            </button>
          </div>
          {pageMode === 'directory' && (
            <div className="employee-data__export">
              <button className="employee-data__secondary" type="button" disabled={exporting} onClick={() => setExportMenuOpen((current) => !current)}>
                <Download size={15} /> {exporting ? '导出中…' : '导出'}
              </button>
              {exportMenuOpen && (
                <>
                  <button className="employee-data__export-backdrop" type="button" aria-label="关闭导出菜单" onClick={() => setExportMenuOpen(false)} />
                  <div className="employee-data__export-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setExportMenuOpen(false); void (async () => {
                      setExporting(true)
                      try {
                        await exportEmployeesToExcel(visibleEmployees, employeeScope)
                      } catch (error) {
                        setDataError(error instanceof Error ? error.message : String(error))
                      } finally {
                        setExporting(false)
                      }
                    })() }}>导出为 Excel</button>
                    <button type="button" role="menuitem" onClick={() => { setExportMenuOpen(false); exportEmployeesToPdf(visibleEmployees, employeeScope) }}>导出为 PDF</button>
                  </div>
                </>
              )}
            </div>
          )}
          {pageMode === 'maintenance' && employeeScope === 'employed' && (
            <button className="employee-data__primary" type="button" onClick={() => openEditor('create')}><Plus size={16} /> 新增员工</button>
          )}
        </div>

        <div className="employee-data__table-wrap" ref={tableWrapRef}>
          <table className={`employee-data__table${isDepartedView ? ' employee-data__table--departed' : ''}`}>
            <thead>
              <tr>
                {isDepartedView ? (
                  <>
                    <th>员工</th><th>部门 / 岗位</th><th>联系方式</th><th>入职时间</th><th>离职时间 / 工龄</th><th>离职原因</th><th>{pageMode === 'directory' ? '档案' : '操作'}</th>
                  </>
                ) : (
                  <>
                    <th>员工</th><th>部门 / 岗位</th><th>联系方式</th><th>用工状态</th><th>入职时间</th><th>合同到期</th><th>{pageMode === 'directory' ? '档案' : '操作'}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {pageEmployees.map((employee) => (
                <tr key={employee.id}>
                  {isDepartedView ? (
                    <>
                      <td><strong>{employee.displayName}</strong><small>{employee.id}</small></td>
                      <td><strong>{employee.departmentName}</strong><small>{employee.jobTitle}</small></td>
                      <td><strong>{employee.workPhone}</strong><small>{employee.workEmail ?? '未填写邮箱'}</small></td>
                      <td className="employee-departure-date"><strong>{employee.hireDate}</strong><small>入职</small></td>
                      <td className="employee-departure-date"><strong>{employee.departureDate ?? '—'}</strong><small>工龄 {employmentTenure(employee)}</small></td>
                      <td className="employee-departure-reason">{departureReasonText(employee.departureReason)}</td>
                    </>
                  ) : (
                    <>
                      <td><strong>{employee.displayName}</strong><small>{employee.id}</small></td>
                      <td><strong>{employee.departmentName}</strong><small>{employee.jobTitle}</small></td>
                      <td><strong>{employee.workPhone}</strong><small>{employee.workEmail ?? '未填写邮箱'}</small></td>
                      <td><span className={`employee-status employee-status--${employee.status}`}>{statusLabels[employee.status]}</span><small>{employmentTypeLabels[employee.employmentType]}</small></td>
                      <td><strong>{employee.hireDate}</strong></td>
                      <td>
                        {employee.contractEndDate
                      ? (() => {
                          const days = contractDaysLeft(employee.contractEndDate)
                          const expiring = days !== null && days <= 60
                          return (
                            <span className={expiring ? 'employee-contract employee-contract--expiring' : 'employee-contract'}>
                              <strong>{employee.contractEndDate}</strong>
                              <small>{days === null ? '' : days < 0 ? `已到期 ${-days} 天` : `剩余 ${days} 天`}</small>
                            </span>
                          )
                        })()
                          : <span>—</span>}
                      </td>
                    </>
                  )}
                  <td>
                    <div className="employee-data__row-actions">
                      {pageMode === 'directory' ? (
                        <button type="button" title="查看员工简历" onClick={() => openEditor('view', employee)}><Eye size={14} /></button>
                      ) : (
                        <>
                          <button type="button" title="编辑" onClick={() => openEditor('edit', employee)}><Pencil size={14} /></button>
                          {employee.status !== 'inactive' && <button className="is-danger employee-data__departure" type="button" onClick={() => openDepartureEditor(employee)}>员工离职</button>}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading
            ? <div className="employee-data__empty">正在从 PostgreSQL 加载员工数据…</div>
            : visibleEmployees.length === 0 && <div className="employee-data__empty">没有找到匹配的员工</div>}
        </div>
        {!loading && visibleEmployees.length > 0 && (
          <nav className="employee-data__pagination" aria-label="员工分页">
            <div className="employee-data__pagination-summary">
              <span>第 {currentPage} / {totalPages} 页</span>
              <label>每页
                <select value={employeesPerPage} onChange={(event) => setEmployeesPerPage(Number(event.target.value) as (typeof pageSizeOptions)[number])}>
                  {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
                人
              </label>
            </div>
            <div className="employee-data__pagination-actions">
              <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>上一页</button>
              <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>下一页</button>
            </div>
          </nav>
        )}
      </section>}

      {editorMode && draft && (
        <div className="employee-editor" role="dialog" aria-modal="true" aria-label={editorMode === 'create' ? '新增员工' : editorMode === 'departure' ? `${draft.displayName}的离职信息` : `${draft.displayName}的员工信息`}>
          <button className="employee-editor__backdrop" type="button" aria-label="关闭" onClick={closeEditor} />
          <section className="employee-editor__panel" key={`${draft.id}:${editorMode}`}>
            <header>
              <div><span>{editorMode === 'view' ? '员工详情' : editorMode === 'create' ? '新增员工' : editorMode === 'departure' ? '员工离职' : '编辑员工'}</span><strong>{draft.displayName || '填写员工信息'}</strong></div>
              <button type="button" onClick={closeEditor} title="关闭"><X size={18} /></button>
            </header>
            <form onSubmit={(event) => { void saveEmployee(event) }}>
              {editorMode === 'view' ? (
                <>
                  {draft.status !== 'inactive' && <section className="employee-resume-preview">
                    <div className="employee-resume-preview__heading"><FileText size={18} /><div><strong>员工简历</strong><span>{draft.resumeFileName ?? '暂未上传简历'}</span></div></div>
                    <div className="employee-resume-preview__responsibilities"><strong>员工职责</strong><p>{draft.responsibilities || '暂未填写员工职责。'}</p></div>
                    {draft.resumeFileName && draft.resumeMimeType === 'application/pdf' && (
                      <iframe title={`${draft.displayName}的简历`} src={employeeResumeUrl(draft.id)} />
                    )}
                    {draft.resumeFileName && draft.resumeMimeType !== 'application/pdf' && (
                      <a href={employeeResumeUrl(draft.id)} target="_blank" rel="noreferrer"><Download size={15} /> 查看或下载简历</a>
                    )}
                  </section>}
                  <div className="employee-archive">
                    {(draft.status === 'inactive' ? departureArchiveSections : activeArchiveSections).map((section) => (
                      <section className="employee-archive__group" key={section.title}>
                        <h3 className="employee-archive__heading">{section.title}</h3>
                        <dl className="employee-archive__grid">
                          {section.items.map((item) => (
                            <div className="employee-archive__item" key={item.field}>
                              <dt>{item.label}</dt>
                              <dd>{archiveFieldValue(draft, item.field, employees)}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    ))}
                    <section className="employee-archive__group">
                      <h3 className="employee-archive__heading">备注</h3>
                      <p className="employee-archive__notes">{draft.notes || '—'}</p>
                    </section>
                  </div>
                </>
              ) : editorMode === 'departure' ? (
                <div className="employee-editor__fields">
                  <label>姓名<input value={draft.displayName} disabled /></label>
                  <label>所属公司<input value={draft.companyName ?? ''} disabled /></label>
                  <label>部门名称<input value={draft.departmentName} disabled /></label>
                  <label>岗位<input value={draft.jobTitle} disabled /></label>
                  <label>用工类型<input value={employmentTypeLabels[draft.employmentType]} disabled /></label>
                  <label>入职日期<input value={draft.hireDate} disabled /></label>
                  <label>离职日期<input required type="date" value={draft.departureDate ?? ''} onChange={(event) => updateDraft('departureDate', event.target.value || null)} /></label>
                  <label className="employee-editor__wide">离职原因<textarea required rows={4} value={draft.departureReason ?? ''} onChange={(event) => updateDraft('departureReason', event.target.value || null)} placeholder="填写离职原因" /></label>
                </div>
              ) : (
              <div className="employee-editor__fields">
                <label>姓名<input required value={draft.displayName} onChange={(event) => updateDraft('displayName', event.target.value)} /></label>
                <label>工作邮箱（选填）<input type="email" value={draft.workEmail ?? ''} onChange={(event) => updateDraft('workEmail', event.target.value || null)} /></label>
                <label>工作电话<input required value={draft.workPhone} onChange={(event) => updateDraft('workPhone', event.target.value)} /></label>
                <label>部门名称<input required value={draft.departmentName} onChange={(event) => updateDraft('departmentName', event.target.value)} /></label>
                <label>岗位<input required value={draft.jobTitle} onChange={(event) => updateDraft('jobTitle', event.target.value)} /></label>
                <label>用工类型<select value={draft.employmentType} onChange={(event) => updateDraft('employmentType', event.target.value as EmploymentType)}>{employmentTypes.map((type) => <option key={type} value={type}>{employmentTypeLabels[type]}</option>)}</select></label>
                <label>员工状态<select value={draft.status} onChange={(event) => updateDraft('status', event.target.value as EmployeeStatus)}>{employeeStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
                <label>入职日期<input required type="date" value={draft.hireDate} onChange={(event) => updateDraft('hireDate', event.target.value)} /></label>
                {draft.status !== 'inactive' && <label>工作地点（选填）<input value={draft.workLocation} onChange={(event) => updateDraft('workLocation', event.target.value)} /></label>}
                <h3 className="employee-editor__section-title">任职信息</h3>
                <label>所属公司<input value={draft.companyName ?? ''} onChange={(event) => updateDraft('companyName', event.target.value || null)} /></label>
                <label>二级部门<input value={draft.departmentLevel2 ?? ''} onChange={(event) => updateDraft('departmentLevel2', event.target.value || null)} /></label>
                {draft.status !== 'inactive' && <>
                  <label>试用期（月）<input type="number" min={1} max={12} value={draft.probationMonths ?? ''} onChange={(event) => updateDraft('probationMonths', event.target.value ? Number(event.target.value) : null)} /></label>
                  <label>预计转正日期<input type="date" value={draft.expectedRegularDate ?? ''} onChange={(event) => updateDraft('expectedRegularDate', event.target.value || null)} /></label>
                  <label>实际转正日期<input type="date" value={draft.actualRegularDate ?? ''} onChange={(event) => updateDraft('actualRegularDate', event.target.value || null)} /></label>
                  <label>合同到期日期<input type="date" value={draft.contractEndDate ?? ''} onChange={(event) => updateDraft('contractEndDate', event.target.value || null)} /></label>
                </>}
                <label>档案编号<input value={draft.archiveNo ?? ''} onChange={(event) => updateDraft('archiveNo', event.target.value || null)} /></label>
                <h3 className="employee-editor__section-title">身份信息</h3>
                <label>性别<input value={draft.gender ?? ''} onChange={(event) => updateDraft('gender', event.target.value || null)} /></label>
                <label>出生日期<input type="date" value={draft.birthDate ?? ''} onChange={(event) => updateDraft('birthDate', event.target.value || null)} /></label>
                <label>身份证<input value={draft.idNumber ?? ''} onChange={(event) => updateDraft('idNumber', event.target.value || null)} /></label>
                <label>籍贯<input value={draft.hometown ?? ''} onChange={(event) => updateDraft('hometown', event.target.value || null)} /></label>
                <label>婚否<input value={draft.maritalStatus ?? ''} onChange={(event) => updateDraft('maritalStatus', event.target.value || null)} /></label>
                <label>育否<input value={draft.hasChildren ?? ''} onChange={(event) => updateDraft('hasChildren', event.target.value || null)} /></label>
                <label className="employee-editor__wide">居住住址<input value={draft.residentialAddress ?? ''} onChange={(event) => updateDraft('residentialAddress', event.target.value || null)} /></label>
                <label className="employee-editor__wide">身份证地址<input value={draft.idAddress ?? ''} onChange={(event) => updateDraft('idAddress', event.target.value || null)} /></label>
                <h3 className="employee-editor__section-title">联系方式</h3>
                <label>个人邮箱<input type="email" value={draft.personalEmail ?? ''} onChange={(event) => updateDraft('personalEmail', event.target.value || null)} /></label>
                <label>紧急联系人<input value={draft.emergencyContact ?? ''} onChange={(event) => updateDraft('emergencyContact', event.target.value || null)} /></label>
                <label>紧急联系人电话<input value={draft.emergencyContactPhone ?? ''} onChange={(event) => updateDraft('emergencyContactPhone', event.target.value || null)} /></label>
                <h3 className="employee-editor__section-title">教育背景</h3>
                <label>学历<input value={draft.education ?? ''} onChange={(event) => updateDraft('education', event.target.value || null)} /></label>
                <label>专业<input value={draft.major ?? ''} onChange={(event) => updateDraft('major', event.target.value || null)} /></label>
                <label>毕业学校<input value={draft.school ?? ''} onChange={(event) => updateDraft('school', event.target.value || null)} /></label>
                <label>毕业时间<input type="date" value={draft.graduationDate ?? ''} onChange={(event) => updateDraft('graduationDate', event.target.value || null)} /></label>
                <h3 className="employee-editor__section-title">财务信息</h3>
                <label>银行卡<input value={draft.bankAccount ?? ''} onChange={(event) => updateDraft('bankAccount', event.target.value || null)} /></label>
                <label>开户行<input value={draft.bankName ?? ''} onChange={(event) => updateDraft('bankName', event.target.value || null)} /></label>
                <label className="employee-editor__wide">备注<textarea rows={3} value={draft.notes ?? ''} onChange={(event) => updateDraft('notes', event.target.value || null)} placeholder="填写需要记录的其他信息" /></label>
                {draft.status !== 'inactive' && <><label className="employee-editor__wide">员工职责<textarea rows={5} value={draft.responsibilities} onChange={(event) => updateDraft('responsibilities', event.target.value)} placeholder="填写该员工负责的工作范围、目标和主要职责" /></label>
                <div className="employee-editor__wide employee-resume-upload">
                  <span className="employee-resume-upload__label">员工简历（选填）</span>
                  <label className="employee-resume-upload__picker">
                    <Upload size={16} />{pendingResume?.name ?? draft.resumeFileName ?? '选择 PDF、DOC 或 DOCX 文件'}
                    <input key={resumeInputKey} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => selectResume(event.target.files?.[0])} />
                  </label>
                  {(pendingResume || draft.resumeFileName) && <button className="employee-resume-upload__remove" type="button" onClick={removeResume}><Trash2 size={14} /> 删除简历</button>}
                  <small>文件将保存到 PostgreSQL，最大 5 MB。</small>
                </div></>}
              </div>
              )}
              {formError && <p className="employee-editor__error">{formError}</p>}
              <footer>
                <button className="employee-data__secondary" type="button" onClick={closeEditor}>取消</button>
                {editorMode === 'view' ? (
                  <button className="employee-data__primary" type="button" onClick={editEmployeeFromPreview}><Pencil size={15} /> 编辑员工</button>
                ) : (
                  <button className={editorMode === 'departure' ? 'employee-data__primary is-danger' : 'employee-data__primary'} type="submit" disabled={saving}><Save size={15} /> {saving ? '保存中…' : editorMode === 'departure' ? '确认离职' : '保存'}</button>
                )}
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
