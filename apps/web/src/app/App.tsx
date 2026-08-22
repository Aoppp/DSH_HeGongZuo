import { useEffect, useMemo, useState } from 'react'

import { apiLogout, apiMe } from './auth-client'
import { AccountLogin } from '../components/AccountLogin'
import { Sidebar } from '../components/Sidebar'
import { Topbar } from '../components/Topbar'
import { getModule, getVisibleModules, platformModules } from './module-registry'
import { accessibleModuleForPath, defaultModuleIdForUser } from './module-routes'
import type { AuthenticatedUser, ModuleId } from './types'
import { readPlatformAccess } from './platform-access-api'

export default function App() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [activeModuleId, setActiveModuleId] = useState<ModuleId>('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [disabledModuleIds, setDisabledModuleIds] = useState<readonly ModuleId[]>([])

  useEffect(() => {
    void apiMe().then((restoredUser) => {
      if (restoredUser) {
        setUser(restoredUser)
        void readPlatformAccess().then(setDisabledModuleIds).catch(() => setDisabledModuleIds([]))
      }
      setRestoring(false)
    })
  }, [])

  const visibleModules = useMemo(() => user ? getVisibleModules(user, disabledModuleIds) : [], [user, disabledModuleIds])

  useEffect(() => {
    if (!user) return
    const currentUser = user

    function synchronizeLocation() {
      const fallbackModuleId = defaultModuleIdForUser(currentUser.position, visibleModules)
      const module = accessibleModuleForPath(platformModules, visibleModules, window.location.pathname, fallbackModuleId)
      setActiveModuleId(module.id)
      if (window.location.pathname !== module.path) window.history.replaceState(null, '', module.path)
    }

    synchronizeLocation()
    window.addEventListener('popstate', synchronizeLocation)
    return () => window.removeEventListener('popstate', synchronizeLocation)
  }, [user, visibleModules])

  if (restoring) {
    return <div className="platform-boot">正在加载平台…</div>
  }

  if (!user) {
    return <AccountLogin onAuthenticated={(authenticatedUser) => {
      setUser(authenticatedUser)
      void readPlatformAccess().then(setDisabledModuleIds).catch(() => setDisabledModuleIds([]))
    }} />
  }

  const currentUser = user

  const activeModule = getModule(activeModuleId)
  const ActiveComponent = activeModule.component

  function exitPreview() {
    setUser(null)
    setActiveModuleId('overview')
    setSidebarCollapsed(false)
    setDisabledModuleIds([])
    window.history.replaceState(null, '', '/overview')
    void apiLogout()
  }

  function navigate(moduleId: ModuleId) {
    const fallbackModuleId = defaultModuleIdForUser(currentUser.position, visibleModules)
    const module = accessibleModuleForPath(platformModules, visibleModules, getModule(moduleId).path, fallbackModuleId)
    if (window.location.pathname !== module.path) window.history.pushState(null, '', module.path)
    setActiveModuleId(module.id)
    window.scrollTo(0, 0)
  }

  function updateCurrentUserProfile(profile: Pick<AuthenticatedUser, 'accountId' | 'displayName' | 'position' | 'permissions'>) {
    setUser((current) => current ? { ...current, ...profile } : current)
  }

  return (
    <div className={`platform-shell${sidebarCollapsed ? ' platform-shell--collapsed' : ''}`}>
      <Sidebar
        activeModule={activeModuleId}
        collapsed={sidebarCollapsed}
        modules={visibleModules}
        onNavigate={navigate}
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />
      <div className="platform-shell__main">
        <Topbar activeModule={activeModule} user={user} onExit={exitPreview} />
        <main className="platform-content">
          <ActiveComponent user={currentUser} onNavigate={navigate} onUserProfileUpdated={updateCurrentUserProfile} onModuleSettingsUpdated={setDisabledModuleIds} />
        </main>
      </div>
    </div>
  )
}
