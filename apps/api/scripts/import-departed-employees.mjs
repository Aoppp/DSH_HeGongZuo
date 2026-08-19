// 离职人员档案增量导入：data/王叔和离职.xlsx → employees 表（不会清空已有员工）。
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ExcelJS from 'exceljs'

import { pool } from './database.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const workbookPath = path.join(projectRoot, 'data', '王叔和离职.xlsx')
const apply = process.argv.includes('--apply')
const employmentTypeMap = { '合同工': 'full_time', '兼职': 'part_time', '实习协议': 'intern' }

function raw(cell) {
  const value = cell.value
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('result' in value && value.result !== undefined) return value.result
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
  }
  return value
}

function text(cell) {
  const value = raw(cell)
  const result = value === null || value === undefined ? '' : String(value).trim()
  return !result || result === '—' || result === '/' ? null : result
}

function date(cell) {
  const value = raw(cell)
  if (!value || value === '—' || value === '/') return null
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  const match = String(value).match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (!match) return null
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function normalizeDepartureReason(value) {
  if (!value || !/^\d{4,5}(?:\.0+)?$/.test(value)) return value
  const serial = Number(value)
  if (serial < 30_000 || serial > 60_000) return value
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10)
}

async function readEmployees() {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(workbookPath)
  const sheet = workbook.getWorksheet('离职人员')
  if (!sheet) throw new Error('未找到工作表“离职人员”。')
  const headers = new Map()
  sheet.getRow(1).eachCell((cell, column) => headers.set(cell.text.trim(), column))
  const cell = (row, header) => row.getCell(headers.get(header))
  const employees = []
  for (let number = 2; number <= sheet.rowCount; number++) {
    const row = sheet.getRow(number)
    const displayName = text(cell(row, '姓名'))
    if (!displayName) continue
    employees.push({
      displayName,
      workEmail: text(cell(row, '公司邮箱')),
      workPhone: text(cell(row, '联系方式')) ?? '',
      departmentName: text(cell(row, '一级部门')) ?? '未填写',
      jobTitle: text(cell(row, '职位')) ?? '未填写',
      employmentType: employmentTypeMap[text(cell(row, '用工类型'))] ?? 'full_time',
      status: 'inactive', hireDate: date(cell(row, '入职时间')), workLocation: null, responsibilities: '',
      companyName: text(cell(row, '所属公司')), gender: text(cell(row, '性别')), idNumber: text(cell(row, '身份证')),
      birthDate: date(cell(row, '出生日期')), personalEmail: text(cell(row, '邮箱')), education: text(cell(row, '学历')),
      major: text(cell(row, '专业')), school: text(cell(row, '毕业学校')), graduationDate: date(cell(row, '毕业时间')),
      maritalStatus: text(cell(row, '婚否')), hasChildren: text(cell(row, '育否')), hometown: text(cell(row, '籍贯')),
      emergencyContact: text(cell(row, '紧急联系人')), emergencyContactPhone: text(cell(row, '紧急联系人电话')),
      residentialAddress: text(cell(row, '居住住址')), idAddress: text(cell(row, '身份证地址')),
      bankAccount: text(cell(row, '银行卡号')), bankName: text(cell(row, '支行信息')),
      archiveNo: text(cell(row, '档案编号')), notes: text(cell(row, '备注')), departmentLevel2: text(cell(row, '二级部门')),
      departureDate: date(cell(row, '离职日期')), departureReason: normalizeDepartureReason(text(cell(row, '离职原因（公司内部查看使用）'))),
    })
  }
  if (employees.length !== 194) throw new Error(`预期 194 名离职人员，实际解析到 ${employees.length} 名。`)
  return employees
}

const employees = await readEmployees()
console.log(`解析完成：${employees.length} 名离职人员。`)
if (!apply) { console.log('本次为 dry-run，未写入数据库。'); await pool.end(); process.exit(0) }

const columns = ['id', 'display_name', 'work_email', 'work_phone', 'department_name', 'job_title', 'employment_type', 'status', 'hire_date', 'work_location', 'responsibilities', 'company_name', 'gender', 'id_number', 'birth_date', 'personal_email', 'education', 'major', 'school', 'graduation_date', 'marital_status', 'has_children', 'hometown', 'emergency_contact', 'emergency_contact_phone', 'residential_address', 'id_address', 'bank_account', 'bank_name', 'archive_no', 'notes', 'department_level2', 'departure_date', 'departure_reason']
const client = await pool.connect()
try {
  await client.query('BEGIN')
  let imported = 0
  for (const employee of employees) {
    const exists = await client.query('SELECT 1 FROM employees WHERE display_name = $1 AND id_number IS NOT DISTINCT FROM $2 AND departure_date IS NOT DISTINCT FROM $3 LIMIT 1', [employee.displayName, employee.idNumber, employee.departureDate])
    if (exists.rowCount) continue
    const idResult = await client.query("SELECT nextval('employee_id_seq')::text AS value")
    const id = `EMP-${(idResult.rows[0]?.value ?? '').padStart(4, '0')}`
    const values = [id, ...columns.slice(1).map((column) => employee[column.replace(/_([a-z])/g, (_, char) => char.toUpperCase())])]
    await client.query(`INSERT INTO employees (${columns.join(', ')}) VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})`, values)
    imported++
  }
  await client.query('COMMIT')
  console.log(`导入完成：新增 ${imported} 名离职人员。`)
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally { client.release(); await pool.end() }
