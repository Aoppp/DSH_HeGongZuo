import type { AuthenticatedUser } from './types'

const tokenStorageKey = 'hegongzuo.session.token'

export function storedToken(): string | null {
  return localStorage.getItem(tokenStorageKey)
}

function storeToken(token: string): void {
  localStorage.setItem(tokenStorageKey, token)
}

export function clearToken(): void {
  localStorage.removeItem(tokenStorageKey)
}

interface AuthResponse {
  readonly token: string
  readonly user: AuthenticatedUser
}

interface MeResponse {
  readonly user: AuthenticatedUser
}

interface ErrorResponse {
  readonly error?: string
}

export class AuthApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = storedToken()
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    let message = `认证请求失败（HTTP ${response.status}）。`
    try {
      const error = await response.json() as ErrorResponse
      if (error.error) message = error.error
    } catch {
      // 非 JSON 错误响应使用 HTTP 状态信息。
    }
    throw new AuthApiError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function apiLogin(accountId: string, password: string): Promise<AuthenticatedUser> {
  const result = await authRequest<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ accountId, password }),
  })
  storeToken(result.token)
  return result.user
}

export async function apiMe(): Promise<AuthenticatedUser | null> {
  if (!storedToken()) return null
  try {
    return (await authRequest<MeResponse>('/api/auth/me')).user
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) clearToken()
    return null
  }
}

export async function apiChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  await authRequest<{ ok: boolean }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function apiLogout(): Promise<void> {
  try {
    await authRequest<void>('/api/auth/logout', { method: 'POST' })
  } finally {
    clearToken()
  }
}
