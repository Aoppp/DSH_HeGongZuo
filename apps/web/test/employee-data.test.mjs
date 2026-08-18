import assert from 'node:assert/strict'
import test from 'node:test'

import {
  contractDaysLeft,
  employeeAge,
  maskValue,
  tenureMonths,
} from '../src/modules/employee-agent/employee-data.ts'

function localDate(offsetDays) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

test('身份证默认脱敏为前4后4', () => {
  assert.equal(maskValue('110101199003070011', 'idNumber'), '1101**********0011')
})

test('护照等短值脱敏保留前4字符', () => {
  assert.equal(maskValue('护照：AJ624091', 'idNumber'), '护照：A****')
})

test('银行卡脱敏为前4星后4', () => {
  assert.equal(maskValue('6222020200112233445', 'bankAccount'), '6222***********3445')
})

test('地址脱敏保留前6字符', () => {
  assert.equal(maskValue('湖北省武汉市东西湖区银潭路26栋', 'address'), '湖北省武汉市****')
})

test('空值脱敏返回 null', () => {
  assert.equal(maskValue(null, 'idNumber'), null)
  assert.equal(maskValue('', 'bankAccount'), null)
  assert.equal(maskValue(undefined, 'address'), null)
})

test('合同剩余天数按今天计算', () => {
  assert.equal(contractDaysLeft(localDate(30)), 30)
  assert.equal(contractDaysLeft(localDate(-10)), -10)
  assert.equal(contractDaysLeft(null), null)
  assert.equal(contractDaysLeft('无效日期'), null)
})

test('年龄按出生日期计算周岁', () => {
  const today = new Date()
  const year = today.getFullYear() - 30
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  assert.equal(employeeAge(`${year}-${month}-${day}`), 30)
  assert.equal(employeeAge(null), null)
})

test('工龄按月计算', () => {
  const today = new Date()
  const hire = new Date(today.getFullYear() - 2, today.getMonth(), Math.min(today.getDate(), 28))
  const month = String(hire.getMonth() + 1).padStart(2, '0')
  const day = String(hire.getDate()).padStart(2, '0')
  const hireText = `${hire.getFullYear()}-${month}-${day}`
  assert.equal(tenureMonths(hireText), 24)
  assert.equal(tenureMonths(null), null)
})

// —— 列表排序 ——
import { compareEmployees } from '../src/modules/employee-agent/employee-sort.ts'

function record(overrides) {
  return {
    id: 'EMP-0001', displayName: '张三', workEmail: null, workPhone: '13800000000',
    departmentName: '品牌中心', jobTitle: '设计师',
    employmentType: 'full_time', status: 'active', hireDate: '2024-01-01',
    workLocation: '', responsibilities: '', resumeFileName: null,
    resumeMimeType: null, resumeSize: null, ...overrides,
  }
}

test('按入职时间升序排序', () => {
  const early = record({ id: 'EMP-0001', displayName: '甲', hireDate: '2022-01-01' })
  const late = record({ id: 'EMP-0002', displayName: '乙', hireDate: '2024-01-01' })
  assert.ok(compareEmployees(early, late, 'hireDate', true) < 0)
  assert.ok(compareEmployees(early, late, 'hireDate', false) > 0)
})

test('按姓名中文排序', () => {
  const a = record({ displayName: '陈晨' })
  const b = record({ displayName: '张伟' })
  assert.ok(compareEmployees(a, b, 'displayName', true) < 0)
})

test('无合同到期日期的员工始终排在最后', () => {
  const noContract = record({ id: 'EMP-0003', displayName: '无合同', contractEndDate: null })
  const withContract = record({ id: 'EMP-0004', displayName: '有合同', contractEndDate: '2030-01-01' })
  assert.ok(compareEmployees(withContract, noContract, 'contractEndDate', true) < 0)
  assert.ok(compareEmployees(withContract, noContract, 'contractEndDate', false) < 0)
})
