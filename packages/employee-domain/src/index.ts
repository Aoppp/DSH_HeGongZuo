export const employeeStatuses = [
  'probation',
  'active',
  'on_leave',
  'inactive',
] as const

export type EmployeeStatus = (typeof employeeStatuses)[number]

export const employmentTypes = [
  'full_time',
  'part_time',
  'contractor',
  'intern',
] as const

export type EmploymentType = (typeof employmentTypes)[number]

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
