import assert from 'node:assert/strict'
import test from 'node:test'

import { employeeAuditDetail } from '../dist/modules/employee/employee-audit.js'

function employee(overrides = {}) {
  return {
    id: 'EMP-0001', displayName: '测试员工', workEmail: null, workPhone: '13800138000', departmentName: '技术部', jobTitle: '工程师',
    employmentType: 'full_time', status: 'active', hireDate: '2026-01-01', workLocation: '', responsibilities: '', resumeFileName: null, resumeMimeType: null, resumeSize: null,
    ...overrides,
  }
}

test('员工审计仅记录变更字段名称，不记录敏感字段值', () => {
  const detail = employeeAuditDetail(employee(), employee({ workPhone: '13900139000', idNumber: '11010519491231002X', departmentName: '产品部' }))
  assert.deepEqual(detail, { employeeName: '测试员工', changedFields: ['部门名称', '工作电话', '身份证号'] })
  assert.equal(JSON.stringify(detail).includes('13900139000'), false)
})

test('新增员工与简历变更均会形成字段审计', () => {
  assert.ok(employeeAuditDetail(null, employee({ resumeFileName: 'resume.pdf' })).changedFields.includes('员工简历'))
  assert.deepEqual(employeeAuditDetail(employee(), employee(), true).changedFields, ['员工简历'])
})
