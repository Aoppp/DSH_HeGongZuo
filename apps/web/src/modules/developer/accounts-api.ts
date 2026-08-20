export type AccountRole = 'owner' | 'developer'
export type AccountStatus = 'active' | 'disabled' | 'initializing' | 'initialization_failed'
export type AccountPermissionId = 'employee-data' | 'employee-query' | 'finance-management' | 'project-management'

export interface AccountRecord {
  readonly id: string
  readonly accountId: string
  readonly displayName: string
  readonly position: string
  readonly role: AccountRole
  readonly status: AccountStatus
  readonly permissions: readonly AccountPermissionId[]
  readonly createdAt: string
  readonly updatedAt: string
}

interface AccountsResponse {
  readonly accounts: AccountRecord[]
}

interface AccountResponse {
  readonly account: AccountRecord
}

interface ErrorResponse {
  readonly error?: string
}

export class AccountsApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function accountsRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('hegongzuo.session.token')
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (response.status === 401) {
    localStorage.removeItem('hegongzuo.session.token')
    window.location.reload()
    throw new AccountsApiError(401, '登录已过期，请重新登录。')
  }
  if (!response.ok) {
    let message = `账号 API 请求失败（HTTP ${response.status}）。`
    try {
      const error = await response.json() as ErrorResponse
      if (error.error) message = error.error
    } catch {
      // 非 JSON 错误响应使用 HTTP 状态信息。
    }
    throw new AccountsApiError(response.status, message)
  }
  return response.json() as Promise<T>
}

export async function readAccounts(): Promise<AccountRecord[]> {
  return (await accountsRequest<AccountsResponse>('/api/accounts')).accounts
}

export async function createAccount(input: {
  readonly accountId: string
  readonly displayName: string
  readonly position: string
  readonly role: AccountRole
  readonly permissions: readonly AccountPermissionId[]
}): Promise<AccountRecord> {
  return (await accountsRequest<AccountResponse>('/api/accounts', {
    method: 'POST',
    body: JSON.stringify(input),
  })).account
}

export async function updateAccount(id: string, input: {
  readonly accountId: string
  readonly displayName: string
  readonly position: string
  readonly role: AccountRole
  readonly permissions: readonly AccountPermissionId[]
}): Promise<AccountRecord> {
  return (await accountsRequest<AccountResponse>(`/api/accounts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })).account
}

export async function deleteAccount(id: string): Promise<void> {
  await accountsRequest<{ ok: boolean }>(`/api/accounts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function resetAccountPassword(id: string): Promise<void> {
  await accountsRequest<{ ok: boolean }>(`/api/accounts/${encodeURIComponent(id)}/reset-password`, {
    method: 'POST',
  })
}

export async function setAccountStatus(id: string, status: AccountStatus): Promise<AccountRecord> {
  return (await accountsRequest<AccountResponse>(`/api/accounts/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })).account
}
