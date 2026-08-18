import { readFile } from 'node:fs/promises'

const fixtureUrl = new URL(
  '../packages/employee-domain/fixtures/employees.mock.json',
  import.meta.url,
)
const dataset = JSON.parse(await readFile(fixtureUrl, 'utf8'))

/** @type {string[]} */
const errors = []

/**
 * @param {unknown} condition
 * @param {string} message
 */
function assert(condition, message) {
  if (!condition) errors.push(message)
}

/** @type {Array<Record<string, any>>} */
const employees = Array.isArray(dataset.employees) ? dataset.employees : []
const allowedStatuses = new Set(['probation', 'active', 'on_leave', 'inactive'])
const allowedEmploymentTypes = new Set([
  'full_time',
  'part_time',
  'contractor',
  'intern',
])
const requiredStringFields = [
  'id',
  'displayName',
  'workPhone',
  'departmentName',
  'jobTitle',
  'employmentType',
  'status',
  'hireDate',
  'workLocation',
  'responsibilities',
]

assert(dataset.metadata?.version === 1, 'metadata.version 必须为 1。')
assert(dataset.metadata?.source === 'synthetic', '数据源必须标记为 synthetic。')
assert(
  dataset.metadata?.classification === 'synthetic-non-personal',
  '数据分类必须标记为 synthetic-non-personal。',
)
assert(employees.length === 10, 'Mock 数据必须恰好包含 10 名员工。')
assert(
  dataset.metadata?.recordCount === employees.length,
  'metadata.recordCount 必须与员工数量一致。',
)

for (const [index, employee] of employees.entries()) {
  const label = `employees[${index}]`

  for (const field of requiredStringFields) {
    assert(
      typeof employee[field] === 'string' && employee[field].trim().length > 0,
      `${label}.${field} 必须是非空字符串。`,
    )
  }

  assert(/^EMP-\d{4}$/.test(employee.id), `${label}.id 格式无效。`)
  assert(
    employee.workEmail === null || /^[a-z0-9.]+@example\.com$/.test(employee.workEmail),
    `${label}.workEmail 必须为 null 或使用 example.com 测试域名。`,
  )
  assert(
    employee.workPhone.startsWith('+86-000-'),
    `${label}.workPhone 必须使用明显虚构的测试号码。`,
  )
  assert(
    allowedStatuses.has(employee.status),
    `${label}.status 不在允许范围内。`,
  )
  assert(
    allowedEmploymentTypes.has(employee.employmentType),
    `${label}.employmentType 不在允许范围内。`,
  )
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(employee.hireDate) &&
      !Number.isNaN(Date.parse(`${employee.hireDate}T00:00:00Z`)),
    `${label}.hireDate 不是有效日期。`,
  )
  assert(
    employee.resumeFileName === null || typeof employee.resumeFileName === 'string',
    `${label}.resumeFileName 必须是字符串或 null。`,
  )
  assert(
    employee.resumeMimeType === null || typeof employee.resumeMimeType === 'string',
    `${label}.resumeMimeType 必须是字符串或 null。`,
  )
  assert(
    employee.resumeSize === null || (Number.isInteger(employee.resumeSize) && employee.resumeSize >= 0),
    `${label}.resumeSize 必须是非负整数或 null。`,
  )
}

for (const field of ['id', 'workEmail']) {
  const values = employees.map((employee) => employee[field]).filter((value) => value !== null)
  assert(new Set(values).size === values.length, `${field} 必须全局唯一。`)
}

if (errors.length > 0) {
  console.error(`员工测试数据校验失败，共 ${errors.length} 个问题：`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  const departments = new Set(
    employees.map((employee) => employee.departmentName),
  )
  console.log(
    `员工测试数据校验通过：${employees.length} 名虚构员工，${departments.size} 个部门。`,
  )
}
