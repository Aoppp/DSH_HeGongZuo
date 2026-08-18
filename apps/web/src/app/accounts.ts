import type { AuthenticatedUser, RoleId } from './types'

interface InternalAccount extends AuthenticatedUser {
  readonly password: string
}

// 当前只用于本地开发验证。正式环境应由服务端返回用户和角色，不能在前端保存密码。
const internalAccounts: readonly InternalAccount[] = [
  {
    accountId: 'boss',
    password: 'demo123',
    displayName: '管理员',
    role: 'owner',
  },
  {
    accountId: 'developer',
    password: 'demo123',
    displayName: '平台开发者',
    role: 'developer',
  },
]

export interface LoginResult {
  readonly ok: boolean
  readonly user?: AuthenticatedUser
  readonly error?: string
}

export function authenticateAccount(accountId: string, password: string): LoginResult {
  const normalizedAccount = accountId.trim().toLowerCase()
  const account = internalAccounts.find((candidate) => candidate.accountId === normalizedAccount)

  if (!account || account.password !== password) {
    return { ok: false, error: '账号或密码不正确。' }
  }

  return {
    ok: true,
    user: {
      accountId: account.accountId,
      displayName: account.displayName,
      role: account.role,
    },
  }
}

export const developmentAccountHints: ReadonlyArray<{ readonly accountId: string; readonly password: string; readonly role: RoleId }> = internalAccounts.map((account) => ({
  accountId: account.accountId,
  password: account.password,
  role: account.role,
}))
