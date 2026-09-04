import assert from 'node:assert/strict'
import test from 'node:test'

import { employeePasteColumns, parseEmployeePaste } from '../src/modules/employee/data/employee-paste-parser.ts'

const row = [
  '王叔和工程公司', '张三', '2026/9/1', '6', '2027/3/1', '', '2027/9/1', '362',
  '研发部', '', '工程师', '全职', '男', '11010519491231002X', '1994/6/1', '32', '0', '13800138000',
  'personal@example.com', 'work@example.com', '本科', '生物工程', '测试大学', '2016/6/30', '已婚', '已育', '湖北武汉', '李四', '13900139000',
  '武汉市测试路', '湖北省测试地址', '6222020000000000000', '测试银行',
]

test('严格按33列识别员工数据并保留空单元格位置', () => {
  assert.equal(employeePasteColumns.length, 33)
  const result = parseEmployeePaste(`${row.join('\t')}\n`, new Date('2026-09-04T12:00:00+08:00'))
  assert.deepEqual(result.errors, [])
  assert.equal(result.cells.length, 33)
  assert.equal(result.values.companyName, '王叔和工程公司')
  assert.equal(result.values.displayName, '张三')
  assert.equal(result.values.hireDate, '2026-09-01')
  assert.equal(result.values.probationMonths, 6)
  assert.equal(result.values.expectedRegularDate, '2027-03-01')
  assert.equal(result.values.actualRegularDate, null)
  assert.equal(result.values.departmentName, '研发部')
  assert.equal(result.values.departmentLevel2, null)
  assert.equal(result.values.personalEmail, 'personal@example.com')
  assert.equal(result.values.workEmail, 'work@example.com')
  assert.equal(result.values.maritalStatus, '已婚')
  assert.equal(result.values.hasChildren, '已育')
  assert.equal(result.values.hometown, '湖北武汉')
})

test('列数不足、列数过多或粘贴多行时拒绝识别', () => {
  assert.match(parseEmployeePaste(row.slice(0, 32).join('\t')).errors[0], /应包含 33 列，当前识别到 32 列/)
  assert.match(parseEmployeePaste([...row, '多余'].join('\t')).errors[0], /应包含 33 列，当前识别到 34 列/)
  assert.match(parseEmployeePaste(`${row.join('\t')}\n${row.join('\t')}`).errors[0], /一次只能识别一行/)
})

test('将合同工识别为全职', () => {
  const changed = [...row]
  changed[11] = '合同工'
  const result = parseEmployeePaste(changed.join('\t'))
  assert.equal(result.values?.employmentType, 'full_time')
  assert.deepEqual(result.errors, [])
})

test('年龄、工龄和合同剩余天数只用于核对', () => {
  const changed = [...row]
  changed[15] = '99'
  changed[16] = '99'
  changed[7] = '99'
  const result = parseEmployeePaste(changed.join('\t'), new Date('2026-09-04T12:00:00+08:00'))
  assert.equal(result.values.birthDate, '1994-06-01')
  assert.equal(result.values.contractEndDate, '2027-09-01')
  assert.equal(result.warnings.length, 3)
  assert.equal('age' in result.values, false)
})
