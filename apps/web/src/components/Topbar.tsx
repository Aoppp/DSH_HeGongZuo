import { KeyRound, LoaderCircle, LogOut, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { apiChangePassword } from '../app/auth-client'
import type { AuthenticatedUser, PlatformModule } from '../app/types'

interface TopbarProps {
  readonly activeModule: PlatformModule
  readonly user: AuthenticatedUser
  readonly onExit: () => void
}

export function Topbar({ activeModule, user, onExit }: TopbarProps) {
  const positionLabel = user.position || '成员'
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function closePasswordDialog() {
    setPasswordOpen(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setFormError(null)
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword.length < 6) {
      setFormError('新密码至少 6 位。')
      return
    }
    if (newPassword !== confirmPassword) {
      setFormError('两次输入的新密码不一致。')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await apiChangePassword(currentPassword, newPassword)
      closePasswordDialog()
      window.alert('密码已修改，下次登录请使用新密码。')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '修改密码失败。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <header className="topbar">
      <div className="topbar__title">
        <span>{activeModule.label}</span>
        <small>{activeModule.description}</small>
      </div>

      <div className="topbar__account">
        <div className="account-identity">
          <span className="avatar">{user.displayName.slice(0, 1)}</span>
          <span>
            <strong>{user.displayName}</strong>
            <small>{positionLabel}</small>
          </span>
        </div>
        <button type="button" className="icon-button" onClick={() => { setPasswordOpen(true); setFormError(null) }} title="修改密码" aria-label="修改密码"><KeyRound size={17} /></button>
        <button type="button" className="icon-button" onClick={onExit} title="退出登录" aria-label="退出登录"><LogOut size={18} /></button>
      </div>

      {passwordOpen && (
        <div className="employee-editor" role="dialog" aria-modal="true" aria-label="修改密码">
          <button className="employee-editor__backdrop" type="button" aria-label="关闭" onClick={closePasswordDialog} />
          <section className="employee-editor__panel">
            <header>
              <div><span>账号设置</span><strong>修改密码</strong></div>
              <button type="button" onClick={closePasswordDialog} title="关闭"><X size={18} /></button>
            </header>
            <form onSubmit={(event) => { void submitPassword(event) }}>
              <div className="employee-editor__fields">
                <label>当前密码<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label>
                <label>新密码<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="至少 6 位" /></label>
                <label>确认新密码<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>
              </div>
              {formError && <p className="employee-editor__error">{formError}</p>}
              <footer>
                <button className="employee-data__secondary" type="button" onClick={closePasswordDialog}>取消</button>
                <button className="employee-data__primary" type="submit" disabled={saving || !currentPassword || !newPassword || !confirmPassword}>{saving ? <LoaderCircle className="spin" size={15} /> : '保存'}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </header>
  )
}
