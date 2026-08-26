export const employeeStatuses = [
  'probation',
  'active',
  'on_leave',
  'inactive',
] as const

export type EmployeeStatus = (typeof employeeStatuses)[number]

// 员工管理模块对账号系统公开的能力标识；平台前后端以此为唯一事实来源。
export const employeeManagementPermissionIds = ['employee-data', 'employee-query', 'employee-attendance', 'employee-reports'] as const
export type EmployeeManagementPermissionId = (typeof employeeManagementPermissionIds)[number]

// 平台业务管理权限的单一事实来源；新增管理模块时在此注册对应权限。
export const platformManagementPermissionIds = [
  ...employeeManagementPermissionIds,
  'finance-management',
  'project-management',
  'management-cockpit',
  'platform-administration',
] as const
export type PlatformManagementPermissionId = (typeof platformManagementPermissionIds)[number]

export const employmentTypes = [
  'full_time',
  'part_time',
  'contractor',
  'intern',
] as const

export type EmploymentType = (typeof employmentTypes)[number]

/** 中国大陆手机号码或固定电话号码（固定电话可带区号及连字符）。 */
export function isValidChinesePhone(value: string): boolean {
  const normalized = value.replace(/[\s-]/g, '')
  return /^1[3-9]\d{9}$/.test(normalized) || /^0\d{9,11}$/.test(normalized)
}

/** 校验 18 位中国居民身份证的格式、出生日期与校验码。 */
export function isValidChineseIdNumber(value: string): boolean {
  const normalized = value.trim().toUpperCase()
  if (!/^\d{17}[\dX]$/.test(normalized)) return false
  const year = Number(normalized.slice(6, 10))
  const month = Number(normalized.slice(10, 12))
  const day = Number(normalized.slice(12, 14))
  const birthday = new Date(Date.UTC(year, month - 1, day))
  if (birthday.getUTCFullYear() !== year || birthday.getUTCMonth() !== month - 1 || birthday.getUTCDate() !== day) return false
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const checks = '10X98765432'
  const checksum = normalized.slice(0, 17).split('').reduce((sum, digit, index) => sum + Number(digit) * (weights[index] ?? 0), 0)
  return checks[checksum % 11] === normalized[17]
}

// 前端默认脱敏、Agent 工具白名单不返回的敏感字段（单一事实源）
export const sensitiveEmployeeFields = [
  'idNumber',
  'bankAccount',
  'residentialAddress',
  'idAddress',
] as const

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
  // —— 个人档案字段（data/王叔和在职.xlsx 导入，均可空）——
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
  readonly departureDate?: string | null
  readonly departureReason?: string | null
}

export interface EmployeeDatasetMetadata {
  readonly version: 1
  readonly source: 'synthetic'
  readonly classification: 'synthetic-non-personal'
  readonly generatedAt: string
  readonly recordCount: number
  readonly notice: string
}

export interface EmployeeDataset {
  readonly metadata: EmployeeDatasetMetadata
  readonly employees: readonly EmployeeRecord[]
}
