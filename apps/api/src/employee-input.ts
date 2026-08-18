import {
  employeeStatuses,
  employmentTypes,
  type EmployeeStatus,
  type EmploymentType,
} from '@hegongzuo/employee-domain'

const maximumResumeBytes = 5 * 1024 * 1024
const allowedResumeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export interface ResumeUpload {
  readonly fileName: string
  readonly mimeType: string
  readonly data: Buffer
}

export interface EmployeeInput {
  readonly displayName: string
  readonly workEmail: string | null
  readonly workPhone: string
  readonly departmentName: string
  readonly jobTitle: string
  readonly employmentType: EmploymentType
  readonly status: EmployeeStatus
  readonly hireDate: string
  readonly workLocation: string | null
  readonly responsibilities: string
  readonly resume: ResumeUpload | null | undefined
  readonly companyName: string | null
  readonly gender: string | null
  readonly idNumber: string | null
  readonly birthDate: string | null
  readonly personalEmail: string | null
  readonly education: string | null
  readonly major: string | null
  readonly school: string | null
  readonly graduationDate: string | null
  readonly maritalStatus: string | null
  readonly hasChildren: string | null
  readonly hometown: string | null
  readonly emergencyContact: string | null
  readonly emergencyContactPhone: string | null
  readonly residentialAddress: string | null
  readonly idAddress: string | null
  readonly bankAccount: string | null
  readonly bankName: string | null
  readonly archiveNo: string | null
  readonly notes: string | null
  readonly departmentLevel2: string | null
  readonly probationMonths: number | null
  readonly expectedRegularDate: string | null
  readonly actualRegularDate: string | null
  readonly contractEndDate: string | null
}

export class EmployeeValidationError extends Error {}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string' || !value.trim()) throw new EmployeeValidationError(`${field} 不能为空。`)
  return value.trim()
}

function optionalString(record: Record<string, unknown>, field: string): string | null {
  const value = record[field]
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') throw new EmployeeValidationError(`${field} 必须是字符串或 null。`)
  return value.trim() || null
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/

function optionalDate(record: Record<string, unknown>, field: string): string | null {
  const value = optionalString(record, field)
  if (value && (!datePattern.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))) {
    throw new EmployeeValidationError(`${field} 格式无效。`)
  }
  return value
}

function optionalInteger(record: Record<string, unknown>, field: string, min: number, max: number): number | null {
  const value = record[field]
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new EmployeeValidationError(`${field} 必须是 ${min}–${max} 的整数或 null。`)
  }
  return value
}

function parseResume(value: unknown): ResumeUpload | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (!value || typeof value !== 'object') throw new EmployeeValidationError('resume 格式无效。')
  const record = value as Record<string, unknown>
  const rawFileName = requiredString(record, 'fileName')
  const fileName = rawFileName.split(/[\\/]/).at(-1)?.replace(/[\r\n"]/g, '').trim()
  if (!fileName) throw new EmployeeValidationError('简历文件名无效。')
  const mimeType = requiredString(record, 'mimeType').toLocaleLowerCase()
  if (!allowedResumeTypes.has(mimeType)) throw new EmployeeValidationError('简历只支持 PDF、DOC 或 DOCX。')
  const base64 = requiredString(record, 'base64')
  const data = Buffer.from(base64, 'base64')
  if (data.length === 0) throw new EmployeeValidationError('简历文件不能为空。')
  if (data.length > maximumResumeBytes) throw new EmployeeValidationError('简历文件不能超过 5 MB。')
  return { fileName, mimeType, data }
}

export function parseEmployeeInput(value: unknown): EmployeeInput {
  if (!value || typeof value !== 'object') throw new EmployeeValidationError('员工数据必须是 JSON 对象。')
  const record = value as Record<string, unknown>
  const employmentType = record.employmentType
  if (!employmentTypes.includes(employmentType as EmploymentType)) {
    throw new EmployeeValidationError('employmentType 不在允许范围内。')
  }
  const status = record.status
  if (!employeeStatuses.includes(status as EmployeeStatus)) {
    throw new EmployeeValidationError('status 不在允许范围内。')
  }
  const workEmail = optionalString(record, 'workEmail')
  if (workEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) throw new EmployeeValidationError('workEmail 格式无效。')
  const personalEmail = optionalString(record, 'personalEmail')
  if (personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail)) throw new EmployeeValidationError('personalEmail 格式无效。')
  const hireDate = requiredString(record, 'hireDate')
  if (!datePattern.test(hireDate) || Number.isNaN(Date.parse(`${hireDate}T00:00:00Z`))) {
    throw new EmployeeValidationError('hireDate 格式无效。')
  }
  const idNumber = optionalString(record, 'idNumber')

  return {
    displayName: requiredString(record, 'displayName'),
    workEmail,
    workPhone: requiredString(record, 'workPhone'),
    departmentName: requiredString(record, 'departmentName'),
    jobTitle: requiredString(record, 'jobTitle'),
    employmentType: employmentType as EmploymentType,
    status: status as EmployeeStatus,
    hireDate,
    workLocation: optionalString(record, 'workLocation'),
    responsibilities: optionalString(record, 'responsibilities') ?? '',
    resume: parseResume(record.resume),
    companyName: optionalString(record, 'companyName'),
    gender: optionalString(record, 'gender'),
    idNumber,
    birthDate: optionalDate(record, 'birthDate'),
    personalEmail,
    education: optionalString(record, 'education'),
    major: optionalString(record, 'major'),
    school: optionalString(record, 'school'),
    graduationDate: optionalDate(record, 'graduationDate'),
    maritalStatus: optionalString(record, 'maritalStatus'),
    hasChildren: optionalString(record, 'hasChildren'),
    hometown: optionalString(record, 'hometown'),
    emergencyContact: optionalString(record, 'emergencyContact'),
    emergencyContactPhone: optionalString(record, 'emergencyContactPhone'),
    residentialAddress: optionalString(record, 'residentialAddress'),
    idAddress: optionalString(record, 'idAddress'),
    bankAccount: optionalString(record, 'bankAccount'),
    bankName: optionalString(record, 'bankName'),
    archiveNo: optionalString(record, 'archiveNo'),
    notes: optionalString(record, 'notes'),
    departmentLevel2: optionalString(record, 'departmentLevel2'),
    probationMonths: optionalInteger(record, 'probationMonths', 1, 12),
    expectedRegularDate: optionalDate(record, 'expectedRegularDate'),
    actualRegularDate: optionalDate(record, 'actualRegularDate'),
    contractEndDate: optionalDate(record, 'contractEndDate'),
  }
}

