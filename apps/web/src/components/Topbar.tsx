import { LogOut } from 'lucide-react'

import { roles } from '../app/roles'
import type { AuthenticatedUser, PlatformModule } from '../app/types'

interface TopbarProps {
  readonly activeModule: PlatformModule
  readonly user: AuthenticatedUser
  readonly onExit: () => void
}

export function Topbar({ activeModule, user, onExit }: TopbarProps) {
  const currentRole = roles[user.role]

  return (
    <header className="topbar">
      <div className="topbar__title">
        <span>{activeModule.label}</span>
        <small>{activeModule.description}</small>
      </div>

      <div className="topbar__account">
        <div className="account-identity">
          <span className="avatar">{currentRole.initials}</span>
          <span>
            <strong>{user.displayName}</strong>
            <small>{currentRole.label} · {user.accountId}</small>
          </span>
        </div>
        <button type="button" className="icon-button" onClick={onExit} title="退出登录" aria-label="退出登录"><LogOut size={18} /></button>
      </div>
    </header>
  )
}
