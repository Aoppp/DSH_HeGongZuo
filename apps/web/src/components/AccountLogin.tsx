import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { apiLogin } from '../app/auth-client'
import type { AuthenticatedUser } from '../app/types'
import { BrandMark } from './BrandMark'

interface AccountLoginProps {
  readonly onAuthenticated: (user: AuthenticatedUser) => void
}

export function AccountLogin({ onAuthenticated }: AccountLoginProps) {
  const [accountId, setAccountId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accountId.trim() || !password) return
    setSubmitting(true)
    setError(null)
    try {
      onAuthenticated(await apiLogin(accountId.trim(), password))
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '无法登录。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="access-gate">
      <section className="access-gate__intro">
        <BrandMark />
        <div className="access-gate__copy">
          <h1>看清公司运行，<br />再做出好决策。</h1>
          <p>和工作将日常办公数据与工作入口集中在同一个平台。系统会根据登录账号自动判断身份和可见内容。</p>
        </div>
        <div className="access-gate__points">
          <span><Check size={16} /> 账号自动匹配职位</span>
          <span><Check size={16} /> 模块按权限自动显示</span>
          <span><Check size={16} /> 员工查询直接集成在平台内</span>
        </div>
      </section>

      <section className="access-card" aria-label="账号登录">
        <div className="access-card__heading">
          <h2>登录和工作</h2>
          <p>使用平台账号登录</p>
        </div>
        <form onSubmit={(event) => { void submit(event) }}>
          <label className="login-field">
            <span>账号</span>
            <div className="login-input"><UserRound size={17} /><input value={accountId} onChange={(event) => { setAccountId(event.target.value); setError(null) }} autoComplete="username" placeholder="请输入账号" /></div>
          </label>
          <label className="login-field">
            <span>密码</span>
            <div className="login-input"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => { setPassword(event.target.value); setError(null) }} autoComplete="current-password" placeholder="请输入密码" /><button type="button" className="login-input__toggle" onClick={() => setShowPassword((current) => !current)} title={showPassword ? '隐藏密码' : '显示密码'} aria-label={showPassword ? '隐藏密码' : '显示密码'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
          </label>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="primary-action" disabled={submitting || !accountId || !password}>
            {submitting ? <LoaderCircle className="spin" size={18} /> : <>登录 <ArrowRight size={18} /></>}
          </button>
        </form>
        <p className="access-card__notice">登录状态保持 7 天。账号问题请联系平台开发者。</p>
      </section>
    </main>
  )
}
