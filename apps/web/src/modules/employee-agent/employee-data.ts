export const employeeStatuses = ['probation', 'active', 'on_leave', 'inactive'] as const
export const employmentTypes = ['full_time', 'part_time', 'contractor', 'intern'] as const

export type EmployeeStatus = (typeof employeeStatuses)[number]
export type EmploymentType = (typeof employmentTypes)[number]

export const sensitiveEmployeeFields = ['idNumber', 'bankAccount', 'residentialAddress', 'idAddress'] as const
export type SensitiveEmployeeField = (typeof sensitiveEmployeeFields)[number]

export interface EmployeeRecord {
  readonly id: string
  readonly displayName: string
  readonly workEmail: string | null
  readonly workPhone: string
  readonly departmentName: string
  readonly jobTitle: string
  readonly employmentType: EmploymentType
  readonly status: EmployeeStatus
  readonly hireDate: string
  readonly workLocation: string
  readonly responsibilities: string
  readonly resumeFileName: string | null
  readonly resumeMimeType: string | null
  readonly resumeSize: number | null
  // —— 个人档案字段（与数据库列一一对应，均可空）——
  readonly companyName?: string | null
  readonly gender?: string | null
  readonly idNumber?: string | null
  readonly birthDate?: string | null
  readonly personalEmail?: string | null
  readonly education?: string | null
  readonly major?: string | null
  readonly school?: string | null
  readonly graduationDate?: string | null
  readonly maritalStatus?: string | null
  readonly hasChildren?: string | null
  readonly hometown?: string | null
  readonly emergencyContact?: string | null
  readonly emergencyContactPhone?: string | null
  readonly residentialAddress?: string | null
  readonly idAddress?: string | null
  readonly bankAccount?: string | null
  readonly bankName?: string | null
  readonly archiveNo?: string | null
  readonly notes?: string | null
  readonly departmentLevel2?: string | null
  readonly probationMonths?: number | null
  readonly expectedRegularDate?: string | null
  readonly actualRegularDate?: string | null
  readonly contractEndDate?: string | null
}

// —— 敏感字段脱敏与派生计算（纯函数，可单测）——

export type MaskKind = 'idNumber' | 'bankAccount' | 'address'

export function maskValue(value: string | null | undefined, kind: MaskKind): string | null {
  const text = value?.trim()
  if (!text) return null
  if (kind === 'idNumber') {
    // 18 位身份证：前 4 + 星 + 后 4；护照等短值：前 4 字符 + 星
    if (text.length >= 14) return `${text.slice(0, 4)}${'*'.repeat(10)}${text.slice(-4)}`
    return `${text.slice(0, 4)}****`
  }
  if (kind === 'bankAccount') {
    const starCount = Math.max(4, text.length - 8)
    return `${text.slice(0, 4)}${'*'.repeat(starCount)}${text.slice(-4)}`
  }
  return `${text.slice(0, 6)}****`
}

export function contractDaysLeft(contractEndDate: string | null | undefined): number | null {
  if (!contractEndDate) return null
  const end = new Date(`${contractEndDate}T00:00:00`)
  if (Number.isNaN(end.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - today.getTime()) / 86_400_000)
}

export function employeeAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null
  const birth = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const beforeBirthday = today.getMonth() < birth.getMonth()
    || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  if (beforeBirthday) age -= 1
  return age
}

export function tenureMonths(hireDate: string | null | undefined): number | null {
  if (!hireDate) return null
  const hire = new Date(`${hireDate}T00:00:00`)
  if (Number.isNaN(hire.getTime())) return null
  const today = new Date()
  const months = (today.getFullYear() - hire.getFullYear()) * 12 + (today.getMonth() - hire.getMonth())
  return today.getDate() < hire.getDate() ? months - 1 : months
}

export interface ResumeUploadPayload {
  readonly fileName: string
  readonly mimeType: string
  readonly base64: string
}

interface EmployeeListResponse {
  readonly employees: EmployeeRecord[]
}

interface EmployeeResponse {
  readonly employee: EmployeeRecord
}

interface ErrorResponse {
  readonly error?: string
}

export class EmployeeApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('hegongzuo.session.token')
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (response.status === 401) {
    // 会话过期：清除本地登录态并回到登录页
    localStorage.removeItem('hegongzuo.session.token')
    window.location.reload()
    throw new EmployeeApiError(401, '登录已过期，请重新登录。')
  }
  if (!response.ok) {
    let message = `员工 API 请求失败（HTTP ${response.status}）。`
    try {
      const error = await response.json() as ErrorResponse
      if (error.error) message = error.error
    } catch {
      // 非 JSON 错误响应使用 HTTP 状态信息。
    }
    throw new EmployeeApiError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function readEmployeeRecords(): Promise<EmployeeRecord[]> {
  return (await apiRequest<EmployeeListResponse>('/api/employees')).employees
}

export async function createEmployeeRecord(employee: EmployeeRecord, resume?: ResumeUploadPayload | null): Promise<EmployeeRecord> {
  return (await apiRequest<EmployeeResponse>('/api/employees', {
    method: 'POST',
    body: JSON.stringify({ ...employee, ...(resume !== undefined ? { resume } : {}) }),
  })).employee
}

export async function updateEmployeeRecord(employee: EmployeeRecord, resume?: ResumeUploadPayload | null): Promise<EmployeeRecord> {
  return (await apiRequest<EmployeeResponse>(`/api/employees/${encodeURIComponent(employee.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...employee, ...(resume !== undefined ? { resume } : {}) }),
  })).employee
}

export async function deleteEmployeeRecord(id: string): Promise<void> {
  await apiRequest<void>(`/api/employees/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function employeeResumeUrl(id: string): string {
  return `/api/employees/${encodeURIComponent(id)}/resume`
}

export async function resumeUploadPayload(file: File): Promise<ResumeUploadPayload> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法读取简历文件。')), { once: true })
    reader.addEventListener('error', () => reject(new Error('无法读取简历文件。')), { once: true })
    reader.readAsDataURL(file)
  })
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const extension = file.name.split('.').at(-1)?.toLocaleLowerCase()
  const mimeType = file.type || (extension === 'pdf'
    ? 'application/pdf'
    : extension === 'doc'
      ? 'application/msword'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  return { fileName: file.name, mimeType, base64 }
}

export function nextEmployeeIdentity(employees: readonly EmployeeRecord[]): { id: string } {
  const nextNumber = employees.reduce((maximum, employee) => {
    const numericId = Number(employee.id.match(/(\d+)$/)?.[1] ?? 0)
    return Math.max(maximum, numericId)
  }, 0) + 1
  const suffix = String(nextNumber).padStart(4, '0')
  return { id: `NEW-${suffix}` }
}
