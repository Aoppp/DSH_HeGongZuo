// 员工管理 / 数据状态与数据访问边界。
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isValidChineseIdNumber, isValidChinesePhone } from '@hegongzuo/employee-domain'

import { createEmployeeRecord, departEmployeeRecord, nextEmployeeIdentity, readEmployeeRecords, resumeUploadPayload, updateEmployeeRecord, type EmployeeRecord } from './employee-data'
import { type SortField } from './employee-sort'
import { type EditorMode, type EmployeeScope, pageSizeOptions } from './employee-data-types'

const optionalTextFields = ['companyName', 'gender', 'idNumber', 'personalEmail', 'education', 'major', 'school', 'maritalStatus', 'hasChildren', 'hometown', 'emergencyContact', 'emergencyContactPhone', 'residentialAddress', 'idAddress', 'bankAccount', 'bankName', 'archiveNo', 'notes', 'departmentLevel2', 'birthDate', 'graduationDate', 'expectedRegularDate', 'actualRegularDate', 'contractEndDate'] as const

type EmployeeRequest = { readonly query: string, readonly scope: EmployeeScope, readonly page: number, readonly pageSize: number, readonly sort: SortField, readonly ascending: boolean }
type CachedEmployeePage = { readonly employees: EmployeeRecord[], readonly total: number }

function employeeRequestKey(request: EmployeeRequest): string { return `${request.scope}\u0000${request.query}\u0000${request.page}\u0000${request.pageSize}\u0000${request.sort}\u0000${request.ascending}` }

function emptyEmployee(employees: readonly EmployeeRecord[]): EmployeeRecord {
  return { ...nextEmployeeIdentity(employees), displayName: '', workEmail: null, workPhone: '', departmentName: '', jobTitle: '', employmentType: 'full_time', status: 'active', hireDate: '', workLocation: '', responsibilities: '', resumeFileName: null, resumeMimeType: null, resumeSize: null, companyName: null, gender: null, idNumber: null, birthDate: null, personalEmail: null, education: null, major: null, school: null, graduationDate: null, maritalStatus: null, hasChildren: null, hometown: null, emergencyContact: null, emergencyContactPhone: null, residentialAddress: null, idAddress: null, bankAccount: null, bankName: null, archiveNo: null, notes: null, departmentLevel2: null, probationMonths: null, expectedRegularDate: null, actualRegularDate: null, contractEndDate: null }
}

function validateEmployee(draft: EmployeeRecord, employees: readonly EmployeeRecord[]): string | null {
  if ([draft.displayName, draft.workPhone, draft.departmentName, draft.jobTitle, draft.hireDate].some((value) => !value.trim())) return '请填写全部必填字段。'
  const workEmail = draft.workEmail?.trim()
  const idNumber = draft.idNumber?.trim()
  const emergencyContactPhone = draft.emergencyContactPhone?.trim()
  if (!isValidChinesePhone(draft.workPhone)) return '请填写有效的工作电话。'
  if (emergencyContactPhone && !isValidChinesePhone(emergencyContactPhone)) return '请填写有效的紧急联系人电话。'
  if (idNumber && !isValidChineseIdNumber(idNumber)) return '请填写有效的 18 位身份证号。'
  if (workEmail && employees.some((employee) => employee.id !== draft.id && employee.workEmail?.toLocaleLowerCase() === workEmail.toLocaleLowerCase())) return '工作邮箱不能重复。'
  if (idNumber && employees.some((employee) => employee.id !== draft.id && employee.idNumber?.trim() === idNumber)) return '身份证号不能重复。'
  return null
}

function normalizeEmployee(draft: EmployeeRecord): EmployeeRecord {
  const normalized: Record<string, unknown> = { ...draft }
  for (const field of optionalTextFields) if (typeof normalized[field] === 'string') normalized[field] = (normalized[field] as string).trim() || null
  return { ...normalized, displayName: draft.displayName.trim(), workEmail: draft.workEmail?.trim() || null, workPhone: draft.workPhone.trim(), departmentName: draft.departmentName.trim(), jobTitle: draft.jobTitle.trim(), hireDate: draft.hireDate.trim(), workLocation: draft.workLocation.trim(), responsibilities: draft.responsibilities.trim() } as EmployeeRecord
}

function todayDate(): string { return new Date().toISOString().slice(0, 10) }

export function useEmployeeDataManagement() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [totalEmployees, setTotalEmployees] = useState(0)
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataError, setDataError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [employeeScope, setEmployeeScope] = useState<EmployeeScope>('employed')
  const [sortField, setSortField] = useState<SortField>('hireDate')
  const [sortAscending, setSortAscending] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [employeesPerPage, setEmployeesPerPage] = useState<(typeof pageSizeOptions)[number]>(10)
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null)
  const [draft, setDraft] = useState<EmployeeRecord | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingResume, setPendingResume] = useState<File | null>(null)
  const [resumeRemoved, setResumeRemoved] = useState(false)
  const [resumeInputKey, setResumeInputKey] = useState(0)
  const tableWrapRef = useRef<HTMLDivElement>(null!)
  const requestSequence = useRef(0)
  const pageCache = useRef(new Map<string, CachedEmployeePage>())
  const prefetching = useRef(new Set<string>())
  const request = useMemo<EmployeeRequest>(() => ({ query, scope: employeeScope, page: currentPage, pageSize: employeesPerPage, sort: sortField, ascending: sortAscending }), [currentPage, employeeScope, employeesPerPage, query, sortAscending, sortField])
  const requestKey = employeeRequestKey(request)
  const loadEmployees = useCallback(async () => { const sequence = ++requestSequence.current; const cached = pageCache.current.get(requestKey); if (cached) { setEmployees(cached.employees); setTotalEmployees(cached.total); setLoadedRequestKey(requestKey); setLoading(false); setDataError(null) } else { setLoading(true); setDataError(null) } try { const result = await readEmployeeRecords(request); const next = { employees: result.employees, total: result.total }; pageCache.current.set(requestKey, next); if (sequence !== requestSequence.current) return; setEmployees(next.employees); setTotalEmployees(next.total); setLoadedRequestKey(requestKey) } catch (error) { if (sequence !== requestSequence.current) return; if (!cached) { setDataError(error instanceof Error ? error.message : String(error)); setLoadedRequestKey(requestKey) } } finally { if (sequence === requestSequence.current) setLoading(false) } }, [request, requestKey])
  useEffect(() => { void loadEmployees() }, [loadEmployees])
  const prefetchScope = useCallback(async (scope: EmployeeScope) => { const prefetchRequest: EmployeeRequest = { query, scope, page: 1, pageSize: employeesPerPage, sort: scope === 'departed' ? 'departureDate' : 'hireDate', ascending: scope !== 'departed' }; const prefetchKey = employeeRequestKey(prefetchRequest); if (pageCache.current.has(prefetchKey) || prefetching.current.has(prefetchKey)) return; prefetching.current.add(prefetchKey); try { const result = await readEmployeeRecords(prefetchRequest); pageCache.current.set(prefetchKey, { employees: result.employees, total: result.total }) } catch { /* 预加载失败不影响当前列表。 */ } finally { prefetching.current.delete(prefetchKey) } }, [employeesPerPage, query])
  useEffect(() => { void prefetchScope(employeeScope === 'employed' ? 'departed' : 'employed') }, [employeeScope, prefetchScope])
  const totalPages = Math.max(1, Math.ceil(totalEmployees / employeesPerPage))
  useEffect(() => { setCurrentPage(1) }, [employeeScope, query, sortField, sortAscending, employeesPerPage])
  useEffect(() => { setCurrentPage((page) => Math.min(page, totalPages)) }, [totalPages])
  const closeEditor = () => { setEditorMode(null); setDraft(null); setFormError(null); setPendingResume(null); setResumeRemoved(false) }
  const openEditor = (mode: EditorMode, employee?: EmployeeRecord) => { setDraft(employee ? { ...employee } : emptyEmployee(employees)); setEditorMode(mode); setFormError(null); setPendingResume(null); setResumeRemoved(false) }
  const openDepartureEditor = (employee: EmployeeRecord) => { setDraft({ ...employee, status: 'inactive', departureDate: employee.departureDate ?? todayDate(), departureReason: employee.departureReason ?? '' }); setEditorMode('departure'); setFormError(null); setPendingResume(null); setResumeRemoved(false) }
  const updateDraft = <K extends keyof EmployeeRecord>(field: K, value: EmployeeRecord[K]) => setDraft((current) => current ? { ...current, [field]: value } : current)
  const selectResume = (file: File | undefined) => { if (!file) { setPendingResume(null); return }; if (file.size > 5 * 1024 * 1024) { setFormError('简历文件不能超过 5 MB。'); return }; if (!['pdf', 'doc', 'docx'].includes(file.name.split('.').at(-1)?.toLocaleLowerCase() ?? '')) { setFormError('简历只支持 PDF、DOC 或 DOCX。'); return }; setPendingResume(file); setResumeRemoved(false); setFormError(null) }
  const removeResume = () => { setPendingResume(null); setResumeRemoved(true); setResumeInputKey((key) => key + 1); setDraft((current) => current ? { ...current, resumeFileName: null, resumeMimeType: null, resumeSize: null } : current); setFormError(null) }
  const saveEmployee = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!draft) return; if (editorMode === 'departure') { const date = draft.departureDate?.trim() ?? ''; const reason = draft.departureReason?.trim() ?? ''; if (!date || !reason) { setFormError('请填写离职日期和离职原因。'); return }; setSaving(true); setFormError(null); try { const saved = await departEmployeeRecord(draft.id, date, reason); setEmployees((current) => current.map((employee) => employee.id === saved.id ? saved : employee)); setEmployeeScope('departed'); closeEditor() } catch (error) { setFormError(error instanceof Error ? error.message : String(error)) } finally { setSaving(false) }; return }; const departureDate = draft.departureDate?.trim() ?? ''; if (editorMode === 'edit' && draft.status === 'inactive' && (!departureDate || departureDate < draft.hireDate)) { setFormError(!departureDate ? '请填写离职日期。' : '离职日期不能早于入职日期。'); return }; const error = validateEmployee(draft, employees); if (error) { setFormError(error); return }; setSaving(true); setFormError(null); try { const resume = pendingResume ? await resumeUploadPayload(pendingResume) : resumeRemoved ? null : undefined; let saved = editorMode === 'create' ? await createEmployeeRecord(normalizeEmployee(draft), resume) : await updateEmployeeRecord(normalizeEmployee(draft), resume); const previousDepartureDate = employees.find((employee) => employee.id === draft.id)?.departureDate ?? null; if (editorMode === 'edit' && draft.status === 'inactive' && departureDate !== previousDepartureDate) saved = await departEmployeeRecord(draft.id, departureDate, draft.departureReason?.trim() ?? '未填写'); setEmployees((current) => editorMode === 'create' ? [...current, saved] : current.map((employee) => employee.id === saved.id ? saved : employee)); closeEditor() } catch (saveError) { setFormError(saveError instanceof Error ? saveError.message : String(saveError)) } finally { setSaving(false) } }
  const currentEmployees = loadedRequestKey === requestKey ? employees : []
  const currentTotalEmployees = loadedRequestKey === requestKey ? totalEmployees : 0
  const currentLoading = loading || loadedRequestKey !== requestKey
  return { employees: currentEmployees, totalEmployees: currentTotalEmployees, loading: currentLoading, dataError, setDataError, loadEmployees, query, setQuery, employeeScope, setEmployeeScope, sortField, setSortField, sortAscending, setSortAscending, currentPage, setCurrentPage, employeesPerPage, setEmployeesPerPage, totalPages: Math.max(1, Math.ceil(currentTotalEmployees / employeesPerPage)), pageEmployees: currentEmployees, tableWrapRef, editorMode, draft, formError, saving, pendingResume, resumeInputKey, openEditor, openDepartureEditor, closeEditor, updateDraft, selectResume, removeResume, saveEmployee }
}
