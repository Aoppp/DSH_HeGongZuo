import { Code2, Gauge, LayoutDashboard, Users } from 'lucide-react'

import { DeveloperConsoleModule } from '../modules/developer/DeveloperConsoleModule'
import { EmployeeAgentModule } from '../modules/employee-agent/EmployeeAgentModule'
import { EmployeeDataModule } from '../modules/employee-agent/EmployeeDataModule'
import { ManagementCockpitModule } from '../modules/management-cockpit/ManagementCockpitModule'
import { OverviewModule } from '../modules/overview/OverviewModule'
import type { ModuleId, PlatformModule, RoleId } from './types'

// 每个功能只在此注册一次。删除该项即可从导航和路由中同时移除功能。
export const platformModules: readonly PlatformModule[] = [
  {
    id: 'management-cockpit',
    label: '管理驾驶舱',
    description: '公司整体运行情况的一屏总览',
    icon: Gauge,
    allowedRoles: ['owner'],
    component: ManagementCockpitModule,
  },
  {
    id: 'overview',
    label: '概览',
    description: '当前角色的工作入口',
    icon: LayoutDashboard,
    allowedRoles: ['owner', 'developer'],
    component: OverviewModule,
  },
  {
    id: 'employee-data',
    label: '员工数据',
    description: '查看和维护全体员工信息',
    icon: Users,
    allowedRoles: ['owner', 'developer'],
    component: EmployeeDataModule,
  },
  {
    id: 'employee-agent',
    label: '员工查询',
    description: '在平台内查询员工与组织信息',
    icon: Users,
    allowedRoles: ['owner', 'developer'],
    component: EmployeeAgentModule,
  },
  {
    id: 'developer-console',
    label: '开发控制台',
    description: '查看开发环境与模块结构',
    icon: Code2,
    allowedRoles: ['developer'],
    component: DeveloperConsoleModule,
  },
]

export function getVisibleModules(role: RoleId): readonly PlatformModule[] {
  return platformModules.filter((module) => module.allowedRoles.includes(role))
}

export function getModule(moduleId: ModuleId): PlatformModule {
  const module = platformModules.find((candidate) => candidate.id === moduleId)
  if (!module) throw new Error(`未注册的平台模块：${moduleId}`)
  return module
}

export function canAccessModule(moduleId: ModuleId, role: RoleId): boolean {
  return getModule(moduleId).allowedRoles.includes(role)
}
