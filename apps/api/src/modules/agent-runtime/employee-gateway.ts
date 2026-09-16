import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Pool } from 'pg'
import { PostgresEmployeeRepository } from '@hegongzuo/employee-agent/data-source'
import { HttpError } from '../../http/http.js'
import { credentialMatches, runtimeCredential } from './credentials.js'

export class AgentEmployeeGateway {
  private readonly source: PostgresEmployeeRepository
  constructor(private readonly pool: Pool, private readonly root: string, private readonly assertModuleEnabled: () => Promise<void>) {
    this.source = new PostgresEmployeeRepository(pool)
  }

  async execute(token: string, body: unknown): Promise<unknown> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, '查询参数无效。')
    const { runtimeId, method, input } = body as Record<string, unknown>
    if (typeof runtimeId !== 'string' || typeof method !== 'string') throw new HttpError(400, '查询参数无效。')
    const credential = await runtimeCredential(this.root, runtimeId).catch(() => null)
    if (!credential || !credentialMatches(credential.token, token)) throw new HttpError(401, '查询凭证无效。')
    const definitions: unknown = JSON.parse(await readFile(path.join(this.root, '.runtime', 'agent-runtimes.json'), 'utf8'))
    if (!Array.isArray(definitions) || !definitions.some((entry) => entry.runtimeId === runtimeId && entry.accountKey === credential.accountKey)) throw new HttpError(403, '运行空间已撤销。')
    const allowed = await this.pool.query<{ allowed: boolean }>(`SELECT EXISTS (
      SELECT 1 FROM accounts a JOIN account_module_permissions p ON p.account_id = a.id
      WHERE a.runtime_key = $1 AND a.status = 'active' AND p.permission_id = 'employee-query'
    ) AS allowed`, [credential.accountKey])
    if (!allowed.rows[0]?.allowed) throw new HttpError(403, '当前账号未开通员工查询权限。')
    await this.assertModuleEnabled()
    if (method === 'stats') return this.source.stats()
    if (method === 'getById' || method === 'listDepartmentMembers') {
      if (typeof input !== 'string' || input.length > 200) throw new HttpError(400, '查询参数无效。')
      return method === 'getById' ? this.source.getById(input) : this.source.listDepartmentMembers(input)
    }
    if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) throw new HttpError(400, '查询参数无效。')
    const fields = (input ?? {}) as Record<string, unknown>
    const criteria: Record<string, string | number> = {}
    for (const [key, value] of Object.entries(fields)) {
      if (['query', 'department', 'jobTitle', 'status', 'gender', 'workLocation'].includes(key)) {
        if (typeof value !== 'string' || value.length > 200) throw new HttpError(400, '查询参数无效。')
        criteria[key] = value
      } else if (['offset', 'limit', 'days', 'regularizationDays'].includes(key)) {
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 10000) throw new HttpError(400, '查询参数无效。')
        criteria[key] = value
      } else throw new HttpError(400, '不支持的查询参数。')
    }
    if (method === 'search') return this.source.search(criteria)
    if (method === 'analyze') return this.source.analyze(criteria)
    if (method === 'contractAlerts') return this.source.contractAlerts(criteria)
    throw new HttpError(400, '不支持的只读查询。')
  }
}
