import type { EmployeeRecord } from '@hegongzuo/employee-domain'
import type { Pool } from 'pg'

import {
  EmployeeRepository,
  type EmployeeAnalysisCriteria,
  type EmployeeAnalysisView,
  type ContractAlertCriteria,
  type ContractAlertsView,
  type DepartmentMembersResult,
  type EmployeeDataSource,
  type EmployeeSearchCriteria,
  type EmployeeSearchResult,
  type EmployeeStatsView,
  type EmployeeView,
} from './repository.js'

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
  readonly birth_date: string | Date | null
  readonly education: string | null
  readonly major: string | null
  readonly school: string | null
  readonly graduation_date: string | Date | null
  readonly marital_status: string | null
  readonly has_children: string | null
  readonly hometown: string | null
  readonly department_level2: string | null
  readonly probation_months: number | null
  readonly expected_regular_date: string | Date | null
  readonly actual_regular_date: string | Date | null
  readonly contract_end_date: string | Date | null
  readonly departure_date: string | Date | null
  readonly departure_reason: string | null
  readonly archive_no: string | null
  readonly notes: string | null
}

// pg 的 date 列返回本地午夜构造的 Date；用本地 getter 格式化，避免 toISOString 在东八区偏移一天。
function formatDate(value: string | Date): string {
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return value.slice(0, 10)
}

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
    hireDate: formatDate(row.hire_date),
    workLocation: row.work_location ?? '',
    responsibilities: row.responsibilities,
    resumeFileName: row.resume_file_name,
    resumeMimeType: row.resume_mime_type,
    resumeSize: row.resume_size,
    companyName: row.company_name,
    gender: row.gender,
    birthDate: row.birth_date ? formatDate(row.birth_date) : null,
    education: row.education,
    major: row.major,
    school: row.school,
    graduationDate: row.graduation_date ? formatDate(row.graduation_date) : null,
    maritalStatus: row.marital_status,
    hasChildren: row.has_children,
    hometown: row.hometown,
    departmentLevel2: row.department_level2,
    probationMonths: row.probation_months,
    expectedRegularDate: row.expected_regular_date ? formatDate(row.expected_regular_date) : null,
    actualRegularDate: row.actual_regular_date ? formatDate(row.actual_regular_date) : null,
    contractEndDate: row.contract_end_date ? formatDate(row.contract_end_date) : null,
    departureDate: row.departure_date ? formatDate(row.departure_date) : null,
    departureReason: row.departure_reason,
    archiveNo: row.archive_no,
    notes: row.notes,
  }
}

export class PostgresEmployeeRepository implements EmployeeDataSource {
  constructor(private readonly database: Pool) {}

  async verifyConnection(): Promise<void> {
    await this.database.query('SELECT 1 FROM employees LIMIT 1')
  }

  async search(criteria: EmployeeSearchCriteria = {}): Promise<EmployeeSearchResult> {
    return (await this.snapshot()).search(criteria)
  }

  async getById(identifier: string): Promise<EmployeeView | null> {
    return (await this.snapshot()).getById(identifier)
  }

  async listDepartmentMembers(department: string): Promise<DepartmentMembersResult> {
    return (await this.snapshot()).listDepartmentMembers(department)
  }

  async stats(): Promise<EmployeeStatsView> {
    return (await this.snapshot()).stats()
  }

  async analyze(criteria: EmployeeAnalysisCriteria = {}): Promise<EmployeeAnalysisView> {
    return (await this.snapshot()).analyze(criteria)
  }

  async contractAlerts(criteria: ContractAlertCriteria = {}): Promise<ContractAlertsView> {
    return (await this.snapshot()).contractAlerts(criteria)
  }

  private async snapshot(): Promise<EmployeeRepository> {
    const result = await this.database.query<EmployeeRow>(`
      SELECT
        id, display_name, work_email, work_phone, department_name, job_title,
        employment_type, status, hire_date, work_location,
        responsibilities, resume_file_name, resume_mime_type,
        octet_length(resume_data)::integer AS resume_size,
        company_name, gender, birth_date,
        education, major, school, graduation_date,
        marital_status, has_children, hometown,
        department_level2, probation_months,
        expected_regular_date, actual_regular_date, contract_end_date,
        departure_date, departure_reason,
        archive_no, notes
      FROM employees
      ORDER BY display_name, id
    `)
    return new EmployeeRepository(result.rows.map(toEmployee))
  }
}
