import type {
  EmployeeRecord,
  EmployeeStatus,
} from '@hegongzuo/employee-domain'

export interface EmployeeSearchCriteria {
  readonly query?: string
  readonly department?: string
  readonly jobTitle?: string
  readonly status?: EmployeeStatus
  readonly workLocation?: string
  readonly offset?: number
  readonly limit?: number
}

export interface EmployeeView extends EmployeeRecord {}

export interface EmployeeSearchResult {
  readonly total: number
  readonly offset: number
  readonly limit: number
  readonly employees: readonly EmployeeView[]
}

export interface DepartmentMembersResult {
  readonly found: boolean
  readonly department: {
    readonly name: string
  } | null
  readonly memberCount: number
  readonly members: readonly EmployeeView[]
}

export interface EmployeeDataSource {
  search(criteria?: EmployeeSearchCriteria): EmployeeSearchResult | Promise<EmployeeSearchResult>
  getById(identifier: string): EmployeeView | null | Promise<EmployeeView | null>
  listDepartmentMembers(department: string): DepartmentMembersResult | Promise<DepartmentMembersResult>
  stats(): EmployeeStatsView | Promise<EmployeeStatsView>
  analyze(criteria?: EmployeeAnalysisCriteria): EmployeeAnalysisView | Promise<EmployeeAnalysisView>
  contractAlerts(criteria?: ContractAlertCriteria): ContractAlertsView | Promise<ContractAlertsView>
}

export interface EmployeeAnalysisCriteria {
  readonly status?: EmployeeStatus
  readonly gender?: string
  readonly department?: string
  readonly jobTitle?: string
}

export interface EmployeeAnalysisView {
  readonly total: number
  readonly withBirthDate: number
  readonly withDepartureDate: number
  readonly averageCurrentAge: number | null
  readonly averageAgeAtDeparture: number | null
  readonly averageTenureYears: number | null
}

export interface StatBucket {
  key: string
  count: number
}

export interface EmployeeStatsView {
  total: number
  byCompany: StatBucket[]
  byDepartment: StatBucket[]
  byEducation: StatBucket[]
  byGender: StatBucket[]
  byEmploymentType: StatBucket[]
  byStatus: StatBucket[]
  byAgeBand: StatBucket[]
  byTenureBand: StatBucket[]
}

export interface ContractAlertCriteria {
  readonly days?: number
  readonly regularizationDays?: number
}

export interface ContractAlert {
  id: string
  displayName: string
  departmentName: string
  contractEndDate: string
  daysLeft: number
}

export interface RegularizationAlert {
  id: string
  displayName: string
  departmentName: string
  probationMonths: number | null
  expectedRegularDate: string
}

export interface ContractAlertsView {
  total: number
  expiringContracts: ContractAlert[]
  expiredContracts: ContractAlert[]
  pendingRegularization: RegularizationAlert[]
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN')
}

function includes(value: string, expected: string): boolean {
  return normalize(value).includes(normalize(expected))
}

function normalizedPageValue(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isSafeInteger(value)) return fallback
  return Math.min(Math.max(value, 0), maximum)
}

export class EmployeeRepository implements EmployeeDataSource {
  readonly #employees: readonly EmployeeRecord[]
  readonly #employeesById: ReadonlyMap<string, EmployeeRecord>

  constructor(employees: readonly EmployeeRecord[]) {
    this.#employees = [...employees]
    this.#employeesById = new Map(
      this.#employees.map((employee) => [employee.id, employee]),
    )
  }

  search(criteria: EmployeeSearchCriteria = {}): EmployeeSearchResult {
    const query = criteria.query?.trim()
    const department = criteria.department?.trim()
    const jobTitle = criteria.jobTitle?.trim()
    const workLocation = criteria.workLocation?.trim()

    const matched = this.#employees.filter((employee) => {
      if (
        query &&
        ![
          employee.displayName,
          employee.workEmail ?? '',
          employee.companyName ?? '',
          employee.departmentName,
          employee.departmentLevel2 ?? '',
          employee.jobTitle,
          employee.education ?? '',
          employee.school ?? '',
          employee.workLocation,
        ].some((value) => includes(value, query))
      ) {
        return false
      }
      if (
        department &&
        !includes(employee.departmentName, department)
      ) {
        return false
      }
      if (jobTitle && !includes(employee.jobTitle, jobTitle)) return false
      if (criteria.status && employee.status !== criteria.status) return false
      if (workLocation && !includes(employee.workLocation, workLocation)) {
        return false
      }
      return true
    })

    const offset = normalizedPageValue(criteria.offset, 0, matched.length)
    const limit = Math.max(normalizedPageValue(criteria.limit, 20, 50), 1)

    return {
      total: matched.length,
      offset,
      limit,
      employees: matched
        .slice(offset, offset + limit)
        .map((employee) => this.toView(employee)),
    }
  }

  getById(identifier: string): EmployeeView | null {
    const expected = normalize(identifier)
    const employee = this.#employees.find(
      (candidate) => normalize(candidate.id) === expected,
    )
    return employee ? this.toView(employee) : null
  }

  listDepartmentMembers(department: string): DepartmentMembersResult {
    const expected = normalize(department)
    const members = this.#employees.filter(
      (employee) => normalize(employee.departmentName) === expected,
    )
    const first = members[0]

    return {
      found: first !== undefined,
      department: first
        ? { name: first.departmentName }
        : null,
      memberCount: members.length,
      members: members.map((employee) => this.toView(employee)),
    }
  }

  private toView(employee: EmployeeRecord): EmployeeView {
    return { ...employee }
  }

  stats(): EmployeeStatsView {
    const buckets = (values: readonly string[]): StatBucket[] => {
      const counts = new Map<string, number>()
      for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
      return [...counts.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'zh-CN'))
    }

    const today = new Date()
    const currentYear = today.getFullYear()

    const ageBand = (birthDate: string | null | undefined): string => {
      if (!birthDate) return '未填写'
      const year = Number(birthDate.slice(0, 4))
      if (!Number.isFinite(year)) return '未填写'
      const age = currentYear - year
      if (age < 25) return '25 岁以下'
      if (age < 30) return '25–29 岁'
      if (age < 35) return '30–34 岁'
      if (age < 40) return '35–39 岁'
      if (age < 50) return '40–49 岁'
      return '50 岁及以上'
    }

    const tenureBand = (hireDate: string | null | undefined): string => {
      if (!hireDate) return '未填写'
      const year = Number(hireDate.slice(0, 4))
      if (!Number.isFinite(year)) return '未填写'
      const years = currentYear - year
      if (years < 1) return '不满 1 年'
      if (years < 3) return '1–2 年'
      if (years < 5) return '3–4 年'
      if (years < 10) return '5–9 年'
      return '10 年及以上'
    }

    return {
      total: this.#employees.length,
      byCompany: buckets(this.#employees.map((employee) => employee.companyName ?? '未填写')),
      byDepartment: buckets(this.#employees.map((employee) => employee.departmentName)),
      byEducation: buckets(this.#employees.map((employee) => employee.education ?? '未填写')),
      byGender: buckets(this.#employees.map((employee) => employee.gender ?? '未填写')),
      byEmploymentType: buckets(this.#employees.map((employee) => employee.employmentType)),
      byStatus: buckets(this.#employees.map((employee) => employee.status)),
      byAgeBand: buckets(this.#employees.map((employee) => ageBand(employee.birthDate))),
      byTenureBand: buckets(this.#employees.map((employee) => tenureBand(employee.hireDate))),
    }
  }

  analyze(criteria: EmployeeAnalysisCriteria = {}): EmployeeAnalysisView {
    const gender = criteria.gender?.trim()
    const department = criteria.department?.trim()
    const jobTitle = criteria.jobTitle?.trim()
    const matched = this.#employees.filter((employee) => (
      (!criteria.status || employee.status === criteria.status)
      && (!gender || normalize(employee.gender ?? '') === normalize(gender))
      && (!department || includes(employee.departmentName, department))
      && (!jobTitle || includes(employee.jobTitle, jobTitle))
    ))
    const today = localDateText(new Date())
    const currentAges = matched.flatMap((employee) => employee.birthDate
      ? [yearsBetween(employee.birthDate, today)] : [])
    const departureAges = matched.flatMap((employee) => employee.birthDate && employee.departureDate
      ? [yearsBetween(employee.birthDate, employee.departureDate)] : [])
    const tenures = matched.flatMap((employee) => employee.hireDate
      ? [yearsBetween(employee.hireDate, employee.departureDate ?? today)] : [])

    return {
      total: matched.length,
      withBirthDate: currentAges.length,
      withDepartureDate: matched.filter((employee) => employee.departureDate).length,
      averageCurrentAge: average(currentAges),
      averageAgeAtDeparture: average(departureAges),
      averageTenureYears: average(tenures),
    }
  }

  contractAlerts(criteria: ContractAlertCriteria = {}): ContractAlertsView {
    const days = normalizedPageValue(criteria.days, 60, 365)
    const regularizationDays = normalizedPageValue(criteria.regularizationDays, 30, 365)

    const expiring: ContractAlert[] = []
    const expired: ContractAlert[] = []
    const pending: RegularizationAlert[] = []

    for (const employee of this.#employees) {
      if (employee.contractEndDate) {
        const daysLeft = daysBetween(employee.contractEndDate)
        if (daysLeft >= 0 && daysLeft <= days) {
          expiring.push({
            id: employee.id,
            displayName: employee.displayName,
            departmentName: employee.departmentName,
            contractEndDate: employee.contractEndDate,
            daysLeft,
          })
        } else if (daysLeft < 0) {
          expired.push({
            id: employee.id,
            displayName: employee.displayName,
            departmentName: employee.departmentName,
            contractEndDate: employee.contractEndDate,
            daysLeft,
          })
        }
      }
      if (
        employee.expectedRegularDate &&
        !employee.actualRegularDate &&
        daysBetween(employee.expectedRegularDate) <= regularizationDays
      ) {
        pending.push({
          id: employee.id,
          displayName: employee.displayName,
          departmentName: employee.departmentName,
          probationMonths: employee.probationMonths ?? null,
          expectedRegularDate: employee.expectedRegularDate,
        })
      }
    }

    const byDaysLeft = (a: { readonly daysLeft: number }, b: { readonly daysLeft: number }) => a.daysLeft - b.daysLeft
    expiring.sort(byDaysLeft)
    expired.sort(byDaysLeft)
    pending.sort((a, b) => a.expectedRegularDate.localeCompare(b.expectedRegularDate))

    return {
      total: this.#employees.length,
      expiringContracts: expiring,
      expiredContracts: expired,
      pendingRegularization: pending,
    }
  }
}

function daysBetween(dateText: string): number {
  const parts = dateText.slice(0, 10).split('-').map(Number)
  const year = parts[0] ?? 0
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  const target = new Date(year, month - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function localDateText(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function yearsBetween(startText: string, endText: string): number {
  const timestamp = (text: string) => {
    const [year = 0, month = 1, day = 1] = text.slice(0, 10).split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.max(0, (timestamp(endText) - timestamp(startText)) / 86_400_000 / 365.2425)
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10
}
