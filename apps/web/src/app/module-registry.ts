import { BriefcaseBusiness, Code2, Gauge, Landmark, LayoutDashboard, Users } from 'lucide-react'

import { DeveloperConsoleModule } from '../modules/developer/console/DeveloperConsoleModule'
import { EmployeeAgentModule } from '../modules/employee/agent/EmployeeAgentModule'
import { EmployeeDataModule } from '../modules/employee/data/EmployeeDataModule'
import { ManagementCockpitModule } from '../modules/management/cockpit/ManagementCockpitModule'
import { FinanceManagementModule } from '../modules/finance/management/FinanceManagementModule'
import { ProjectManagementModule } from '../modules/project/management/ProjectManagementModule'
import { OverviewModule } from '../modules/overview/main/OverviewModule'
import type { AuthenticatedUser, ModuleId, PlatformModule, RoleId } from './types'

// 每个功能只在此注册一次。删除该项即可从导航和路由中同时移除功能。
export const platformModules: readonly PlatformModule[] = [
  {
    id: 'management-cockpit',
    path: '/management',
    label: '管理驾驶舱',
    description: '公司整体运行情况的一屏总览',
    icon: Gauge,
    allowedRoles: ['owner'],
    bossOnly: true,
    component: ManagementCockpitModule,
  },
  {
    id: 'overview',
    path: '/overview',
    label: '概览',
    description: '当前角色的工作入口',
    icon: LayoutDashboard,
    allowedRoles: ['owner', 'developer'],
    component: OverviewModule,
  },
  {
    id: 'employee-data',
    path: '/employee/data',
    label: '员工数据',
    description: '查看和维护全体员工信息',
    icon: Users,
    allowedRoles: ['owner', 'developer'],
    requiredPermission: 'employee-data',
    group: 'employee-management',
    component: EmployeeDataModule,
  },
  {
    id: 'employee-agent',
    path: '/employee/query',
    label: '员工查询',
    description: '在平台内查询员工与组织信息',
    icon: Users,
    allowedRoles: ['owner', 'developer'],
    requiredPermission: 'employee-query',
    group: 'employee-management',
    component: EmployeeAgentModule,
  },
  {
    id: 'finance-management',
    path: '/finance',
    label: '财务管理',
    description: '财务数据与业务流程管理',
    icon: Landmark,
    allowedRoles: ['owner', 'developer'],
    requiredPermission: 'finance-management',
    group: 'finance-management',
    component: FinanceManagementModule,
  },
  {
    id: 'project-management',
    path: '/projects',
    label: '项目管理',
    description: '项目计划与协作管理',
    icon: BriefcaseBusiness,
    allowedRoles: ['owner', 'developer'],
    requiredPermission: 'project-management',
    group: 'project-management',
    component: ProjectManagementModule,
  },
  {
    id: 'developer-console',
    path: '/developer',
    label: '开发控制台',
    description: '查看开发环境与模块结构',
    icon: Code2,
    allowedRoles: ['developer'],
    component: DeveloperConsoleModule,
  },
]

export function getVisibleModules(user: AuthenticatedUser): readonly PlatformModule[] {
  return platformModules.filter((module) => {
    if (!module.allowedRoles.includes(user.role)) return false
    if (module.requiredPermission && !user.permissions.includes(module.requiredPermission)) return false
    // 管理驾驶舱仅对 CEO 职位开放
    if (module.bossOnly && user.position !== 'CEO') return false
    return true
  })
}

export function getModule(moduleId: ModuleId): PlatformModule {
  const module = platformModules.find((candidate) => candidate.id === moduleId)
  if (!module) throw new Error(`未注册的平台模块：${moduleId}`)
  return module
}

export function canAccessModule(moduleId: ModuleId, role: RoleId): boolean {
  return getModule(moduleId).allowedRoles.includes(role)
}
