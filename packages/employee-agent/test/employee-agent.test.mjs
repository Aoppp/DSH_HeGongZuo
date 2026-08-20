import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createEmployeeTools,
  EmployeeRepository,
  loadEmployeeDataset,
  registerEmployeeAgent,
} from '../dist/index.js'

const dataset = loadEmployeeDataset()
const repository = new EmployeeRepository(dataset.employees)

test('加载 10 名虚构员工', () => {
  assert.equal(dataset.metadata.source, 'synthetic')
  assert.equal(dataset.employees.length, 10)
})

test('按部门查询技术部员工', () => {
  const result = repository.search({ department: '技术部' })
  assert.equal(result.total, 3)
  assert.deepEqual(
    result.employees.map((employee) => employee.id),
    ['EMP-0004', 'EMP-0007', 'EMP-0008'],
  )
})

test('按员工 ID 查询员工', () => {
  const employee = repository.getById('EMP-0007')
  assert.equal(employee?.displayName, '江云舟')
})

test('不存在的部门返回空结果', () => {
  const result = repository.listDepartmentMembers('不存在的部门')
  assert.equal(result.found, false)
  assert.equal(result.memberCount, 0)
  assert.deepEqual(result.members, [])
})

test('注册七个模型兼容的只读工具', async () => {
  const tools = createEmployeeTools(repository)
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ['employee_stats', 'contract_alerts', 'employee_search', 'employee_get', 'departure_search', 'organization_list_members', 'employee_analysis'],
  )

  const search = tools[2]
  assert.ok(search)
  const result = await search.execute(
    { department: '人力资源部' },
    /** @type {any} */ ({}),
  )
  assert.equal(result.total, 2)
})

test('聚合分析直接计算筛选群体的平均离职年龄', async () => {
  const base = {
    displayName: '测试员工',
    workEmail: null,
    workPhone: '',
    departmentName: '技术部',
    jobTitle: '工程师',
    employmentType: 'full_time',
    status: 'inactive',
    hireDate: '2020-01-01',
    workLocation: '',
    responsibilities: '',
    resumeFileName: null,
    resumeMimeType: null,
    resumeSize: null,
    departureDate: '2025-01-01',
  }
  const analysisRepository = new EmployeeRepository([
    { ...base, id: 'EMP-9101', gender: '男', birthDate: '1990-01-01' },
    { ...base, id: 'EMP-9102', gender: '男', birthDate: '2000-01-01' },
    { ...base, id: 'EMP-9103', gender: '女', birthDate: '1995-01-01' },
  ])

  const result = analysisRepository.analyze({ status: 'inactive', gender: '男' })
  assert.equal(result.total, 2)
  assert.equal(result.withBirthDate, 2)
  assert.equal(result.withDepartureDate, 2)
  assert.equal(result.averageAgeAtDeparture, 30)
  assert.equal(result.averageTenureYears, 5)
})

test('人事统计返回总人数与部门分布', async () => {
  const stats = repository.stats()
  assert.equal(stats.total, 10)
  assert.deepEqual(stats.byDepartment, [
    { key: '技术部', count: 3 },
    { key: '产品部', count: 2 },
    { key: '人力资源部', count: 2 },
    { key: '财务部', count: 1 },
    { key: '管理层', count: 1 },
    { key: '销售部', count: 1 },
  ])
  assert.ok(stats.byCompany.length > 0)
  assert.ok(stats.byTenureBand.length > 0)
})

test('合同与转正预警：到期窗口、过期与临近转正', async () => {
  const today = new Date()
  const date = (offsetDays) => {
    const target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays)
    const month = String(target.getMonth() + 1).padStart(2, '0')
    const day = String(target.getDate()).padStart(2, '0')
    return `${target.getFullYear()}-${month}-${day}`
  }
  const base = {
    id: 'EMP-9001',
    displayName: '预警甲',
    workEmail: null,
    workPhone: '13800000000',
    departmentName: '技术部',
    jobTitle: '工程师',
    employmentType: 'full_time',
    status: 'active',
    hireDate: '2024-01-01',
    workLocation: '',
    responsibilities: '',
    resumeFileName: null,
    resumeMimeType: null,
    resumeSize: null,
  }
  const alertRepository = new EmployeeRepository([
    { ...base, id: 'EMP-9001', displayName: '即将到期', contractEndDate: date(30) },
    { ...base, id: 'EMP-9002', displayName: '已经过期', contractEndDate: date(-5) },
    { ...base, id: 'EMP-9003', displayName: '临近转正', probationMonths: 3, expectedRegularDate: date(10) },
    { ...base, id: 'EMP-9004', displayName: '已转正', probationMonths: 3, expectedRegularDate: date(10), actualRegularDate: date(5) },
    { ...base, id: 'EMP-9005', displayName: '合同还早', contractEndDate: date(400) },
  ])
  const alerts = alertRepository.contractAlerts()
  assert.equal(alerts.total, 5)
  assert.deepEqual(alerts.expiringContracts.map((item) => item.displayName), ['即将到期'])
  assert.equal(alerts.expiringContracts[0].daysLeft, 30)
  assert.deepEqual(alerts.expiredContracts.map((item) => item.displayName), ['已经过期'])
  assert.deepEqual(alerts.pendingRegularization.map((item) => item.displayName), ['临近转正'])
})

test('DSH 插件入口注册工具、系统提示和账号工作区', async () => {
  const registeredTools = []
  const promptSections = []
  const registeredWorkspaces = []
  const previousWorkspace = process.env.HEGONGZUO_AGENT_WORKSPACE
  process.env.HEGONGZUO_AGENT_WORKSPACE = '/tmp/hegongzuo-employee-agent-test'
  const context = {
    tools: {
      register(tool) {
        registeredTools.push(tool)
        return () => undefined
      },
    },
    systemPrompt: {
      section(section) {
        promptSections.push(section)
        return () => undefined
      },
    },
    workspaceRegistry: {
      async create(workspacePath, title) {
        registeredWorkspaces.push({ workspacePath, title })
        return {}
      },
    },
  }

  try {
    await registerEmployeeAgent(/** @type {any} */ (context), repository)
  } finally {
    if (previousWorkspace === undefined) delete process.env.HEGONGZUO_AGENT_WORKSPACE
    else process.env.HEGONGZUO_AGENT_WORKSPACE = previousWorkspace
  }

  assert.equal(registeredTools.length, 7)
  assert.equal(promptSections.length, 1)
  assert.equal(promptSections[0].name, 'hegongzuo:employee-management')
  assert.deepEqual(registeredWorkspaces, [{
    workspacePath: '/tmp/hegongzuo-employee-agent-test',
    title: '员工管理 Agent',
  }])
})
