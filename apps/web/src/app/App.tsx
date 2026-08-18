import { useMemo, useState } from 'react'

import { AccountLogin } from '../components/AccountLogin'
import { Sidebar } from '../components/Sidebar'
import { Topbar } from '../components/Topbar'
import { getModule, getVisibleModules } from './module-registry'
import type { AuthenticatedUser, ModuleId } from './types'

export default function App() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [activeModuleId, setActiveModuleId] = useState<ModuleId>('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const visibleModules = useMemo(() => user ? getVisibleModules(user.role) : [], [user])

  if (!user) {
    return <AccountLogin onAuthenticated={(authenticatedUser) => {
      setUser(authenticatedUser)
      setActiveModuleId(authenticatedUser.role === 'owner' ? 'management-cockpit' : 'overview')
    }} />
  }

  const activeModule = getModule(activeModuleId)
  const ActiveComponent = activeModule.component

  function exitPreview() {
    setUser(null)
    setActiveModuleId('overview')
    setSidebarCollapsed(false)
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
          <ActiveComponent user={user} onNavigate={setActiveModuleId} />
        </main>
      </div>
    </div>
  )
}
