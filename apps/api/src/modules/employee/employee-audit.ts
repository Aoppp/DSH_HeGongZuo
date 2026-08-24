import type { EmployeeRecord } from '@hegongzuo/employee-domain'

const auditedFields: readonly [keyof EmployeeRecord, string][] = [
  ['displayName', '姓名'], ['companyName', '所属公司'], ['departmentName', '部门名称'], ['departmentLevel2', '二级部门'], ['jobTitle', '岗位'],
  ['employmentType', '用工类型'], ['status', '员工状态'], ['hireDate', '入职日期'], ['workLocation', '工作地点'], ['responsibilities', '员工职责'],
  ['workEmail', '工作邮箱'], ['workPhone', '工作电话'], ['personalEmail', '个人邮箱'], ['gender', '性别'], ['birthDate', '出生日期'],
  ['idNumber', '身份证号'], ['maritalStatus', '婚否'], ['hasChildren', '育否'], ['hometown', '籍贯'], ['emergencyContact', '紧急联系人'],
  ['emergencyContactPhone', '紧急联系人电话'], ['residentialAddress', '居住住址'], ['idAddress', '身份证地址'], ['education', '学历'],
  ['major', '专业'], ['school', '毕业学校'], ['graduationDate', '毕业时间'], ['bankAccount', '银行卡'], ['bankName', '开户行'],
  ['archiveNo', '档案编号'], ['probationMonths', '试用期'], ['expectedRegularDate', '预计转正日期'], ['actualRegularDate', '实际转正日期'],
  ['contractEndDate', '合同到期日期'], ['notes', '备注'], ['resumeFileName', '员工简历'],
]

function hasValue(value: unknown): boolean { return value !== null && value !== undefined && value !== '' }

/** 仅记录发生变更的字段名称，避免在审计表内复制身份证、电话等敏感内容。 */
export function employeeAuditDetail(previous: EmployeeRecord | null, current: EmployeeRecord, resumeChanged = false): { readonly employeeName: string; readonly changedFields: readonly string[] } {
  const changedFields = auditedFields
    .filter(([field]) => previous ? previous[field] !== current[field] : hasValue(current[field]))
    .map(([, label]) => label)
  if (resumeChanged && !changedFields.includes('员工简历')) changedFields.push('员工简历')
  return { employeeName: current.displayName, changedFields }
}
