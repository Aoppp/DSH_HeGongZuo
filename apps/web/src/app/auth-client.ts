import type { AuthenticatedUser } from './types'

interface AuthResponse {
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
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
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
  return result.user
}

export async function apiMe(): Promise<AuthenticatedUser | null> {
  try {
    return (await authRequest<MeResponse>('/api/auth/me')).user
  } catch {
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
  await authRequest<void>('/api/auth/logout', { method: 'POST' })
}
