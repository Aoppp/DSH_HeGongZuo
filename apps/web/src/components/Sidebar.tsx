import { ChevronDown, ChevronLeft, ChevronRight, FolderKanban, Landmark, Users } from 'lucide-react'
import { useState, type MouseEvent } from 'react'

import type { ModuleGroupId, ModuleId, PlatformModule } from '../app/types'
import { BrandMark } from './BrandMark'

interface SidebarProps {
  readonly activeModule: ModuleId
  readonly collapsed: boolean
  readonly modules: readonly PlatformModule[]
  readonly onNavigate: (moduleId: ModuleId) => void
  readonly onToggle: () => void
}

const groupDefinitions: Record<ModuleGroupId, { readonly label: string; readonly icon: typeof Users }> = {
  'employee-management': { label: '员工管理', icon: Users },
  'finance-management': { label: '财务管理', icon: Landmark },
  'project-management': { label: '项目管理', icon: FolderKanban },
}

export function Sidebar({ activeModule, collapsed, modules, onNavigate, onToggle }: SidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<ModuleGroupId>>(() => new Set(['employee-management']))
  const renderedGroups = new Set<ModuleGroupId>()

  function followModuleLink(event: MouseEvent<HTMLAnchorElement>, moduleId: ModuleId) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigate(moduleId)
  }

  function moduleButton(module: PlatformModule) {
    const Icon = module.icon
    return (
      <a
        href={module.path}
        className={`${activeModule === module.id ? 'is-active' : ''} sidebar__nested-link`}
        title={collapsed ? module.label : undefined}
        onClick={(event) => followModuleLink(event, module.id)}
        key={module.id}
      >
        <Icon size={17} />
        {!collapsed && <span>{module.label}</span>}
      </a>
    )
  }

  function toggleGroup(groupId: ModuleGroupId) {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <BrandMark compact={collapsed} />
      </div>

      <nav className="sidebar__navigation" aria-label="平台模块">
        <p>{!collapsed && '当前功能'}</p>
        {modules.map((module) => {
          if (!module.group) {
            const Icon = module.icon
            return (
              <a href={module.path} className={activeModule === module.id ? 'is-active' : ''} title={collapsed ? module.label : undefined} onClick={(event) => followModuleLink(event, module.id)} key={module.id}>
                <Icon size={19} />
                {!collapsed && <span>{module.label}</span>}
                {!collapsed && module.badge && <small>{module.badge}</small>}
              </a>
            )
          }
          if (renderedGroups.has(module.group)) return null
          renderedGroups.add(module.group)
          const group = groupDefinitions[module.group]
          const GroupIcon = group.icon
          const groupModules = modules.filter((candidate) => candidate.group === module.group)
          const expanded = expandedGroups.has(module.group)
          return (
            <section className="sidebar__module-group" key={module.group}>
              <button type="button" className="sidebar__group-toggle" onClick={() => toggleGroup(module.group!)} title={collapsed ? group.label : undefined} aria-expanded={expanded}>
                <GroupIcon size={18} />
                {!collapsed && <><span>{group.label}</span>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</>}
              </button>
              {expanded && <div className="sidebar__group-links">{groupModules.map(moduleButton)}</div>}
            </section>
          )
        })}
      </nav>

      <div className="sidebar__scope">
        {!collapsed && (
          <>
            <span><i /> 内部开发阶段</span>
            <p>按账号已开通功能显示</p>
          </>
        )}
      </div>

      <button type="button" className="sidebar__toggle" onClick={onToggle} aria-label={collapsed ? '展开导航' : '收起导航'}>
        {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
      </button>
    </aside>
  )
}
