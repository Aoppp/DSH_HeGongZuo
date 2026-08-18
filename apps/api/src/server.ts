import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { database } from './database.js'
import { EmployeeValidationError, parseEmployeeInput } from './employee-input.js'
import { PostgresEmployeeRepository } from './employee-repository.js'

const repository = new PostgresEmployeeRepository(database)
const port = Number(process.env.HEGONGZUO_API_PORT ?? 4174)
const host = process.env.HEGONGZUO_API_HOST ?? '127.0.0.1'

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(value))
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

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (request.method === 'GET' && url.pathname === '/health') {
    await database.query('SELECT 1')
    sendJson(response, 200, { ok: true, database: 'postgresql' })
    return
  }

  if (url.pathname === '/api/employees' && request.method === 'GET') {
    sendJson(response, 200, { employees: await repository.list(url.searchParams.get('query') ?? '') })
    return
  }

  if (url.pathname === '/api/employees' && request.method === 'POST') {
    const created = await repository.create(parseEmployeeInput(await readJson(request)))
    sendJson(response, 201, { employee: created })
    return
  }

  const resumeId = resumeEmployeeId(url.pathname)
  if (resumeId && request.method === 'GET') {
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

  const id = employeeId(url.pathname)
  if (id && request.method === 'GET') {
    const employee = await repository.get(id)
    if (!employee) throw new HttpError(404, '员工不存在。')
    sendJson(response, 200, { employee })
    return
  }

  if (id && request.method === 'PUT') {
    const input = parseEmployeeInput(await readJson(request))
    const employee = await repository.update(id, input)
    if (!employee) throw new HttpError(404, '员工不存在。')
    sendJson(response, 200, { employee })
    return
  }

  if (id && request.method === 'DELETE') {
    if (!await repository.delete(id)) throw new HttpError(404, '员工不存在。')
    response.writeHead(204)
    response.end()
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
    return { status: 409, message: '员工数据存在重复唯一字段。' }
  }
  if (code === '23503') return { status: 400, message: '员工数据引用了不存在的关联记录。' }
  if (code === '23514' || code === '22007') return { status: 400, message: '员工字段不符合数据库约束。' }
  return null
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    if (error instanceof HttpError || error instanceof EmployeeValidationError) {
      sendJson(response, error instanceof HttpError ? error.status : 400, { error: error.message })
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

server.listen(port, host, () => {
  console.log(`[和工作 API] PostgreSQL 员工服务：http://${host}:${port}`)
})

async function shutdown(): Promise<void> {
  server.close()
  await database.end()
}

process.once('SIGINT', () => { void shutdown() })
process.once('SIGTERM', () => { void shutdown() })
