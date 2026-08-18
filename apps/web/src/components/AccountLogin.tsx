import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { authenticateAccount, developmentAccountHints } from '../app/accounts'
import type { AuthenticatedUser } from '../app/types'
import { BrandMark } from './BrandMark'

interface AccountLoginProps {
  readonly onAuthenticated: (user: AuthenticatedUser) => void
}

export function AccountLogin({ onAuthenticated }: AccountLoginProps) {
  const [accountId, setAccountId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = authenticateAccount(accountId, password)
    if (!result.ok || !result.user) {
      setError(result.error ?? '无法登录。')
      return
    }
    setError('')
    onAuthenticated(result.user)
  }

  return (
    <main className="access-gate">
      <section className="access-gate__intro">
        <BrandMark />
        <div className="access-gate__copy">
          <span className="eyebrow">王叔和内部办公平台</span>
          <h1>看清公司运行，<br />再做出好决策。</h1>
          <p>和工作将日常办公数据与工作入口集中在同一个平台。系统会根据登录账号自动判断身份和可见内容。</p>
        </div>
        <div className="access-gate__points">
          <span><Check size={16} /> 账号自动匹配角色</span>
          <span><Check size={16} /> 模块按权限自动显示</span>
          <span><Check size={16} /> 员工查询直接集成在平台内</span>
        </div>
      </section>

      <section className="access-card" aria-label="账号登录">
        <header>
          <span className="access-card__icon"><LockKeyhole size={22} /></span>
          <div>
            <p>内部访问</p>
            <h2>登录和工作</h2>
          </div>
        </header>

        <form className="login-form" onSubmit={submit}>
          <label>
            <span>账号</span>
            <div className="login-input"><UserRound size={17} /><input value={accountId} onChange={(event) => { setAccountId(event.target.value); setError('') }} autoComplete="username" placeholder="请输入账号" /></div>
          </label>
          <label>
            <span>密码</span>
            <div className="login-input"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} autoComplete="current-password" placeholder="请输入密码" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? '隐藏密码' : '显示密码'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
          </label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button type="submit" className="primary-action" disabled={!accountId || !password}>登录 <ArrowRight size={18} /></button>
        </form>

        <div className="development-accounts">
          <p>本地测试账号</p>
          {developmentAccountHints.map((account) => (
            <div key={account.accountId}>
              <span>{account.role === 'owner' ? '老板' : '开发者'}</span>
              <code>{account.accountId} / {account.password}</code>
            </div>
          ))}
        </div>
        <p className="access-card__notice">当前为本地测试账号。正式上线前将改为服务端认证，不在前端保存密码。</p>
      </section>
    </main>
  )
}
