import assert from 'node:assert/strict'
import test from 'node:test'

import { EmployeeValidationError, parseEmployeeInput } from '../dist/modules/employee/employee-input.js'

function employee(overrides = {}) {
  return {
    displayName: '测试员工',
    workPhone: '13800138000',
    departmentName: '测试部门',
    jobTitle: '测试岗位',
    employmentType: 'full_time',
    status: 'active',
    hireDate: '2026-08-24',
    ...overrides,
  }
}

test('员工联系方式和身份证号通过格式校验，邮箱可留空', () => {
  const result = parseEmployeeInput(employee({ idNumber: '11010519491231002X', emergencyContactPhone: '010-12345678', workEmail: '', personalEmail: '' }))
  assert.equal(result.workEmail, null)
  assert.equal(result.personalEmail, null)
})

test('员工联系方式和身份证号拒绝无效格式', () => {
  for (const overrides of [{ workPhone: '12345' }, { emergencyContactPhone: '12345' }, { idNumber: '110105194912310021' }]) {
    assert.throws(() => parseEmployeeInput(employee(overrides)), EmployeeValidationError)
  }
})
