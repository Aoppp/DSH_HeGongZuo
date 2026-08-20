import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { AccountValidationError, AccountsService } from './accounts.js'
import { parsePermissions, type AccountPermissionId } from './account-permissions.js'
import { AgentRuntimeProxyError, isAgentRuntimeRequest, proxyAgentRequest, proxyAgentUpgrade } from './agent-runtime-proxy.js'
import { AuthError, AuthService, bearerToken, LoginRateLimitError, type AuthUser } from './auth.js'
import { database } from './database.js'
import { EmployeeValidationError, parseEmployeeInput } from './employee-input.js'
import { PostgresEmployeeRepository } from './employee-repository.js'

const repository = new PostgresEmployeeRepository(database)
const auth = new AuthService(database)
const accounts = new AccountsService(database)
const port = Number(process.env.HEGONGZUO_API_PORT ?? 4174)
const host = process.env.HEGONGZUO_API_HOST ?? '127.0.0.1'
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  })
  response.end(JSON.stringify(value))
}

function cookieToken(cookieHeader: string | undefined): string | null {
  const entry = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith('hegongzuo_session='))
  if (!entry) return null
  return decodeURIComponent(entry.slice('hegongzuo_session='.length)) || null
}

function sessionToken(request: IncomingMessage): string | null {
  return bearerToken(request.headers.authorization) ?? cookieToken(request.headers.cookie)
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

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = ''
  for await (const chunk of request) {
    body += String(chunk)
    if (body.length > 8_000_000) throw new HttpError(413, '请求内容过大。')
  }
  try {
    return JSON.parse(body)
  } catch {
    throw new HttpError(400, '请求必须包含有效 JSON。')
  }
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

async function requireAuth(request: IncomingMessage): Promise<AuthUser> {
  const token = sessionToken(request)
  const user = await auth.userForToken(token)
  if (!user) throw new HttpError(401, '登录已过期，请重新登录。')
  return user
}

function requireDeveloper(user: AuthUser): void {
  if (user.role !== 'developer') throw new HttpError(403, '仅平台开发者可以管理账号。')
}

function requirePermission(user: AuthUser, permission: AccountPermissionId): void {
  if (!user.permissions.includes(permission)) throw new HttpError(403, '当前账号未开通此功能。')
}

function runProjectScript(script: string, args: readonly string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(projectRoot, 'scripts', script), ...args], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0
      ? resolve()
      : reject(new Error(`账号初始化脚本执行失败（code=${String(code)}, signal=${String(signal)}）`)))
  })
}

async function initializeAccountRuntime(account: { readonly id: string; readonly accountId: string; readonly permissions: readonly AccountPermissionId[] }): Promise<void> {
  try {
    await prepareAccountRuntime(account)
    const enabled = await accounts.setStatus(account.id, 'active')
    if (!enabled) throw new Error('账号不存在。')
    await runProjectScript('sync-account-agent-runtimes.mjs')
  } catch (error) {
    await accounts.setStatus(account.id, 'initialization_failed')
    try { await runProjectScript('sync-account-agent-runtimes.mjs') } catch { /* 保留原始初始化错误。 */ }
    throw new HttpError(500, `账号创建后初始化失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

async function prepareAccountRuntime(account: { readonly accountId: string; readonly permissions: readonly AccountPermissionId[] }): Promise<void> {
  if (account.permissions.includes('employee-query')) {
    await runProjectScript('provision-account-agent-runtime.mjs', [account.accountId])
  }
  await runProjectScript('sync-account-agent-runtimes.mjs')
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

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (request.method === 'GET' && url.pathname === '/health') {
    await database.query('SELECT 1')
    sendJson(response, 200, { ok: true, database: 'postgresql' })
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
    const changeUser = await requireAuth(request)
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
  const currentUser = await requireAuth(request)

  if (isAgentRuntimeRequest(request.url)) {
    requirePermission(currentUser, 'employee-query')
    await proxyAgentRequest(request, response, currentUser)
    return
  }

  if (url.pathname === '/api/accounts' && request.method === 'GET') {
    requireDeveloper(currentUser)
    sendJson(response, 200, { accounts: await accounts.list() })
    return
  }

  if (url.pathname === '/api/accounts' && request.method === 'POST') {
    requireDeveloper(currentUser)
    const body = await readJson(request)
    if (!body || typeof body !== 'object') throw new HttpError(400, '请求必须包含有效 JSON。')
    const record = body as Record<string, unknown>
    let created
    try {
      created = await accounts.create({
        accountId: typeof record.accountId === 'string' ? record.accountId : '',
        displayName: typeof record.displayName === 'string' ? record.displayName : '',
        position: typeof record.position === 'string' ? record.position : '',
        role: typeof record.role === 'string' ? record.role : '',
        permissions: record.permissions,
      })
    } catch (error) {
      if (error instanceof Error) throw new AccountValidationError(error.message)
      throw error
    }
    await initializeAccountRuntime(created)
    sendJson(response, 201, { account: await accounts.findById(created.id) ?? created })
    return
  }

  const accountIdPath = accountId(url.pathname)
  if (accountIdPath && request.method === 'PUT') {
    requireDeveloper(currentUser)
    const body = await readJson(request)
    if (!body || typeof body !== 'object') throw new HttpError(400, '请求必须包含有效 JSON。')
    const record = body as Record<string, unknown>
    const updated = await accounts.update(accountIdPath, {
      accountId: typeof record.accountId === 'string' ? record.accountId : '',
      displayName: typeof record.displayName === 'string' ? record.displayName : '',
      position: typeof record.position === 'string' ? record.position : '',
      role: typeof record.role === 'string' ? record.role : '',
      permissions: record.permissions,
    })
    if (!updated) throw new HttpError(404, '账号不存在。')
    await prepareAccountRuntime(updated)
    sendJson(response, 200, { account: await accounts.findById(updated.id) ?? updated })
    return
  }

  if (accountIdPath && request.method === 'DELETE') {
    requireDeveloper(currentUser)
    if (accountIdPath === currentUser.id) throw new HttpError(400, '不能删除当前登录的账号。')
    if (!await accounts.delete(accountIdPath)) throw new HttpError(404, '账号不存在。')
    sendJson(response, 200, { ok: true })
    return
  }

  const resetPasswordId = accountResetPasswordId(url.pathname)
  if (resetPasswordId && request.method === 'POST') {
    requireDeveloper(currentUser)
    if (!await accounts.resetPassword(resetPasswordId)) throw new HttpError(404, '账号不存在。')
    sendJson(response, 200, { ok: true })
    return
  }

  const statusId = accountStatusId(url.pathname)
  if (statusId && request.method === 'POST') {
    requireDeveloper(currentUser)
    if (statusId === currentUser.id) throw new HttpError(400, '不能停用自己的账号。')
    const body = await readJson(request)
    const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const status = typeof record.status === 'string' ? record.status : ''
    const updated = await accounts.setStatus(statusId, status)
    if (!updated) throw new HttpError(404, '账号不存在。')
    sendJson(response, 200, { account: updated })
    return
  }

  if (url.pathname === '/api/employees' && request.method === 'GET') {
    requirePermission(currentUser, 'employee-data')
    sendJson(response, 200, { employees: await repository.list(url.searchParams.get('query') ?? '') })
    return
  }

  if (url.pathname === '/api/employees' && request.method === 'POST') {
    requirePermission(currentUser, 'employee-data')
    const created = await repository.create(parseEmployeeInput(await readJson(request)))
    sendJson(response, 201, { employee: created })
    return
  }

  const resumeId = resumeEmployeeId(url.pathname)
  if (resumeId && request.method === 'GET') {
    requirePermission(currentUser, 'employee-data')
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
    const { departureDate, departureReason } = departureInput(await readJson(request))
    const employee = await repository.depart(departureId, departureDate, departureReason)
    if (!employee) throw new HttpError(404, '员工不存在。')
    sendJson(response, 200, { employee })
    return
  }

  const id = employeeId(url.pathname)
  if (id && request.method === 'GET') {
    requirePermission(currentUser, 'employee-data')
    const employee = await repository.get(id)
    if (!employee) throw new HttpError(404, '员工不存在。')
    sendJson(response, 200, { employee })
    return
  }

  if (id && request.method === 'PUT') {
    requirePermission(currentUser, 'employee-data')
    const input = parseEmployeeInput(await readJson(request))
    const employee = await repository.update(id, input)
    if (!employee) throw new HttpError(404, '员工不存在。')
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
    if (error instanceof HttpError || error instanceof AgentRuntimeProxyError || error instanceof EmployeeValidationError || error instanceof AuthError || error instanceof LoginRateLimitError || error instanceof AccountValidationError) {
      const status = error instanceof LoginRateLimitError
        ? 429
        : error instanceof HttpError || error instanceof AgentRuntimeProxyError
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

server.on('upgrade', (request, socket, head) => {
  if (!isAgentRuntimeRequest(request.url)) {
    socket.destroy()
    return
  }
  void (async () => {
    const user = await auth.userForToken(sessionToken(request))
    if (!user) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nconnection: close\r\n\r\n')
      return
    }
    if (!user.permissions.includes('employee-query')) {
      socket.end('HTTP/1.1 403 Forbidden\r\nconnection: close\r\n\r\n')
      return
    }
    await proxyAgentUpgrade(request, socket, head, user)
  })().catch((error: unknown) => {
    const status = error instanceof AgentRuntimeProxyError ? error.status : 502
    const message = error instanceof Error ? error.message : '员工查询服务暂时不可用。'
    socket.end(`HTTP/1.1 ${status} Service Unavailable\r\ncontent-type: application/json; charset=utf-8\r\nconnection: close\r\n\r\n${JSON.stringify({ error: message })}`)
  })
})

server.listen(port, host, () => {
  console.log(`[和工作 API] PostgreSQL 员工服务：http://${host}:${port}`)
})

async function shutdown(): Promise<void> {
  server.close()
  await database.end()
}

process.once('SIGINT', () => { void shutdown() })
process.once('SIGTERM', () => { void shutdown() })
