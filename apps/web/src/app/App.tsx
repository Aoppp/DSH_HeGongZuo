import { useEffect, useMemo, useState } from 'react'

import { apiLogout, apiMe } from './auth-client'
import { AccountLogin } from '../components/AccountLogin'
import { Sidebar } from '../components/Sidebar'
import { Topbar } from '../components/Topbar'
import { getModule, getVisibleModules } from './module-registry'
import type { AuthenticatedUser, ModuleId } from './types'

export default function App() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [activeModuleId, setActiveModuleId] = useState<ModuleId>('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    void apiMe().then((restoredUser) => {
      if (restoredUser) {
        setUser(restoredUser)
        setActiveModuleId(restoredUser.position === 'CEO' ? 'management-cockpit' : 'overview')
      }
      setRestoring(false)
    })
  }, [])

  const visibleModules = useMemo(() => user ? getVisibleModules(user) : [], [user])

  if (restoring) {
    return <div className="platform-boot">正在加载平台…</div>
  }

  if (!user) {
    return <AccountLogin onAuthenticated={(authenticatedUser) => {
      setUser(authenticatedUser)
      setActiveModuleId(authenticatedUser.position === 'CEO' ? 'management-cockpit' : 'overview')
    }} />
  }

  const activeModule = getModule(activeModuleId)
  const ActiveComponent = activeModule.component

  function exitPreview() {
    setUser(null)
    setActiveModuleId('overview')
    setSidebarCollapsed(false)
    void apiLogout()
  }

  function updateCurrentUserProfile(profile: Pick<AuthenticatedUser, 'accountId' | 'displayName' | 'position'>) {
    setUser((current) => current ? { ...current, ...profile } : current)
  }

  return (
    <div className={`platform-shell${sidebarCollapsed ? ' platform-shell--collapsed' : ''}`}>
      <Sidebar
        activeModule={activeModuleId}
        collapsed={sidebarCollapsed}
        modules={visibleModules}
        onNavigate={setActiveModuleId}
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />
      <div className="platform-shell__main">
        <Topbar activeModule={activeModule} user={user} onExit={exitPreview} />
        <main className="platform-content">
          <ActiveComponent user={user} onNavigate={setActiveModuleId} onUserProfileUpdated={updateCurrentUserProfile} />
        </main>
      </div>
    </div>
  )
}
