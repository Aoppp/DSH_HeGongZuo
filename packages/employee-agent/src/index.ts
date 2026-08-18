import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-system-prompt'
import '@deepseek-ai/dsh-tools'
import '@deepseek-ai/dsh-workspace'
import pg, { type PoolConfig } from 'pg'

import { PostgresEmployeeRepository } from './postgres-repository.js'
import type { EmployeeDataSource } from './repository.js'
import { registerSessionDeletionRoute } from './session-deletion.js'
import { createEmployeeTools } from './tools.js'

export const name = 'hegongzuo-employee-agent'
export const inject = [
  'tools',
  'systemPrompt',
  'workspaceRegistry',
  'webServer',
  'agents',
  'sessions',
  'sessionPersistence',
  'storageDomain',
]

export async function registerEmployeeAgent(ctx: Context, repository: EmployeeDataSource): Promise<void> {
  const workspacePath = process.env.HEGONGZUO_AGENT_WORKSPACE?.trim()
  if (workspacePath) {
    await ctx.workspaceRegistry.create(workspacePath, '员工管理 Agent')
  }

  ctx.systemPrompt.section({
    name: 'hegongzuo:employee-management',
    order: 120,
    text: [
      '你是“员工管理 Agent”。',
      '',
      '你的唯一职责是处理员工管理相关的数据查询、统计、组织结构查询、合同预警和转正预警。',
      '',
      '你可以使用以下员工管理工具：',
      '- employee_search',
      '- employee_get',
      '- organization_list_members',
      '- employee_stats',
      '- contract_alerts',
      '',
      '不得处理与员工管理无关的请求。',
      '如果用户提出编程、文件操作、Shell、联网搜索、写作、翻译、通用知识问答、任务管理或其他非员工管理请求，直接回答：“当前 Agent 仅支持员工管理相关查询。”',
      '',
      '回答员工数量、分布、名单、档案、合同或转正情况前，必须调用员工管理工具获取最新数据，不得依赖历史对话猜测。',
      '',
      '员工管理工具只允许查询，不允许写入、修改或删除员工数据。',
      '不得声称已经执行入职、调岗、离职或任何员工信息修改。',
      '',
      '身份证、银行卡、居住住址、身份证地址、紧急联系人及电话、个人邮箱属于受限信息，不得查询、推测或声称能够获取。',
      '',
      '需要员工详情时优先调用工具，不要根据姓名猜测员工 ID。',
    ].join('\n'),
  })

  for (const tool of createEmployeeTools(repository)) {
    ctx.tools.register(tool)
  }
}

export async function apply(ctx: Context): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('员工管理 Agent 缺少 DATABASE_URL，无法读取 PostgreSQL 员工数据。')
  const databaseConfig: PoolConfig = { connectionString: databaseUrl, max: 4 }
  if (process.env.DATABASE_SSL === 'require') databaseConfig.ssl = { rejectUnauthorized: false }
  const database = new pg.Pool(databaseConfig)
  const repository = new PostgresEmployeeRepository(database)
  await repository.verifyConnection()
  ctx.effect(() => async () => { await database.end() }, 'hegongzuo.employee-agent.postgresql')
  await registerEmployeeAgent(ctx, repository)
  registerSessionDeletionRoute(ctx)
}

export { loadEmployeeDataset } from './data.js'
export { EmployeeRepository } from './repository.js'
export { PostgresEmployeeRepository } from './postgres-repository.js'
export { permanentlyDeleteSession, registerSessionDeletionRoute } from './session-deletion.js'
export { createEmployeeTools } from './tools.js'
