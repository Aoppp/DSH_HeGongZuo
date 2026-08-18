import { ChevronLeft, ChevronRight } from 'lucide-react'

import type { ModuleId, PlatformModule } from '../app/types'
import { BrandMark } from './BrandMark'

interface SidebarProps {
  readonly activeModule: ModuleId
  readonly collapsed: boolean
  readonly modules: readonly PlatformModule[]
  readonly onNavigate: (moduleId: ModuleId) => void
  readonly onToggle: () => void
}

export function Sidebar({ activeModule, collapsed, modules, onNavigate, onToggle }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <BrandMark compact={collapsed} />
      </div>

      <nav className="sidebar__navigation" aria-label="平台模块">
        <p>{!collapsed && '当前功能'}</p>
        {modules.map((module) => {
          const Icon = module.icon
          return (
            <button
              type="button"
              className={activeModule === module.id ? 'is-active' : ''}
              title={collapsed ? module.label : undefined}
              onClick={() => onNavigate(module.id)}
              key={module.id}
            >
              <Icon size={19} />
              {!collapsed && <span>{module.label}</span>}
              {!collapsed && module.badge && <small>{module.badge}</small>}
            </button>
          )
        })}
      </nav>

      <div className="sidebar__scope">
        {!collapsed && (
          <>
            <span><i /> 内部开发阶段</span>
            <p>当前开放管理员与开发者账号</p>
          </>
        )}
      </div>

      <button type="button" className="sidebar__toggle" onClick={onToggle} aria-label={collapsed ? '展开导航' : '收起导航'}>
        {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
      </button>
    </aside>
  )
}
