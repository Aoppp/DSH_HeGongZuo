import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import type { Socket } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { AccountValidationError, AccountsService } from './accounts.js'
import { AgentRuntimeProxyError, agentRuntimeRequest, authorizationForAgentRuntime, checkConfiguredAgentRuntimeHealth, isAgentRuntimeRequest, proxyAgentRequest, proxyAgentUpgrade } from './agent-runtime-proxy.js'
import { AuthError, AuthService, LoginRateLimitError } from './auth.js'
import { database } from './database.js'
import { EmployeeValidationError, parseEmployeeInput } from './modules/employee/employee-input.js'
import { PostgresEmployeeRepository } from './modules/employee/employee-repository.js'
import { employeeAuditDetail } from './modules/employee/employee-audit.js'
import { callbackPath, handleWeComCallback, WeComCallbackError } from './modules/employee/wecom/callback.js'
import { WorkAssistantWorkspaceFiles } from './modules/work-assistant/workspace-files.js'
import { AccountRuntimeTasks } from './modules/accounts/account-runtime-tasks.js'
import { runtimeChangeForAccountUpdate } from './modules/accounts/account-runtime-change.js'
import { registeredAgentPermissionIds, registeredAgentPermissions } from './modules/accounts/agent-runtime-permissions.js'
import { PlatformManagementError, PlatformManagementService } from './modules/platform/platform-management.js'
import { HttpError, readJson, sendJson } from './http/http.js'
import { requireAuth, requirePermission, requirePlatformAdministration } from './http/auth-middleware.js'

const repository = new PostgresEmployeeRepository(database)
const auth = new AuthService(database)
const accounts = new AccountsService(database)
const port = Number(process.env.HEGONGZUO_API_PORT ?? 4174)
const host = process.env.HEGONGZUO_API_HOST ?? '127.0.0.1'
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const accountRuntimeTasks = new AccountRuntimeTasks(accounts, projectRoot)
const platformManagement = new PlatformManagementService(database)
const workAssistantFiles = new WorkAssistantWorkspaceFiles(projectRoot)


function cookieToken(cookieHeader: string | undefined): string | null {
  const entry = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith('hegongzuo_session='))
  if (!entry) return null
  return decodeURIComponent(entry.slice('hegongzuo_session='.length)) || null
}

function sessionToken(request: IncomingMessage): string | null {
  return cookieToken(request.headers.cookie)
}

function sessionCookie(request: IncomingMessage, token: string, clear = false): string {
  const forwardedHeader = request.headers['x-forwarded-proto']
  const forwardedProtocol = typeof forwardedHeader === 'string'
    ? forwardedHeader.split(',').map((value) => value.trim()).at(-1)
    : undefined
  const secure = forwardedProtocol === 'https' || process.env.HEGONGZUO_SESSION_COOKIE_SECURE === 'true' ? '; Secure' : ''
  const maxAge = clear ? '; Max-Age=0' : '; Max-Age=604800'
  return `hegongzuo_session=${encodeURIComponent(token)}; Path=/api; HttpOnly; SameSite=Strict${secure}${maxAge}`
}

function loginSourceHash(request: IncomingMessage): string {
  // API 仅监听回环地址，来源 IP 由 Nginx 写入 X-Forwarded-For；取最右侧由本机 Nginx 追加的地址。
  const forwarded = request.headers['x-forwarded-for']
  const source = typeof forwarded === 'string'
    ? forwarded.split(',').map((value) => value.trim()).at(-1)
    : request.socket.remoteAddress
  return createHash('sha256').update(source || 'unknown').digest('hex')
}


function employeeId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/employees\/([^/]+)$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function resumeEmployeeId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/employees\/([^/]+)\/resume$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function departureEmployeeId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/employees\/([^/]+)\/departure$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function departureInput(value: unknown): { departureDate: string; departureReason: string } {
  if (!value || typeof value !== 'object') throw new HttpError(400, '请填写离职信息。')
  const record = value as Record<string, unknown>
  const departureDate = typeof record.departureDate === 'string' ? record.departureDate.trim() : ''
  const departureReason = typeof record.departureReason === 'string' ? record.departureReason.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate) || Number.isNaN(Date.parse(`${departureDate}T00:00:00Z`))) {
    throw new HttpError(400, '请填写有效的离职日期。')
  }
  if (!departureReason) throw new HttpError(400, '请填写离职原因。')
  return { departureDate, departureReason }
}


function accountId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/accounts\/([^/]+)$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function accountResetPasswordId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/accounts\/([^/]+)\/reset-password$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function accountStatusId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/accounts\/([^/]+)\/status$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function accountRetryId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/accounts\/([^/]+)\/retry-initialization$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function platformModuleId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/platform\/modules\/([^/]+)$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function auditCursor(value: string | null): { readonly createdAt: string; readonly id: number } | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid')
    const record = parsed as Record<string, unknown>
    if (typeof record.createdAt !== 'string' || Number.isNaN(Date.parse(record.createdAt)) || typeof record.id !== 'number' || !Number.isSafeInteger(record.id) || record.id < 1) throw new Error('invalid')
    return { createdAt: record.createdAt, id: record.id }
  } catch { throw new HttpError(400, '操作记录分页参数无效。') }
}

function encodeAuditCursor(cursor: { readonly createdAt: string; readonly id: number } | null): string | null {
  return cursor ? Buffer.from(JSON.stringify(cursor)).toString('base64url') : null
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (url.pathname === callbackPath) {
    await handleWeComCallback(request, response, url)
    return
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    await database.query('SELECT 1')
    const runtimes = await checkConfiguredAgentRuntimeHealth()
    const unavailable = runtimes.filter((runtime) => !runtime.available)
    sendJson(response, unavailable.length ? 503 : 200, { ok: unavailable.length === 0, database: 'postgresql', agentRuntimes: { expected: runtimes.length, available: runtimes.length - unavailable.length, running: runtimes.filter((runtime) => runtime.state === 'running').length, idle: runtimes.filter((runtime) => runtime.state === 'idle').length, unavailable: unavailable.map((runtime) => runtime.runtimeId) } })
    return
  }

  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    const body = await readJson(request)
    if (!body || typeof body !== 'object') throw new HttpError(400, '请求必须包含有效 JSON。')
    const record = body as Record<string, unknown>
    if (typeof record.accountId !== 'string' || typeof record.password !== 'string') {
      throw new HttpError(400, '请填写账号和密码。')
    }
    const result = await auth.login(record.accountId, record.password, loginSourceHash(request))
    sendJson(response, 200, { user: result.user }, { 'set-cookie': sessionCookie(request, result.token) })
    return
  }

  if (url.pathname === '/api/auth/me' && request.method === 'GET') {
    const token = sessionToken(request)
    const user = await auth.userForToken(token)
    if (!user) throw new HttpError(401, '登录已过期，请重新登录。')
    sendJson(response, 200, { user }, token ? { 'set-cookie': sessionCookie(request, token) } : {})
    return
  }

  if (url.pathname === '/api/auth/change-password' && request.method === 'POST') {
    const changeUser = await requireAuth(auth, request)
    const body = await readJson(request)
    const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const currentPassword = typeof record.currentPassword === 'string' ? record.currentPassword : ''
    const newPassword = typeof record.newPassword === 'string' ? record.newPassword : ''
    if (!currentPassword || !newPassword) throw new HttpError(400, '请填写当前密码和新密码。')
    await auth.changePassword(changeUser.id, currentPassword, newPassword)
    sendJson(response, 200, { ok: true })
    return
  }

  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    await auth.logout(sessionToken(request))
    response.writeHead(204, { 'set-cookie': sessionCookie(request, '', true) })
    response.end()
    return
  }

  // —— 以下业务接口全部要求登录 ——
  const currentUser = await requireAuth(auth, request)

  if (url.pathname === '/api/platform/access' && request.method === 'GET') {
    sendJson(response, 200, { disabledModuleIds: await platformManagement.disabledModuleIds() })
    return
  }

  if (url.pathname === '/api/platform/status' && request.method === 'GET') {
    requirePlatformAdministration(currentUser)
    sendJson(response, 200, await platformManagement.status())
    return
  }

  if (url.pathname === '/api/platform/audit-logs' && request.method === 'GET') {
    requirePlatformAdministration(currentUser)
    const page = await platformManagement.auditLogs(auditCursor(url.searchParams.get('cursor')))
    sendJson(response, 200, { logs: page.logs, nextCursor: encodeAuditCursor(page.nextCursor) })
    return
  }

  if (url.pathname === '/api/platform/audit-logs/export' && request.method === 'GET') {
    requirePlatformAdministration(currentUser)
    await platformManagement.exportAuditCsv(response)
    return
  }

  if (url.pathname === '/api/work-assistant/files' && request.method === 'GET') {
    sendJson(response, 200, await workAssistantFiles.list(currentUser.accountId))
    return
  }

  if (url.pathname === '/api/work-assistant/files' && request.method === 'POST') {
    const file = await workAssistantFiles.upload(currentUser.accountId, request)
    sendJson(response, 201, { file })
    return
  }

  if (url.pathname === '/api/work-assistant/files/download' && request.method === 'GET') {
    await workAssistantFiles.download(currentUser.accountId, url.searchParams.get('path'), response)
    return
  }

  if (url.pathname === '/api/work-assistant/files' && request.method === 'DELETE') {
    const filePath = url.searchParams.get('path')
    await workAssistantFiles.remove(currentUser.accountId, filePath)
    sendJson(response, 200, { ok: true })
    return
  }

  const managedModuleId = platformModuleId(url.pathname)
  if (managedModuleId && request.method === 'PATCH') {
    requirePlatformAdministration(currentUser)
    const body = await readJson(request)
    const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    await platformManagement.setModuleEnabled(managedModuleId, record.enabled, currentUser.id, currentUser.displayName)
    sendJson(response, 200, await platformManagement.status())
    return
  }

  const runtimeRequest = agentRuntimeRequest(request.url)
  if (runtimeRequest) {
    const authorization = await authorizationForAgentRuntime(runtimeRequest.agentId)
    if (!authorization) throw new HttpError(503, '该功能服务尚未完成运行时配置。')
    if (authorization.access === 'permission') requirePermission(currentUser, authorization.permissionId)
    if (runtimeRequest.agentId === 'employee-query') await platformManagement.assertModuleEnabled('employee-agent')
    await proxyAgentRequest(request, response, currentUser, runtimeRequest)
    return
  }

  if (url.pathname === '/api/accounts' && request.method === 'GET') {
    requirePlatformAdministration(currentUser)
    sendJson(response, 200, { accounts: await accounts.list() })
    return
  }

  if (url.pathname === '/api/accounts/permission-catalog' && request.method === 'GET') {
    requirePlatformAdministration(currentUser)
    const basePermissions = [
      { id: 'employee-data', label: '档案维护', group: '员工管理' },
      { id: 'employee-query', label: '数据查询', group: '员工管理' },
      { id: 'finance-management', label: '待开发', group: '财务管理' },
      { id: 'project-management', label: '待开发', group: '项目管理' },
      { id: 'management-cockpit', label: '驾驶舱', group: '其他' },
      { id: 'platform-administration', label: '平台与账号管理', group: '其他' },
    ]
    const existingIds = new Set(basePermissions.map((permission) => permission.id))
    const extensions = (await registeredAgentPermissions(projectRoot))
      .filter((agent) => !existingIds.has(agent.permissionId))
      .map((agent) => ({ id: agent.permissionId, label: agent.label, group: '扩展功能' }))
    sendJson(response, 200, { permissions: [...basePermissions, ...extensions] })
    return
  }

  if (url.pathname === '/api/accounts' && request.method === 'POST') {
    requirePlatformAdministration(currentUser)
    const body = await readJson(request)
    if (!body || typeof body !== 'object') throw new HttpError(400, '请求必须包含有效 JSON。')
    const record = body as Record<string, unknown>
    let created
    try {
      created = await accounts.create({
        accountId: typeof record.accountId === 'string' ? record.accountId : '',
        displayName: typeof record.displayName === 'string' ? record.displayName : '',
        position: typeof record.position === 'string' ? record.position : '',
        permissions: record.permissions,
      })
    } catch (error) {
      if (error instanceof Error) throw new AccountValidationError(error.message)
      throw error
    }
    accountRuntimeTasks.enqueue(created, { transitionStatus: true, provision: true })
    await platformManagement.record(currentUser.id, currentUser.displayName, '新增账号', '账号', created.id, { accountId: created.accountId, displayName: created.displayName })
    sendJson(response, 202, { account: created })
    return
  }

  const accountIdPath = accountId(url.pathname)
  if (accountIdPath && request.method === 'PUT') {
    requirePlatformAdministration(currentUser)
    const body = await readJson(request)
    if (!body || typeof body !== 'object') throw new HttpError(400, '请求必须包含有效 JSON。')
    const record = body as Record<string, unknown>
    const existing = await accounts.findById(accountIdPath)
    if (!existing) throw new HttpError(404, '账号不存在。')
    const agentPermissionIds = await registeredAgentPermissionIds(projectRoot)
    const updated = await accounts.update(accountIdPath, {
      accountId: typeof record.accountId === 'string' ? record.accountId : '',
      displayName: typeof record.displayName === 'string' ? record.displayName : '',
      position: typeof record.position === 'string' ? record.position : '',
      permissions: record.permissions,
    })
    if (!updated) throw new HttpError(404, '账号不存在。')
    const runtimeChange = runtimeChangeForAccountUpdate(existing, updated, agentPermissionIds)
    if (runtimeChange.sync) accountRuntimeTasks.enqueue(updated, { transitionStatus: false, provision: runtimeChange.provision || existing.accountId !== updated.accountId })
    await platformManagement.record(currentUser.id, currentUser.displayName, '更新账号', '账号', updated.id, { accountId: updated.accountId, displayName: updated.displayName, permissions: updated.permissions })
    sendJson(response, 202, { account: updated })
    return
  }

  if (accountIdPath && request.method === 'DELETE') {
    requirePlatformAdministration(currentUser)
    if (accountIdPath === currentUser.id) throw new HttpError(400, '不能删除当前登录的账号。')
    if (!await accounts.delete(accountIdPath)) throw new HttpError(404, '账号不存在。')
    // 删除后立即从运行时配置移除该账号；systemd 配置监听器随即停止对应实例。
    accountRuntimeTasks.synchronize()
    await platformManagement.record(currentUser.id, currentUser.displayName, '删除账号', '账号', accountIdPath)
    sendJson(response, 200, { ok: true })
    return
  }

  const resetPasswordId = accountResetPasswordId(url.pathname)
  if (resetPasswordId && request.method === 'POST') {
    requirePlatformAdministration(currentUser)
    if (!await accounts.resetPassword(resetPasswordId)) throw new HttpError(404, '账号不存在。')
    await platformManagement.record(currentUser.id, currentUser.displayName, '重置账号密码', '账号', resetPasswordId)
    sendJson(response, 200, { ok: true })
    return
  }

  const statusId = accountStatusId(url.pathname)
  if (statusId && request.method === 'POST') {
    requirePlatformAdministration(currentUser)
    if (statusId === currentUser.id) throw new HttpError(400, '不能停用自己的账号。')
    const body = await readJson(request)
    const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const status = typeof record.status === 'string' ? record.status : ''
    const updated = await accounts.setStatus(statusId, status)
    if (!updated) throw new HttpError(404, '账号不存在。')
    await platformManagement.record(currentUser.id, currentUser.displayName, status === 'disabled' ? '停用账号' : '启用账号', '账号', updated.id, { displayName: updated.displayName })
    sendJson(response, 200, { account: updated })
    return
  }

  const retryId = accountRetryId(url.pathname)
  if (retryId && request.method === 'POST') {
    requirePlatformAdministration(currentUser)
    const account = await accounts.findById(retryId)
    if (!account) throw new HttpError(404, '账号不存在。')
    accountRuntimeTasks.enqueue(account, { transitionStatus: true, provision: true })
    await platformManagement.record(currentUser.id, currentUser.displayName, '重试账号初始化', '账号', account.id, { displayName: account.displayName })
    sendJson(response, 202, { account: { ...account, status: 'initializing' } })
    return
  }

  if (url.pathname === '/api/employees' && request.method === 'GET') {
    requirePermission(currentUser, 'employee-data')
    await platformManagement.assertModuleEnabled('employee-data')
    const scope = url.searchParams.get('scope') === 'departed' ? 'departed' : 'employed'
    const sort = url.searchParams.get('sort')
    const allowedSorts = ['hireDate', 'departureDate', 'tenure', 'displayName', 'departmentName', 'contractEndDate'] as const
    const page = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('pageSize') ?? '10')
    const result = await repository.listPage({ query: url.searchParams.get('query') ?? '', scope, page: Number.isInteger(page) && page > 0 ? page : 1, pageSize: Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 10, sort: allowedSorts.includes(sort as (typeof allowedSorts)[number]) ? sort as (typeof allowedSorts)[number] : scope === 'departed' ? 'departureDate' : 'hireDate', ascending: url.searchParams.get('ascending') !== 'false' })
    sendJson(response, 200, { ...result, page, pageSize })
    return
  }

  if (url.pathname === '/api/employees/export' && request.method === 'GET') {
    requirePermission(currentUser, 'employee-data')
    await platformManagement.assertModuleEnabled('employee-data')
    const scope = url.searchParams.get('scope') === 'departed' ? 'departed' : 'employed'
    const sort = url.searchParams.get('sort') as 'hireDate' | 'departureDate' | 'tenure' | 'displayName' | 'departmentName' | 'contractEndDate'
    const allowedSorts = ['hireDate', 'departureDate', 'tenure', 'displayName', 'departmentName', 'contractEndDate']
    sendJson(response, 200, { employees: await repository.listForExport({ query: url.searchParams.get('query') ?? '', scope, sort: allowedSorts.includes(sort) ? sort : scope === 'departed' ? 'departureDate' : 'hireDate', ascending: url.searchParams.get('ascending') !== 'false' }) })
    return
  }

  if (url.pathname === '/api/employees/contract-expiry-alerts' && request.method === 'GET') {
    requirePermission(currentUser, 'employee-data')
    await platformManagement.assertModuleEnabled('employee-data')
    const alerts = await repository.listContractExpiryAlerts(7)
    sendJson(response, 200, { alerts })
    return
  }

  if (url.pathname === '/api/employees' && request.method === 'POST') {
    requirePermission(currentUser, 'employee-data')
    await platformManagement.assertModuleEnabled('employee-data')
    const input = parseEmployeeInput(await readJson(request))
    const created = await repository.create(input)
    await platformManagement.record(currentUser.id, currentUser.displayName, '新增员工档案', '员工', created.id, employeeAuditDetail(null, created, input.resume !== undefined && input.resume !== null))
    sendJson(response, 201, { employee: created })
    return
  }

  const resumeId = resumeEmployeeId(url.pathname)
  if (resumeId && request.method === 'GET') {
    requirePermission(currentUser, 'employee-data')
    await platformManagement.assertModuleEnabled('employee-data')
    const resume = await repository.getResume(resumeId)
    if (!resume) throw new HttpError(404, '该员工尚未上传简历。')
    response.writeHead(200, {
      'content-type': resume.mimeType,
      'content-length': String(resume.data.length),
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(resume.fileName)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    })
    response.end(resume.data)
    return
  }

  const departureId = departureEmployeeId(url.pathname)
  if (departureId && request.method === 'POST') {
    requirePermission(currentUser, 'employee-data')
    await platformManagement.assertModuleEnabled('employee-data')
    const { departureDate, departureReason } = departureInput(await readJson(request))
    const employee = await repository.depart(departureId, departureDate, departureReason)
    if (!employee) throw new HttpError(404, '员工不存在。')
    await platformManagement.record(currentUser.id, currentUser.displayName, '办理员工离职', '员工', employee.id, { employeeName: employee.displayName, changedFields: ['员工状态', '离职日期', '离职原因'] })
    sendJson(response, 200, { employee })
    return
  }

  const id = employeeId(url.pathname)
  if (id && request.method === 'GET') {
    requirePermission(currentUser, 'employee-data')
    await platformManagement.assertModuleEnabled('employee-data')
    const employee = await repository.get(id)
    if (!employee) throw new HttpError(404, '员工不存在。')
    sendJson(response, 200, { employee })
    return
  }

  if (id && request.method === 'PUT') {
    requirePermission(currentUser, 'employee-data')
    await platformManagement.assertModuleEnabled('employee-data')
    const previous = await repository.get(id)
    if (!previous) throw new HttpError(404, '员工不存在。')
    const input = parseEmployeeInput(await readJson(request))
    const employee = await repository.update(id, input)
    if (!employee) throw new HttpError(404, '员工不存在。')
    const detail = employeeAuditDetail(previous, employee, input.resume !== undefined)
    if (detail.changedFields.length > 0) await platformManagement.record(currentUser.id, currentUser.displayName, detail.changedFields.length === 1 && detail.changedFields[0] === '员工简历' ? '更新员工简历' : '编辑员工档案', '员工', employee.id, detail)
    sendJson(response, 200, { employee })
    return
  }

  throw new HttpError(404, '接口不存在。')
}

function postgresErrorStatus(error: unknown): { status: number; message: string } | null {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  if (code === '23505') {
    const constraint = typeof error === 'object' && error !== null && 'constraint' in error ? String(error.constraint) : ''
    if (constraint === 'employees_work_email_key') return { status: 409, message: '工作邮箱已存在。' }
    if (constraint === 'employees_id_number_key') return { status: 409, message: '身份证号已存在。' }
    if (constraint === 'accounts_account_id_key') return { status: 409, message: '该登录名已存在。' }
    return { status: 409, message: '员工数据存在重复唯一字段。' }
  }
  if (code === '23503') return { status: 400, message: '员工数据引用了不存在的关联记录。' }
  if (code === '23514' || code === '22007') return { status: 400, message: '员工字段不符合数据库约束。' }
  return null
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    if (error instanceof HttpError || error instanceof WeComCallbackError || error instanceof AgentRuntimeProxyError || error instanceof EmployeeValidationError || error instanceof AuthError || error instanceof LoginRateLimitError || error instanceof AccountValidationError || error instanceof PlatformManagementError) {
      const status = error instanceof LoginRateLimitError
        ? 429
        : error instanceof HttpError || error instanceof WeComCallbackError || error instanceof AgentRuntimeProxyError
          ? error.status
          : 400
      sendJson(response, status, { error: error.message })
      return
    }
    const databaseError = postgresErrorStatus(error)
    if (databaseError) {
      sendJson(response, databaseError.status, { error: databaseError.message })
      return
    }
    console.error('[和工作 API] 请求失败：', error)
    sendJson(response, 500, { error: '服务器处理员工数据时发生错误。' })
  })
})

const openSockets = new Set<Socket>()
server.on('connection', (socket) => {
  openSockets.add(socket)
  socket.once('close', () => openSockets.delete(socket))
})

server.on('upgrade', (request, socket, head) => {
  // 认证与上游连接建立前浏览器也可能主动断开；必须接管错误，避免 ECONNRESET 退出 API。
  socket.on('error', () => undefined)
  const runtimeRequest = agentRuntimeRequest(request.url)
  if (!runtimeRequest) {
    socket.destroy()
    return
  }
  void (async () => {
    const user = await auth.userForToken(sessionToken(request))
    if (!user) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nconnection: close\r\n\r\n')
      return
    }
    const authorization = await authorizationForAgentRuntime(runtimeRequest.agentId)
    if (!authorization || (authorization.access === 'permission' && !user.permissions.includes(authorization.permissionId))) {
      socket.end('HTTP/1.1 403 Forbidden\r\nconnection: close\r\n\r\n')
      return
    }
    if (runtimeRequest.agentId === 'employee-query') await platformManagement.assertModuleEnabled('employee-agent')
    await proxyAgentUpgrade(request, socket, head, user, runtimeRequest)
  })().catch((error: unknown) => {
    const status = error instanceof AgentRuntimeProxyError ? error.status : 502
    const message = error instanceof Error ? error.message : '员工查询服务暂时不可用。'
    if (!socket.destroyed) socket.end(`HTTP/1.1 ${status} Service Unavailable\r\ncontent-type: application/json; charset=utf-8\r\nconnection: close\r\n\r\n${JSON.stringify({ error: message })}`)
  })
})

server.listen(port, host, () => {
  console.log(`[和工作 API] PostgreSQL 员工服务：http://${host}:${port}`)
  // 新建账号的初始化在后台队列执行；若 API 在队列完成前重启，启动后自动续办。
  accountRuntimeTasks.recoverPending()
})

// 作为 systemd 定时协调的补充，持续恢复因短暂外部运行时故障而留在待初始化状态的账号。
const runtimeRecoveryTimer = setInterval(() => accountRuntimeTasks.recoverPending(), 2 * 60_000)
runtimeRecoveryTimer.unref()

async function shutdown(): Promise<void> {
  const closed = new Promise<void>((resolve) => server.close(() => resolve()))
  const forceCloseTimer = setTimeout(() => {
    for (const socket of openSockets) socket.destroy()
  }, 5_000)
  forceCloseTimer.unref()
  await closed
  clearTimeout(forceCloseTimer)
  // 数据库驱动在网络异常或遗留事务下可能无限等待；部署时必须在固定期限内退出。
  await Promise.race([
    database.end().catch((error: unknown) => console.error('[和工作 API] 关闭数据库连接时发生错误：', error)),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ])
  process.exit(0)
}

process.once('SIGINT', () => { void shutdown() })
process.once('SIGTERM', () => { void shutdown() })
