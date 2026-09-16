import type { EmployeeDataSource } from './repository.js'

/** 运行时只持有本账号的只读能力凭证，数据库和授权判断留在平台 API。 */
export function remoteEmployeeSource(): EmployeeDataSource {
  const endpoint = process.env.HEGONGZUO_EMPLOYEE_GATEWAY_URL
  const token = process.env.HEGONGZUO_RUNTIME_TOKEN
  const runtimeId = process.env.HEGONGZUO_RUNTIME_ID
  if (!endpoint || !token || !runtimeId) throw new Error('员工查询服务缺少受控连接配置。')
  async function call<T>(method: string, input?: unknown): Promise<T> {
    const response = await fetch(endpoint!, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ runtimeId, method, input }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(response.status === 403 ? '当前账号未开通员工查询权限。' : '员工查询服务暂时不可用。')
    return await response.json() as T
  }
  return {
    search: (input) => call('search', input),
    getById: (input) => call('getById', input),
    listDepartmentMembers: (input) => call('listDepartmentMembers', input),
    stats: () => call('stats'),
    analyze: (input) => call('analyze', input),
    contractAlerts: (input) => call('contractAlerts', input),
  }
}
