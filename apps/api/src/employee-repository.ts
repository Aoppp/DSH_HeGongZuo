import type { EmployeeRecord } from '@hegongzuo/employee-domain'
import type { Pool, PoolClient } from 'pg'

import type { EmployeeInput, ResumeUpload } from './employee-input.js'

interface EmployeeRow {
  readonly id: string
  readonly display_name: string
  readonly work_email: string | null
  readonly work_phone: string
  readonly department_name: string
  readonly job_title: string
  readonly employment_type: EmployeeRecord['employmentType']
  readonly status: EmployeeRecord['status']
  readonly hire_date: string | Date
  readonly work_location: string | null
  readonly responsibilities: string
  readonly resume_file_name: string | null
  readonly resume_mime_type: string | null
  readonly resume_size: number | null
  readonly company_name: string | null
  readonly gender: string | null
  readonly id_number: string | null
  readonly birth_date: string | Date | null
  readonly personal_email: string | null
  readonly education: string | null
  readonly major: string | null
  readonly school: string | null
  readonly graduation_date: string | Date | null
  readonly marital_status: string | null
  readonly has_children: string | null
  readonly hometown: string | null
  readonly emergency_contact: string | null
  readonly emergency_contact_phone: string | null
  readonly residential_address: string | null
  readonly id_address: string | null
  readonly bank_account: string | null
  readonly bank_name: string | null
  readonly archive_no: string | null
  readonly notes: string | null
  readonly department_level2: string | null
  readonly probation_months: number | null
  readonly expected_regular_date: string | Date | null
  readonly actual_regular_date: string | Date | null
  readonly contract_end_date: string | Date | null
}

// pg 的 date 列返回本地午夜构造的 Date；必须用本地 getter 格式化，
// 否则 toISOString 按 UTC 输出会在东八区偏移一天。
function toDate(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return value.slice(0, 10)
}

export interface EmployeeResume {
  readonly fileName: string
  readonly mimeType: string
  readonly data: Buffer
}

const columns = `
  id, display_name, work_email, work_phone,
  department_name, job_title,
  employment_type, status, hire_date, work_location, responsibilities,
  resume_file_name, resume_mime_type, octet_length(resume_data)::integer AS resume_size,
  company_name, gender, id_number, birth_date,
  personal_email, education, major, school, graduation_date,
  marital_status, has_children, hometown,
  emergency_contact, emergency_contact_phone,
  residential_address, id_address, bank_account, bank_name,
  archive_no, notes, department_level2, probation_months,
  expected_regular_date, actual_regular_date, contract_end_date
`

function toEmployee(row: EmployeeRow): EmployeeRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    workEmail: row.work_email,
    workPhone: row.work_phone,
    departmentName: row.department_name,
    jobTitle: row.job_title,
    employmentType: row.employment_type,
    status: row.status,
    hireDate: toDate(row.hire_date) ?? '',
    workLocation: row.work_location ?? '',
    responsibilities: row.responsibilities,
    resumeFileName: row.resume_file_name,
    resumeMimeType: row.resume_mime_type,
    resumeSize: row.resume_size,
    companyName: row.company_name,
    gender: row.gender,
    idNumber: row.id_number,
    birthDate: toDate(row.birth_date),
    personalEmail: row.personal_email,
    education: row.education,
    major: row.major,
    school: row.school,
    graduationDate: toDate(row.graduation_date),
    maritalStatus: row.marital_status,
    hasChildren: row.has_children,
    hometown: row.hometown,
    emergencyContact: row.emergency_contact,
    emergencyContactPhone: row.emergency_contact_phone,
    residentialAddress: row.residential_address,
    idAddress: row.id_address,
    bankAccount: row.bank_account,
    bankName: row.bank_name,
    archiveNo: row.archive_no,
    notes: row.notes,
    departmentLevel2: row.department_level2,
    probationMonths: row.probation_months,
    expectedRegularDate: toDate(row.expected_regular_date),
    actualRegularDate: toDate(row.actual_regular_date),
    contractEndDate: toDate(row.contract_end_date),
  }
}

function employeeValues(employee: EmployeeInput): readonly unknown[] {
  return [
    employee.displayName,
    employee.workEmail,
    employee.workPhone,
    employee.departmentName,
    employee.jobTitle,
    employee.employmentType,
    employee.status,
    employee.hireDate,
    employee.workLocation,
    employee.responsibilities,
    employee.companyName,
    employee.gender,
    employee.idNumber,
    employee.birthDate,
    employee.personalEmail,
    employee.education,
    employee.major,
    employee.school,
    employee.graduationDate,
    employee.maritalStatus,
    employee.hasChildren,
    employee.hometown,
    employee.emergencyContact,
    employee.emergencyContactPhone,
    employee.residentialAddress,
    employee.idAddress,
    employee.bankAccount,
    employee.bankName,
    employee.archiveNo,
    employee.notes,
    employee.departmentLevel2,
    employee.probationMonths,
    employee.expectedRegularDate,
    employee.actualRegularDate,
    employee.contractEndDate,
  ]
}

function resumeValues(resume: ResumeUpload | null | undefined): readonly unknown[] {
  return resume
    ? [resume.fileName, resume.mimeType, resume.data]
    : [null, null, null]
}

export class PostgresEmployeeRepository {
  constructor(private readonly pool: Pool) {}

  async list(query = ''): Promise<EmployeeRecord[]> {
    const normalized = query.trim()
    const result = normalized
      ? await this.pool.query<EmployeeRow>(
          `SELECT ${columns} FROM employees
           WHERE display_name ILIKE $1 OR work_email ILIKE $1 OR personal_email ILIKE $1
             OR department_name ILIKE $1 OR department_level2 ILIKE $1
             OR job_title ILIKE $1 OR work_location ILIKE $1 OR company_name ILIKE $1
           ORDER BY hire_date, id`,
          [`%${normalized}%`],
        )
      : await this.pool.query<EmployeeRow>(`SELECT ${columns} FROM employees ORDER BY hire_date, id`)
    return result.rows.map(toEmployee)
  }

  async get(id: string): Promise<EmployeeRecord | null> {
    const result = await this.pool.query<EmployeeRow>(`SELECT ${columns} FROM employees WHERE id = $1`, [id])
    return result.rows[0] ? toEmployee(result.rows[0]) : null
  }

  async create(employee: EmployeeInput): Promise<EmployeeRecord> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const id = await this.nextId(client)
      const result = await client.query<EmployeeRow>(
        `INSERT INTO employees (
          id, display_name, work_email, work_phone,
          department_name, job_title,
          employment_type, status, hire_date, work_location, responsibilities,
          company_name, gender, id_number, birth_date,
          personal_email, education, major, school, graduation_date,
          marital_status, has_children, hometown,
          emergency_contact, emergency_contact_phone,
          residential_address, id_address, bank_account, bank_name,
          archive_no, notes, department_level2, probation_months,
          expected_regular_date, actual_regular_date, contract_end_date,
          resume_file_name, resume_mime_type, resume_data
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29,
          $30, $31, $32, $33, $34, $35, $36,
          $37, $38, $39
        )
        RETURNING ${columns}`,
        [id, ...employeeValues(employee), ...resumeValues(employee.resume)],
      )
      await client.query('COMMIT')
      const created = result.rows[0]
      if (!created) throw new Error('新增员工后未返回记录。')
      return toEmployee(created)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async update(id: string, employee: EmployeeInput): Promise<EmployeeRecord | null> {
    const resumeUpdate = employee.resume === undefined
      ? ''
      : ', resume_file_name = $37, resume_mime_type = $38, resume_data = $39'
    const result = await this.pool.query<EmployeeRow>(
      `UPDATE employees SET
        display_name = $2, work_email = $3, work_phone = $4,
        department_name = $5, job_title = $6,
        employment_type = $7, status = $8, hire_date = $9, work_location = $10,
        responsibilities = $11,
        company_name = $12, gender = $13, id_number = $14, birth_date = $15,
        personal_email = $16, education = $17, major = $18, school = $19, graduation_date = $20,
        marital_status = $21, has_children = $22, hometown = $23,
        emergency_contact = $24, emergency_contact_phone = $25,
        residential_address = $26, id_address = $27, bank_account = $28, bank_name = $29,
        archive_no = $30, notes = $31, department_level2 = $32, probation_months = $33,
        expected_regular_date = $34, actual_regular_date = $35, contract_end_date = $36,
        updated_at = now()${resumeUpdate}
      WHERE id = $1 RETURNING ${columns}`,
      employee.resume === undefined
        ? [id, ...employeeValues(employee)]
        : [id, ...employeeValues(employee), ...resumeValues(employee.resume)],
    )
    return result.rows[0] ? toEmployee(result.rows[0]) : null
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM employees WHERE id = $1', [id])
    return (result.rowCount ?? 0) > 0
  }

  async getResume(id: string): Promise<EmployeeResume | null> {
    const result = await this.pool.query<{
      resume_file_name: string | null
      resume_mime_type: string | null
      resume_data: Buffer | null
    }>('SELECT resume_file_name, resume_mime_type, resume_data FROM employees WHERE id = $1', [id])
    const row = result.rows[0]
    if (!row?.resume_file_name || !row.resume_mime_type || !row.resume_data) return null
    return { fileName: row.resume_file_name, mimeType: row.resume_mime_type, data: row.resume_data }
  }

  private async nextId(client: PoolClient): Promise<string> {
    const result = await client.query<{ value: string }>("SELECT nextval('employee_id_seq')::text AS value")
    const value = result.rows[0]?.value
    if (!value) throw new Error('无法生成员工 ID。')
    return `EMP-${value.padStart(4, '0')}`
  }
}
