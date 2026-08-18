// 正式员工数据导入：data/王叔和在职.xlsx → PostgreSQL employees 表
// 默认 dry-run（只解析、校验并输出问题清单）；加 --apply 才执行清空导入（单事务原子）。
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ExcelJS from 'exceljs'

import { pool } from './database.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const workbookPath = path.join(projectRoot, 'data', '王叔和在职.xlsx')
const reportPath = path.join(projectRoot, 'data', 'import-issues.md')
const apply = process.argv.includes('--apply')

// Excel 表头 → employees 列（'/ 表示占位空值；派生列与序号不导入）
const columnMapping = {
  '所属公司': 'company_name',
  '姓名': 'display_name',
  '入职时间': 'hire_date',
  '试用期时长（月）': 'probation_months',
  '预计转正日期': 'expected_regular_date',
  '实际转正日期': 'actual_regular_date',
  '合同到期日期': 'contract_end_date',
  '一级部门': 'department_name',
  '二级部门': 'department_level2',
  '职位': 'job_title',
  '用工类型': 'employment_type',
  '性别': 'gender',
  '出生日期': 'birth_date',
  '身份证': 'id_number',
  '联系方式': 'work_phone',
  '邮箱': 'personal_email',
  '企业邮箱': 'work_email',
  '学历': 'education',
  '专业': 'major',
  '毕业学校': 'school',
  '毕业时间': 'graduation_date',
  '婚否': 'marital_status',
  '育否': 'has_children',
  '籍贯': 'hometown',
  '紧急联系人': 'emergency_contact',
  '紧急联系人电话': 'emergency_contact_phone',
  '居住住址': 'residential_address',
  '身份证地址': 'id_address',
  '银行卡': 'bank_account',
  '银行信息': 'bank_name',
  '档案编号': 'archive_no',
  '备注': 'notes',
}

const employmentTypeMap = { '合同工': 'full_time', '实习协议': 'intern' }

const insertColumns = [
  'id', 'display_name', 'work_email', 'work_phone',
  'department_name', 'job_title',
  'employment_type', 'status', 'hire_date', 'work_location', 'responsibilities',
  'company_name', 'gender', 'id_number', 'birth_date',
  'personal_email', 'education', 'major', 'school', 'graduation_date',
  'marital_status', 'has_children', 'hometown',
  'emergency_contact', 'emergency_contact_phone',
  'residential_address', 'id_address', 'bank_account', 'bank_name',
  'archive_no', 'notes', 'department_level2', 'probation_months',
  'expected_regular_date', 'actual_regular_date', 'contract_end_date',
]

// 统一读取单元格原始值：公式取缓存结果，超链接取显示文本，其余原样
function rawValue(cell) {
  const value = cell.value
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    if (typeof value.result !== 'undefined') return value.result
    if (typeof value.text === 'string') return value.text
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
  }
  return value
}

function dateCell(cell) {
  const value = rawValue(cell)
  if (value === null || value === undefined || value === '/') return null
  if (value instanceof Date) {
    // 本地时区 getter（禁用 toISOString，UTC+8 会偏移一天）；
    // 带时间分量的序列号（如 40728.6）取整到日。
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const text = String(value).trim()
  if (text === '' || text === '/') return null
  // 公式缓存结果是 ISO 字符串（如 1990-08-18T00:00:00.000Z），取日期部分
  return text.slice(0, 10)
}

function textCell(cell) {
  const value = rawValue(cell)
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (text === '' || text === '/') return null
  return text
}

function numberTextCell(cell) {
  const value = rawValue(cell)
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return String(value)
  const text = String(value).trim()
  if (text === '' || text === '/') return null
  return text
}

function smallIntCell(cell) {
  const value = rawValue(cell)
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  const text = String(value).trim()
  if (text === '' || text === '/') return null
  return Number(text)
}

const issues = []
function issue(category, message) {
  issues.push({ category, message })
}

async function parseWorkbook() {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(workbookPath)
  const sheet = workbook.getWorksheet('王叔和在职')
  if (!sheet) throw new Error('未找到工作表“王叔和在职”。')

  const headerRow = sheet.getRow(1)
  const headerIndex = new Map()
  headerRow.eachCell((cell, colNumber) => {
    const header = String(cell.value).trim()
    if (header) headerIndex.set(header, colNumber)
  })

  const rows = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const nameCell = sheet.getCell(rowNumber, headerIndex.get('姓名'))
    if (nameCell.value === null || nameCell.value === undefined) continue
    rows.push({ rowNumber, cells: sheet.getRow(rowNumber) })
  }
  if (rows.length !== 82) {
    throw new Error(`预期 82 名员工，实际解析到 ${rows.length} 名，请核对 Excel 数据。`)
  }

  const employees = []
  const bankAccountOwners = new Map()
  for (const { rowNumber, cells } of rows) {
    const read = (header) => cells.getCell(headerIndex.get(header))
    const name = textCell(read('姓名'))

    const hireDate = dateCell(read('入职时间'))
    const actualRegular = dateCell(read('实际转正日期'))
    const expectedRegular = dateCell(read('预计转正日期'))
    const probationCell = read('试用期时长（月）')
    const probationMonths = smallIntCell(probationCell)
    const idNumber = textCell(read('身份证'))
    const bankAccount = textCell(read('银行卡'))
    const workPhone = numberTextCell(read('联系方式'))
    const emergencyPhone = numberTextCell(read('紧急联系人电话'))
    const graduationCell = read('毕业时间')
    const companyName = textCell(read('所属公司'))
    const employmentType = textCell(read('用工类型'))
    const rowNo = textCell(read('序号'))

    // 问题清单：不自动修改数据，仅标记
    if (probationMonths === null && actualRegular !== null) {
      issue('试用期未填写', `${name}：试用期时长为空，但已有实际转正日期 ${actualRegular}（行 ${rowNumber}）`)
    }
    if (actualRegular === null) {
      issue('无转正日期', `${name}：无实际转正日期（行 ${rowNumber}）`)
    }
    if (expectedRegular !== null && actualRegular !== null && expectedRegular !== actualRegular) {
      issue('转正日期不一致', `${name}：预计转正 ${expectedRegular}，实际转正 ${actualRegular}（行 ${rowNumber}）`)
    }
    if (companyName === '完素' || companyName === '子和') {
      issue('公司名疑似简称', `${name}：所属公司为“${companyName}”，与其余记录的完整公司名不一致（行 ${rowNumber}）`)
    }
    if (emergencyPhone !== null && workPhone !== null && emergencyPhone === workPhone) {
      issue('紧急联系人电话异常', `${name}：紧急联系人电话与本人电话相同（行 ${rowNumber}）`)
    }
    if (bankAccount === '待提供') {
      issue('银行卡待提供', `${name}：银行卡号为“待提供”（行 ${rowNumber}）`)
    }
    if (idNumber !== null && idNumber.startsWith('护照')) {
      issue('护照在身份证列', `${name}：身份证列为护照号（行 ${rowNumber}）`)
    }
    if (bankAccount !== null && bankAccount !== '待提供' && /^\d+$/.test(bankAccount)) {
      const owners = bankAccountOwners.get(bankAccount) ?? []
      owners.push(name)
      bankAccountOwners.set(bankAccount, owners)
    }
    const graduationRaw = rawValue(graduationCell)
    if (graduationRaw instanceof Date && (graduationRaw.getUTCHours() !== 0 || graduationRaw.getUTCMinutes() !== 0)) {
      issue('日期含时间分量', `${name}：毕业时间含时间分量，已取整到日（行 ${rowNumber}）`)
    }
    if (workPhone !== null && !/^1\d{10}$/.test(workPhone)) {
      issue('电话格式异常', `${name}：联系方式 ${workPhone} 不符合 11 位手机号格式（行 ${rowNumber}）`)
    }
    if (rowNo === '0') {
      issue('序号从 0 开始', 'Excel 序号列从 0 开始编号（信息性提示，不影响导入）')
    }
    if (employmentType !== null && employmentType !== '合同工' && employmentType !== '实习协议') {
      issue('用工类型未知', `${name}：用工类型“${employmentType}”无法映射（行 ${rowNumber}）`)
    }

    employees.push({
      displayName: name,
      workEmail: textCell(read('企业邮箱')),
      workPhone,
      departmentName: textCell(read('一级部门')),
      jobTitle: textCell(read('职位')),
      employmentType: employmentTypeMap[employmentType] ?? 'full_time',
      // 只有试用期时长有值且尚无实际转正日期的员工才算“试用期”；
      // 试用时长与转正日期均无数据的，默认按在职（active）处理。
      status: actualRegular !== null ? 'active' : probationMonths !== null ? 'probation' : 'active',
      hireDate,
      companyName,
      gender: textCell(read('性别')),
      idNumber,
      birthDate: dateCell(read('出生日期')),
      personalEmail: textCell(read('邮箱')),
      education: textCell(read('学历')),
      major: textCell(read('专业')),
      school: textCell(read('毕业学校')),
      graduationDate: dateCell(graduationCell),
      maritalStatus: textCell(read('婚否')),
      hasChildren: textCell(read('育否')),
      hometown: textCell(read('籍贯')),
      emergencyContact: textCell(read('紧急联系人')),
      emergencyContactPhone: emergencyPhone,
      residentialAddress: textCell(read('居住住址')),
      idAddress: textCell(read('身份证地址')),
      bankAccount,
      bankName: textCell(read('银行信息')),
      archiveNo: textCell(read('档案编号')),
      notes: textCell(read('备注')),
      departmentLevel2: textCell(read('二级部门')),
      probationMonths,
      expectedRegularDate: expectedRegular,
      actualRegularDate: actualRegular,
      contractEndDate: dateCell(read('合同到期日期')),
    })
  }

  for (const [account, owners] of bankAccountOwners) {
    if (owners.length > 1) {
      issue('银行卡多人共用', `${owners.join('、')} 共用同一银行卡（${account.slice(0, 4)}****${account.slice(-4)}）`)
    }
  }

  return employees
}

async function buildReport(employees, issues) {
  const lines = [
    '# 王叔和在职导入问题清单',
    '',
    `生成时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')} +08:00 前后（本文件位于 data/，已加入 Git 忽略）`,
    `导入记录：${employees.length} 名在职员工。以下问题均未自动修改，数据按 Excel 原样导入。`,
    '',
  ]
  if (issues.length === 0) {
    lines.push('未发现数据问题。')
  } else {
    const byCategory = new Map()
    for (const { category, message } of issues) {
      const list = byCategory.get(category) ?? []
      list.push(message)
      byCategory.set(category, list)
    }
    for (const [category, messages] of byCategory) {
      lines.push(`## ${category}（${messages.length}）`)
      lines.push('')
      for (const message of messages) lines.push(`- ${message}`)
      lines.push('')
    }
  }
  return `${lines.join('\n')}\n`
}

async function applyImport(employees) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('TRUNCATE TABLE employees')
    await client.query(`SELECT setval('employee_id_seq', 1, false)`)
    for (const employee of employees) {
      const idResult = await client.query("SELECT nextval('employee_id_seq')::text AS value")
      const id = `EMP-${(idResult.rows[0]?.value ?? '').padStart(4, '0')}`
      const values = [
        id,
        employee.displayName, employee.workEmail, employee.workPhone,
        employee.departmentName, employee.jobTitle,
        employee.employmentType, employee.status, employee.hireDate, null, '',
        employee.companyName, employee.gender, employee.idNumber, employee.birthDate,
        employee.personalEmail, employee.education, employee.major, employee.school, employee.graduationDate,
        employee.maritalStatus, employee.hasChildren, employee.hometown,
        employee.emergencyContact, employee.emergencyContactPhone,
        employee.residentialAddress, employee.idAddress, employee.bankAccount, employee.bankName,
        employee.archiveNo, employee.notes, employee.departmentLevel2, employee.probationMonths,
        employee.expectedRegularDate, employee.actualRegularDate, employee.contractEndDate,
      ]
      const placeholders = values.map((_, index) => `$${index + 1}`).join(', ')
      await client.query(
        `INSERT INTO employees (${insertColumns.join(', ')})
         VALUES (${placeholders})`,
        values,
      )
    }
    await client.query(`SELECT setval('employee_id_seq', ${employees.length}, true)`)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const employees = await parseWorkbook()
const report = await buildReport(employees, issues)

console.log(`解析完成：${employees.length} 名员工，发现 ${issues.length} 项问题（${new Set(issues.map((item) => item.category)).size} 类）。`)
for (const item of issues) {
  console.log(`  [${item.category}] ${item.message}`)
}

await writeFile(reportPath, report, 'utf8')
console.log(`问题清单已写入 ${path.relative(projectRoot, reportPath)}`)

if (!apply) {
  console.log('本次为 dry-run，未写入数据库。确认后使用 --apply 执行清空导入。')
  await pool.end()
  process.exit(0)
}

await applyImport(employees)
console.log(`导入完成：employees 表现有 ${employees.length} 名员工（原数据已清空）。`)
await pool.end()
