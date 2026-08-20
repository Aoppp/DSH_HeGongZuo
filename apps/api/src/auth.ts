import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

import type { Pool } from 'pg'

import { accountPermissionIds, type AccountPermissionId } from './account-permissions.js'

export interface AuthUser {
  readonly id: string
  readonly accountId: string
  readonly displayName: string
  readonly position: string
  readonly role: 'owner' | 'developer'
  readonly permissions: readonly AccountPermissionId[]
}

interface AccountRow {
  readonly id: string
  readonly account_id: string
  readonly display_name: string
  readonly position: string
  readonly password_hash: string
  readonly role: 'owner' | 'developer'
  readonly status: 'active' | 'disabled'
  readonly failed_login_count: number
  readonly locked_until: Date | string | null
  readonly permissions: string[]
}

function permissionsFor(row: AccountRow): AccountPermissionId[] {
  return row.permissions.filter((permission): permission is AccountPermissionId => accountPermissionIds.includes(permission as AccountPermissionId))
}

export const sessionTtlDays = 7
const maximumFailedLogins = 5
const accountLockMinutes = 15
const sourceWindowMinutes = 15
const maximumFailuresPerSource = 20

export class AuthError extends Error {}
export class LoginRateLimitError extends Error {}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 32).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = parts[1] ?? ''
  const expected = Buffer.from(parts[2] ?? '', 'hex')
  const actual = scryptSync(password, salt, 32)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export class AuthService {
  constructor(private readonly pool: Pool) {}

  async login(accountId: string, password: string, sourceHash: string): Promise<{ token: string; user: AuthUser }> {
    await this.assertSourceCanAttempt(sourceHash)
    const normalized = accountId.trim()
    const result = await this.pool.query<AccountRow>(
      `SELECT a.id, a.account_id, a.display_name, a.position, a.password_hash, a.role, a.status, a.failed_login_count, a.locked_until,
        COALESCE((SELECT array_agg(p.permission_id ORDER BY p.permission_id) FROM account_module_permissions p WHERE p.account_id = a.id), '{}'::varchar[]) AS permissions
       FROM accounts a WHERE a.account_id = $1`,
      [normalized],
    )
    const account = result.rows[0]
    if (account && this.isLocked(account.locked_until)) {
      await this.recordFailedAttempt(sourceHash)
      throw new AuthError('登录尝试过多，请 15 分钟后再试。')
    }
    // 账号不存在与密码错误返回同一提示，避免枚举账号。
    if (!account || !verifyPassword(password, account.password_hash)) {
      await this.recordFailedAttempt(sourceHash)
      if (account) await this.recordAccountFailure(account.id)
      throw new AuthError('账号或密码不正确。')
    }
    if (account.status !== 'active') {
      throw new AuthError('该账号已停用，请联系管理员。')
    }
    const token = randomBytes(32).toString('hex')
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('UPDATE accounts SET failed_login_count = 0, locked_until = NULL, updated_at = now() WHERE id = $1', [account.id])
      await client.query(
        `INSERT INTO sessions (token_hash, account_id, expires_at)
         VALUES ($1, $2, now() + make_interval(days => $3))`,
        [hashToken(token), account.id, sessionTtlDays],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return {
      token,
      user: {
        id: account.id,
        accountId: account.account_id,
        displayName: account.display_name,
        position: account.position,
        role: account.role,
        permissions: permissionsFor(account),
      },
    }
  }

  async userForToken(token: string | null | undefined): Promise<AuthUser | null> {
    if (!token) return null
    const result = await this.pool.query<AccountRow>(
      `SELECT a.id, a.account_id, a.display_name, a.position, a.password_hash, a.role, a.status, a.failed_login_count, a.locked_until,
        COALESCE((SELECT array_agg(p.permission_id ORDER BY p.permission_id) FROM account_module_permissions p WHERE p.account_id = a.id), '{}'::varchar[]) AS permissions
       FROM sessions s
       JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    )
    const account = result.rows[0]
    if (!account || account.status !== 'active') return null
    return {
      id: account.id,
      accountId: account.account_id,
      displayName: account.display_name,
      position: account.position,
      role: account.role,
      permissions: permissionsFor(account),
    }
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 6) throw new AuthError('新密码至少 6 位。')
    const result = await this.pool.query<AccountRow>(
      `SELECT a.id, a.account_id, a.display_name, a.position, a.password_hash, a.role, a.status, a.failed_login_count, a.locked_until,
        COALESCE((SELECT array_agg(p.permission_id ORDER BY p.permission_id) FROM account_module_permissions p WHERE p.account_id = a.id), '{}'::varchar[]) AS permissions
       FROM accounts a WHERE a.id = $1`,
      [id],
    )
    const account = result.rows[0]
    if (!account || !verifyPassword(currentPassword, account.password_hash)) {
      throw new AuthError('当前密码不正确。')
    }
    await this.pool.query(
      'UPDATE accounts SET password_hash = $2, updated_at = now() WHERE id = $1',
      [id, hashPassword(newPassword)],
    )
    await this.pool.query('DELETE FROM sessions WHERE account_id = $1', [id])
  }

  async logout(token: string | null | undefined): Promise<void> {
    if (!token) return
    await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
  }

  private isLocked(value: Date | string | null): boolean {
    if (!value) return false
    const until = value instanceof Date ? value.getTime() : Date.parse(value)
    return Number.isFinite(until) && until > Date.now()
  }

  private async assertSourceCanAttempt(sourceHash: string): Promise<void> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM login_attempts
       WHERE source_hash = $1 AND attempted_at >= now() - make_interval(mins => $2)`,
      [sourceHash, sourceWindowMinutes],
    )
    if (Number(result.rows[0]?.count ?? '0') >= maximumFailuresPerSource) {
      throw new LoginRateLimitError('登录尝试过多，请稍后再试。')
    }
  }

  private async recordFailedAttempt(sourceHash: string): Promise<void> {
    await this.pool.query('INSERT INTO login_attempts (source_hash) VALUES ($1)', [sourceHash])
    await this.pool.query(`DELETE FROM login_attempts WHERE attempted_at < now() - interval '7 days'`)
  }

  private async recordAccountFailure(accountId: string): Promise<void> {
    await this.pool.query(
      `UPDATE accounts
       SET failed_login_count = failed_login_count + 1,
           locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END,
           updated_at = now()
       WHERE id = $1`,
      [accountId, maximumFailedLogins, accountLockMinutes],
    )
  }
}

export function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}
