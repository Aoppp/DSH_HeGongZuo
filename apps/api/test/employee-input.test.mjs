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

test('员工日期拒绝自动进位，离职日期和原因进入同一个保存请求', () => {
  for (const field of ['hireDate', 'birthDate', 'departureDate', 'contractEndDate']) {
    assert.throws(() => parseEmployeeInput(employee({ [field]: '2026-02-30' })), /格式无效/)
  }
  const input = parseEmployeeInput(employee({ status: 'inactive', departureDate: '2026-09-01', departureReason: '个人原因' }))
  assert.equal(input.departureDate, '2026-09-01')
  assert.equal(input.departureReason, '个人原因')
})

test('员工联系方式和身份证号拒绝无效格式', () => {
  for (const overrides of [{ workPhone: '12345' }, { emergencyContactPhone: '12345' }, { idNumber: '110105194912310021' }]) {
    assert.throws(() => parseEmployeeInput(employee(overrides)), EmployeeValidationError)
  }
})

test('试用期时长接受0至12的整数或留空', () => {
  assert.equal(parseEmployeeInput(employee({ probationMonths: 0 })).probationMonths, 0)
  assert.equal(parseEmployeeInput(employee({ probationMonths: 12 })).probationMonths, 12)
  assert.equal(parseEmployeeInput(employee({ probationMonths: null })).probationMonths, null)
  for (const probationMonths of [-1, 13, 1.5]) {
    assert.throws(() => parseEmployeeInput(employee({ probationMonths })), EmployeeValidationError)
  }
})

test('婚否和育否仅接受规定值或留空', () => {
  assert.equal(parseEmployeeInput(employee({ maritalStatus: '离异' })).maritalStatus, '离异')
  assert.equal(parseEmployeeInput(employee({ hasChildren: '未育' })).hasChildren, '未育')
  assert.equal(parseEmployeeInput(employee({ maritalStatus: '', hasChildren: null })).maritalStatus, null)
  assert.throws(() => parseEmployeeInput(employee({ maritalStatus: '未知' })), /婚否只能填写未婚、已婚、离异/)
  assert.throws(() => parseEmployeeInput(employee({ hasChildren: '否' })), /育否只能填写未育、已育/)
})
