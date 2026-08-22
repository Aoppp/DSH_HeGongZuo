import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'

import type { EmployeeStatus } from '@hegongzuo/employee-domain'

import type { EmployeeDataSource, EmployeeView } from './repository.js'

const employeeStatuses = [
  'probation',
  'active',
  'on_leave',
  'inactive',
] as const satisfies readonly EmployeeStatus[]

const maximumToolResultItems = 10

const employeeViewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    displayName: { type: 'string', required: true },
    departmentName: { type: 'string', required: true },
    jobTitle: { type: 'string', required: true },
    employmentType: { type: 'string', required: true },
    status: { type: 'string', enum: employeeStatuses, required: true },
    hireDate: { type: 'string', required: true },
    workLocation: { type: 'string', required: true },
    companyName: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      required: true,
    },
    departmentLevel2: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      required: true,
    },
    contractEndDate: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      required: true,
    },
    departureDate: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      required: true,
    },
    departureReason: {
      oneOf: [{ type: 'string' }, { type: 'null' }],
      required: true,
    },
  },
} as const

// 输出投影白名单：敏感字段（身份证、银行卡、住址）与第三方隐私
// （紧急联系人、个人邮箱）刻意不包含，模型无法获得这些信息。
function employeeValue(employee: EmployeeView) {
  return {
    id: employee.id,
    displayName: employee.displayName,
    departmentName: employee.departmentName,
    jobTitle: employee.jobTitle,
    employmentType: employee.employmentType,
    status: employee.status,
    hireDate: employee.hireDate,
    workLocation: employee.workLocation,
    companyName: employee.companyName ?? null,
    departmentLevel2: employee.departmentLevel2 ?? null,
    contractEndDate: employee.contractEndDate ?? null,
    departureDate: employee.departureDate ?? null,
    departureReason: employee.departureReason ?? null,
  }
}

const statBucketSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    key: { type: 'string', required: true },
    count: { type: 'integer', required: true },
  },
} as const

const contractAlertSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    displayName: { type: 'string', required: true },
    departmentName: { type: 'string', required: true },
    contractEndDate: { type: 'string', required: true },
    daysLeft: { type: 'integer', required: true },
  },
} as const

const regularizationAlertSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    displayName: { type: 'string', required: true },
    departmentName: { type: 'string', required: true },
    probationMonths: {
      oneOf: [{ type: 'integer' }, { type: 'null' }],
      required: true,
    },
    expectedRegularDate: { type: 'string', required: true },
  },
} as const

const renderJson = (_args: unknown, value: unknown) => [
  { type: 'text' as const, text: JSON.stringify(value) },
]

export function createEmployeeTools(
  repository: EmployeeDataSource,
): readonly ToolDefinition[] {
  const stats = defineTool({
    name: 'employee_stats',
    description:
      '统计当前员工总体分布：总人数，以及按所属公司、部门、学历、性别、用工类型、状态、年龄段和司龄段的分组人数。回答“各部门有多少人”“本科以上占比”等统计问题前必须调用本工具。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total: { type: 'integer', required: true },
          byCompany: { type: 'array', items: statBucketSchema, required: true },
          byDepartment: { type: 'array', items: statBucketSchema, required: true },
          byEducation: { type: 'array', items: statBucketSchema, required: true },
          byGender: { type: 'array', items: statBucketSchema, required: true },
          byEmploymentType: { type: 'array', items: statBucketSchema, required: true },
          byStatus: { type: 'array', items: statBucketSchema, required: true },
          byAgeBand: { type: 'array', items: statBucketSchema, required: true },
          byTenureBand: { type: 'array', items: statBucketSchema, required: true },
        },
      },
      render: renderJson,
    },
    isConcurrencySafe: () => true,
    async execute(_args: Record<string, unknown>) {
      return repository.stats()
    },
  })

  const analysis = defineTool({
    name: 'employee_analysis',
    description:
      '对员工群体直接执行聚合分析，可筛选在职状态、性别、部门和岗位，并返回人数、平均当前年龄、平均离职年龄及平均工龄。回答平均年龄、平均离职年龄、平均工龄等问题时必须调用本工具，不得分页拉取员工明细后自行计算。',
    parameters: {
      status: {
        type: 'string',
        enum: employeeStatuses,
        description: '员工状态：probation、active、on_leave 或 inactive。',
      },
      gender: { type: 'string', description: '性别，例如男或女。' },
      department: { type: 'string', description: '部门名称关键词。' },
      job_title: { type: 'string', description: '岗位名称关键词。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total: { type: 'integer', required: true },
          withBirthDate: { type: 'integer', required: true },
          withDepartureDate: { type: 'integer', required: true },
          averageCurrentAge: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
          averageAgeAtDeparture: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
          averageTenureYears: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
        },
      },
      render: renderJson,
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      return repository.analyze({
        ...(args.status === undefined ? {} : { status: args.status }),
        ...(args.gender === undefined ? {} : { gender: args.gender }),
        ...(args.department === undefined ? {} : { department: args.department }),
        ...(args.job_title === undefined ? {} : { jobTitle: args.job_title }),
      })
    },
  })

  const contractAlerts = defineTool({
    name: 'contract_alerts',
    description:
      '查询合同与转正预警：合同在未来 N 天内到期的员工、合同已过期未续签的员工，以及预计转正日期临近但尚未实际转正的员工。回答“下个月哪些人合同到期”“谁快转正了”等问题前必须调用本工具。',
    parameters: {
      days: {
        type: 'integer',
        description: '合同到期预警窗口（天），默认 60，最大 365。',
      },
      regularization_days: {
        type: 'integer',
        description: '转正提醒窗口（天），默认 30，最大 365。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total: { type: 'integer', required: true },
          expiringContractCount: { type: 'integer', required: true },
          expiredContractCount: { type: 'integer', required: true },
          pendingRegularizationCount: { type: 'integer', required: true },
          expiringContracts: {
            type: 'array',
            items: contractAlertSchema,
            required: true,
          },
          expiredContracts: {
            type: 'array',
            items: contractAlertSchema,
            required: true,
          },
          pendingRegularization: {
            type: 'array',
            items: regularizationAlertSchema,
            required: true,
          },
        },
      },
      render: renderJson,
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const result = await repository.contractAlerts({
        ...(args.days === undefined ? {} : { days: args.days }),
        ...(args.regularization_days === undefined
          ? {}
          : { regularizationDays: args.regularization_days }),
      })
      return {
        total: result.total,
        expiringContractCount: result.expiringContracts.length,
        expiredContractCount: result.expiredContracts.length,
        pendingRegularizationCount: result.pendingRegularization.length,
        expiringContracts: result.expiringContracts.slice(0, maximumToolResultItems),
        expiredContracts: result.expiredContracts.slice(0, maximumToolResultItems),
        pendingRegularization: result.pendingRegularization.slice(0, maximumToolResultItems),
      }
    },
  })

  const search = defineTool({
    name: 'employee_search',
    description:
      '查询和工作 PostgreSQL 数据库中的员工数据。可按关键词、部门、岗位、状态或工作地点筛选。',
    parameters: {
      query: {
        type: 'string',
        description: '匹配姓名、邮箱、所属公司、部门、岗位、学历、毕业学校或工作地点的关键词。',
      },
      department: {
        type: 'string',
        description: '部门名称，例如技术部。',
      },
      job_title: { type: 'string', description: '岗位名称关键词。' },
      status: {
        type: 'string',
        enum: employeeStatuses,
        description: '员工状态：probation、active、on_leave 或 inactive。',
      },
      work_location: { type: 'string', description: '工作地点关键词。' },
      offset: { type: 'integer', description: '从第几条结果开始，默认 0。' },
      limit: { type: 'integer', description: '最多返回多少条，默认 20，最大 50。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total: { type: 'integer', required: true },
          offset: { type: 'integer', required: true },
          limit: { type: 'integer', required: true },
          employees: {
            type: 'array',
            items: employeeViewSchema,
            required: true,
          },
        },
      },
      render: renderJson,
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const result = await repository.search({
        ...(args.query === undefined ? {} : { query: args.query }),
        ...(args.department === undefined
          ? {}
          : { department: args.department }),
        ...(args.job_title === undefined
          ? {}
          : { jobTitle: args.job_title }),
        ...(args.status === undefined ? {} : { status: args.status }),
        ...(args.work_location === undefined
          ? {}
          : { workLocation: args.work_location }),
        ...(args.offset === undefined ? {} : { offset: args.offset }),
        ...(args.limit === undefined ? {} : { limit: args.limit }),
      })
      return {
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        employees: result.employees.map(employeeValue),
      }
    },
  })

  const get = defineTool({
    name: 'employee_get',
    description:
      '使用员工 ID 查询一名员工的档案信息。找不到时返回 found=false。',
    parameters: {
      identifier: {
        type: 'string',
        required: true,
        description: '员工 ID，例如 EMP-0007。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          found: { type: 'boolean', required: true },
          employee: {
            oneOf: [employeeViewSchema, { type: 'null' }],
            required: true,
          },
        },
      },
      render: renderJson,
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const employee = await repository.getById(args.identifier)
      return {
        found: employee !== null,
        employee: employee ? employeeValue(employee) : null,
      }
    },
  })

  const departureSearch = defineTool({
    name: 'departure_search',
    description:
      '查询离职员工档案。可按姓名、部门或岗位检索，返回离职日期、离职原因及原任职信息；仅查询状态为 inactive 的员工。',
    parameters: {
      query: {
        type: 'string',
        description: '匹配离职员工姓名、部门、岗位、所属公司或学历的关键词。',
      },
      department: {
        type: 'string',
        description: '部门名称关键词。',
      },
      job_title: { type: 'string', description: '岗位名称关键词。' },
      offset: { type: 'integer', description: '从第几条结果开始，默认 0。' },
      limit: { type: 'integer', description: '最多返回多少条，默认 20，最大 50。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          total: { type: 'integer', required: true },
          offset: { type: 'integer', required: true },
          limit: { type: 'integer', required: true },
          employees: { type: 'array', items: employeeViewSchema, required: true },
        },
      },
      render: renderJson,
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const result = await repository.search({
        status: 'inactive',
        ...(args.query === undefined ? {} : { query: args.query }),
        ...(args.department === undefined ? {} : { department: args.department }),
        ...(args.job_title === undefined ? {} : { jobTitle: args.job_title }),
        ...(args.offset === undefined ? {} : { offset: args.offset }),
        ...(args.limit === undefined ? {} : { limit: args.limit }),
      })
      return {
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        employees: result.employees.map(employeeValue),
      }
    },
  })

  const listDepartmentMembers = defineTool({
    name: 'organization_list_members',
    description:
      '按精确部门名称列出该部门的员工名单。',
    parameters: {
      department: {
        type: 'string',
        required: true,
        description: '精确部门名称，例如技术部。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          found: { type: 'boolean', required: true },
          department: {
            oneOf: [
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string', required: true },
                },
              },
              { type: 'null' },
            ],
            required: true,
          },
          memberCount: { type: 'integer', required: true },
          returnedMemberCount: { type: 'integer', required: true },
          hasMore: { type: 'boolean', required: true },
          members: {
            type: 'array',
            items: employeeViewSchema,
            required: true,
          },
        },
      },
      render: renderJson,
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const result = await repository.listDepartmentMembers(args.department)
      return {
        found: result.found,
        department: result.department,
        memberCount: result.memberCount,
        returnedMemberCount: Math.min(result.members.length, maximumToolResultItems),
        hasMore: result.members.length > maximumToolResultItems,
        members: result.members.slice(0, maximumToolResultItems).map(employeeValue),
      }
    },
  })

  return [stats, contractAlerts, search, get, departureSearch, listDepartmentMembers, analysis]
}
