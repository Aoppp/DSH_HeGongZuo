import type { IncomingMessage } from 'node:http'

import type { AccountPermissionId } from '../account-permissions.js'
import { type AuthService, type AuthUser } from '../auth.js'
import { HttpError } from './http.js'

function sessionToken(request: IncomingMessage): string | null {
  const entry = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('hegongzuo_session='))
  return entry ? decodeURIComponent(entry.slice('hegongzuo_session='.length)) || null : null
}

export async function requireAuth(auth: AuthService, request: IncomingMessage): Promise<AuthUser> {
  const user = await auth.userForToken(sessionToken(request))
  if (!user) throw new HttpError(401, '登录已过期，请重新登录。')
  return user
}

export function requirePermission(user: AuthUser, permission: AccountPermissionId): void { if (!user.permissions.includes(permission)) throw new HttpError(403, '当前账号未开通此功能。') }
export function requirePlatformAdministration(user: AuthUser): void { requirePermission(user, 'platform-administration') }
