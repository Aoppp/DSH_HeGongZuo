import type { EmployeeRecord, EmploymentType } from './employee-data'

export const employeePasteColumns = [
  '所属公司', '姓名', '入职时间', '试用期时长（月）', '预计转正日期', '实际转正日期', '合同到期日期', '合同到期',
  '一级部门', '二级部门', '职位', '用工类型', '性别', '身份证', '出生日期', '年龄', '工龄（月）', '联系方式',
  '邮箱', '企业邮箱', '学历', '专业', '毕业学校', '毕业时间', '婚否', '育否', '籍贯', '紧急联系人', '紧急联系人电话', '居住住址',
  '身份证地址', '银行卡', '银行信息',
] as const

export type EmployeePasteValues = Pick<EmployeeRecord,
  'companyName' | 'displayName' | 'hireDate' | 'probationMonths' | 'expectedRegularDate' | 'actualRegularDate' |
  'contractEndDate' | 'departmentName' | 'departmentLevel2' | 'jobTitle' | 'employmentType' | 'gender' | 'idNumber' |
  'birthDate' | 'workPhone' | 'personalEmail' | 'workEmail' | 'education' | 'major' | 'school' | 'graduationDate' |
  'maritalStatus' | 'hasChildren' | 'hometown' |
  'emergencyContact' | 'emergencyContactPhone' | 'residentialAddress' | 'idAddress' | 'bankAccount' | 'bankName'>

export interface EmployeePasteResult {
  readonly cells: readonly string[]
  readonly values: EmployeePasteValues | null
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
}

function optional(value: string): string | null { return value.trim() || null }

function date(value: string, label: string, errors: string[]): string | null {
  const text = value.trim()
  if (!text) return null
  const match = text.match(/^(\d{4})[年/.\-](\d{1,2})[月/.\-](\d{1,2})日?$/)
  if (!match) { errors.push(`${label}格式应为年/月/日。`); return null }
  const normalized = `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`
  const parsed = new Date(`${normalized}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) { errors.push(`${label}不是有效日期。`); return null }
  return normalized
}

function employmentType(value: string, errors: string[]): EmploymentType {
  const key = value.trim().toLocaleLowerCase('zh-CN')
  const types: Record<string, EmploymentType> = { '': 'full_time', '全职': 'full_time', '合同工': 'full_time', '正式': 'full_time', '正式员工': 'full_time', 'full_time': 'full_time', '兼职': 'part_time', 'part_time': 'part_time', '外包': 'contractor', '劳务': 'contractor', 'contractor': 'contractor', '实习': 'intern', '实习生': 'intern', 'intern': 'intern' }
  const result = types[key]
  if (!result) { errors.push(`无法识别用工类型“${value.trim()}”。`); return 'full_time' }
  return result
}

function wholeMonths(start: string, end = new Date()): number {
  const value = new Date(`${start}T00:00:00`)
  let months = (end.getFullYear() - value.getFullYear()) * 12 + end.getMonth() - value.getMonth()
  if (end.getDate() < value.getDate()) months -= 1
  return months
}

function numericCheck(raw: string, expected: number | null, label: string, warnings: string[]): void {
  if (!raw.trim() || expected === null) return
  const supplied = Number(raw.match(/-?\d+/)?.[0])
  if (Number.isFinite(supplied) && supplied !== expected) warnings.push(`${label}粘贴值为 ${supplied}，系统计算值为 ${expected}，将使用系统计算值。`)
}

export function parseEmployeePaste(text: string, now = new Date()): EmployeePasteResult {
  const withoutTrailingLineBreak = text.replace(/[\r\n]+$/, '')
  if (!withoutTrailingLineBreak.trim()) return { cells: [], values: null, errors: ['请先从 Excel 复制一行员工数据。'], warnings: [] }
  if (/[\r\n]/.test(withoutTrailingLineBreak)) return { cells: [], values: null, errors: ['一次只能识别一行员工数据。'], warnings: [] }
  const cells = withoutTrailingLineBreak.split('\t').map((cell) => cell.trim())
  if (cells.length !== employeePasteColumns.length) return { cells, values: null, errors: [`应包含 ${employeePasteColumns.length} 列，当前识别到 ${cells.length} 列。请保留 Excel 中的空单元格。`], warnings: [] }

  const errors: string[] = [], warnings: string[] = []
  const hireDate = date(cells[2]!, '入职时间', errors)
  const expectedRegularDate = date(cells[4]!, '预计转正日期', errors)
  const actualRegularDate = date(cells[5]!, '实际转正日期', errors)
  const contractEndDate = date(cells[6]!, '合同到期日期', errors)
  const birthDate = date(cells[14]!, '出生日期', errors)
  const graduationDate = date(cells[23]!, '毕业时间', errors)
  const probationText = cells[3]!
  const probation = probationText ? Number(probationText) : null
  if (probation !== null && (!Number.isInteger(probation) || probation < 1 || probation > 12)) errors.push('试用期时长必须是1至12之间的整数。')

  if (birthDate) {
    const birth = new Date(`${birthDate}T00:00:00`)
    let age = now.getFullYear() - birth.getFullYear()
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1
    numericCheck(cells[15]!, age, '年龄', warnings)
  }
  if (hireDate) numericCheck(cells[16]!, wholeMonths(hireDate, now), '工龄（月）', warnings)
  if (contractEndDate) {
    const today = new Date(now); today.setHours(0, 0, 0, 0)
    const end = new Date(`${contractEndDate}T00:00:00`)
    numericCheck(cells[7]!, Math.round((end.getTime() - today.getTime()) / 86_400_000), '合同剩余天数', warnings)
  }
  if (hireDate && probation && expectedRegularDate) {
    const expected = new Date(`${hireDate}T00:00:00Z`); expected.setUTCMonth(expected.getUTCMonth() + probation)
    if (expected.toISOString().slice(0, 10) !== expectedRegularDate) warnings.push('预计转正日期与入职时间、试用期计算结果不一致，请确认。')
  }

  const values: EmployeePasteValues = {
    companyName: optional(cells[0]!), displayName: cells[1]!, hireDate: hireDate ?? '', probationMonths: probation,
    expectedRegularDate, actualRegularDate, contractEndDate, departmentName: cells[8]!, departmentLevel2: optional(cells[9]!),
    jobTitle: cells[10]!, employmentType: employmentType(cells[11]!, errors), gender: optional(cells[12]!), idNumber: optional(cells[13]!)?.toUpperCase() ?? null,
    birthDate, workPhone: cells[17]!, personalEmail: optional(cells[18]!), workEmail: optional(cells[19]!), education: optional(cells[20]!),
    major: optional(cells[21]!), school: optional(cells[22]!), graduationDate, maritalStatus: optional(cells[24]!),
    hasChildren: optional(cells[25]!), hometown: optional(cells[26]!), emergencyContact: optional(cells[27]!),
    emergencyContactPhone: optional(cells[28]!), residentialAddress: optional(cells[29]!), idAddress: optional(cells[30]!),
    bankAccount: optional(cells[31]!), bankName: optional(cells[32]!),
  }
  return { cells, values: errors.length ? null : values, errors, warnings }
}
