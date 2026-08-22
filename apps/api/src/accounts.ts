import type { Pool } from 'pg'

import { hashPassword } from './auth.js'
import { accountPermissionIds, parsePermissions, type AccountPermissionId } from './account-permissions.js'

export interface AccountRecord {
  readonly id: string
  readonly accountId: string
  readonly displayName: string
  readonly position: string
  readonly status: 'active' | 'disabled' | 'initializing' | 'initialization_failed'
  readonly permissions: readonly AccountPermissionId[]
  readonly createdAt: string
  readonly updatedAt: string
}

export class AccountValidationError extends Error {}

// 登录名规则：姓名拼音（小写字母开头，可含数字），如 liuao
const accountIdPattern = /^[a-z][a-z0-9]{1,31}$/

export function validateAccountId(accountId: string): string | null {
  const normalized = accountId.trim()
  if (!accountIdPattern.test(normalized)) {
    return '登录名必须为姓名拼音（小写字母开头，可含数字，如 liuao）。'
  }
  return null
}

// 新建账号与一键重置使用的默认密码
export const defaultAccountPassword = 'wangshuhe123'

const statusPattern = /^(active|disabled|initializing|initialization_failed)$/

interface AccountRow {
  readonly id: string
  readonly account_id: string
  readonly display_name: string
  readonly position: string
  readonly status: 'active' | 'disabled' | 'initializing' | 'initialization_failed'
  readonly permissions: string[]
  readonly created_at: string | Date
  readonly updated_at: string | Date
}

function toAccount(row: AccountRow): AccountRecord {
  const format = (value: string | Date): string => value instanceof Date ? value.toISOString() : value
  return {
    id: row.id,
    accountId: row.account_id,
    displayName: row.display_name,
    position: row.position,
    status: row.status,
    permissions: row.permissions.filter((permission): permission is AccountPermissionId => accountPermissionIds.includes(permission as AccountPermissionId)),
    createdAt: format(row.created_at),
    updatedAt: format(row.updated_at),
  }
}

export class AccountsService {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<AccountRecord[]> {
    const result = await this.pool.query<AccountRow>(
      `SELECT a.id, a.account_id, a.display_name, a.position, a.status, a.created_at, a.updated_at,
        COALESCE((SELECT array_agg(p.permission_id ORDER BY p.permission_id) FROM account_module_permissions p WHERE p.account_id = a.id), '{}'::varchar[]) AS permissions
       FROM accounts a ORDER BY a.created_at, a.id`,
    )
    return result.rows.map(toAccount)
  }

  async findById(id: string): Promise<AccountRecord | null> {
    const result = await this.pool.query<AccountRow>(
      `SELECT a.id, a.account_id, a.display_name, a.position, a.status, a.created_at, a.updated_at,
        COALESCE((SELECT array_agg(p.permission_id ORDER BY p.permission_id) FROM account_module_permissions p WHERE p.account_id = a.id), '{}'::varchar[]) AS permissions
       FROM accounts a WHERE a.id = $1`,
      [id],
    )
    return result.rows[0] ? toAccount(result.rows[0]) : null
  }

  async create(input: {
    readonly accountId: string
    readonly displayName: string
    readonly position: string
    readonly permissions: unknown
  }): Promise<AccountRecord> {
    const accountId = input.accountId.trim()
    const displayName = input.displayName.trim()
    const position = input.position.trim()
    if (!displayName) throw new AccountValidationError('请填写姓名。')
    if (!position) throw new AccountValidationError('请填写职位。')
    if (position.length > 120) throw new AccountValidationError('职位不能超过 120 个字符。')
    const idError = validateAccountId(accountId)
    if (idError) throw new AccountValidationError(idError)
    const permissions = parsePermissions(input.permissions)
    const id = await this.nextId()
    const client = await this.pool.connect()
    let row: AccountRow | undefined
    try {
      await client.query('BEGIN')
      const result = await client.query<AccountRow>(
        `INSERT INTO accounts (id, account_id, display_name, position, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, 'initializing')
         RETURNING id, account_id, display_name, position, status, created_at, updated_at, '{}'::varchar[] AS permissions`,
        [id, accountId, displayName, position, hashPassword(defaultAccountPassword)],
      )
      row = result.rows[0]
      await client.query(
        'INSERT INTO account_module_permissions (account_id, permission_id) SELECT $1, unnest($2::varchar[])',
        [id, permissions],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    if (!row) throw new Error('新增账号后未返回记录。')
    return { ...toAccount(row), permissions }
  }

  async update(id: string, input: {
    readonly accountId: string
    readonly displayName: string
    readonly position: string
    readonly permissions: unknown
  }): Promise<AccountRecord | null> {
    const accountId = input.accountId.trim()
    const displayName = input.displayName.trim()
    const position = input.position.trim()
    if (!displayName) throw new AccountValidationError('请填写姓名。')
    if (!position) throw new AccountValidationError('请填写职位。')
    if (position.length > 120) throw new AccountValidationError('职位不能超过 120 个字符。')
    const idError = validateAccountId(accountId)
    if (idError) throw new AccountValidationError(idError)
    const permissions = parsePermissions(input.permissions)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<AccountRow>(
        `UPDATE accounts SET account_id = $2, display_name = $3, position = $4, updated_at = now()
         WHERE id = $1
         RETURNING id, account_id, display_name, position, status, created_at, updated_at, '{}'::varchar[] AS permissions`,
        [id, accountId, displayName, position],
      )
      const row = result.rows[0]
      if (!row) { await client.query('ROLLBACK'); return null }
      await client.query('DELETE FROM account_module_permissions WHERE account_id = $1', [id])
      await client.query('INSERT INTO account_module_permissions (account_id, permission_id) SELECT $1, unnest($2::varchar[])', [id, permissions])
      await client.query('COMMIT')
      return { ...toAccount(row), permissions }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM accounts WHERE id = $1', [id])
    return (result.rowCount ?? 0) > 0
  }

  async resetPassword(id: string): Promise<boolean> {
    const result = await this.pool.query(
      'UPDATE accounts SET password_hash = $2, updated_at = now() WHERE id = $1',
      [id, hashPassword(defaultAccountPassword)],
    )
    return (result.rowCount ?? 0) > 0
  }

  async setStatus(id: string, status: string): Promise<AccountRecord | null> {
    if (!statusPattern.test(status)) throw new AccountValidationError('状态无效。')
    const result = await this.pool.query<AccountRow>(
      `UPDATE accounts SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, account_id, display_name, position, status, created_at, updated_at,
       COALESCE((SELECT array_agg(p.permission_id ORDER BY p.permission_id) FROM account_module_permissions p WHERE p.account_id = accounts.id), '{}'::varchar[]) AS permissions`,
      [id, status],
    )
    return result.rows[0] ? toAccount(result.rows[0]) : null
  }

  private async nextId(): Promise<string> {
    const result = await this.pool.query<{ value: string }>(
      `SELECT 'ACC-' || lpad((COALESCE(MAX(substring(id FROM '[0-9]+$')::bigint), 0) + 1)::text, 4, '0') AS value FROM accounts`,
    )
    return result.rows[0]?.value ?? 'ACC-0001'
  }
}
