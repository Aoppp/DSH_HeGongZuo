import { BriefcaseBusiness, CalendarCheck, ClipboardList, Code2, Files, Gauge, Landmark, LayoutDashboard, Presentation, Users } from 'lucide-react'

import { DeveloperConsoleModule } from '../modules/developer/console/DeveloperConsoleModule'
import { EmployeeAgentModule } from '../modules/employee/agent/EmployeeAgentModule'
import { EmployeeDataModule } from '../modules/employee/data/EmployeeDataModule'
import { EmployeeAttendanceModule } from '../modules/employee/attendance/EmployeeAttendanceModule'
import { EmployeeReportsModule } from '../modules/employee/reports/EmployeeReportsModule'
import { ManagementCockpitModule } from '../modules/management/cockpit/ManagementCockpitModule'
import { FinanceManagementModule } from '../modules/finance/management/FinanceManagementModule'
import { ProjectManagementModule } from '../modules/project/management/ProjectManagementModule'
import { OverviewModule } from '../modules/overview/main/OverviewModule'
import { WorkAssistantModule } from '../modules/work-assistant/main/WorkAssistantModule'
import { MeetingRecordsModule } from '../modules/meetings/records/MeetingRecordsModule'
import { RecruitmentManagementModule } from '../modules/recruitment/RecruitmentManagementModule'
import type { AuthenticatedUser, ModuleId, PlatformModule } from './types'

// 每个功能只在此注册一次。删除该项即可从导航和路由中同时移除功能。
export const platformModules: readonly PlatformModule[] = [
  {
    id: 'management-cockpit',
    path: '/management',
    label: '管理驾驶舱',
    description: '公司整体运行情况的一屏总览',
    icon: Gauge,
    requiredPermission: 'management-cockpit',
    bossOnly: true,
    component: ManagementCockpitModule,
  },
  {
    id: 'overview',
    path: '/overview',
    label: '概览',
    description: '当前角色的工作入口',
    icon: LayoutDashboard,
    component: OverviewModule,
  },
  {
    id: 'work-assistant',
    path: '/work-assistant',
    label: '工作助理',
    description: '整理个人工作区中的表格文件',
    icon: Files,
    component: WorkAssistantModule,
  },
  {
    id: 'employee-data',
    path: '/employee/data',
    label: '员工数据',
    description: '查看和维护全体员工信息',
    icon: Users,
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
    requiredPermission: 'employee-query',
    group: 'employee-management',
    component: EmployeeAgentModule,
  },
  {
    id: 'employee-attendance',
    path: '/employee/attendance',
    label: '考勤管理',
    description: '查看员工打卡和考勤异常',
    icon: CalendarCheck,
    requiredPermission: 'employee-attendance',
    group: 'employee-management',
    component: EmployeeAttendanceModule,
  },
  {
    id: 'employee-reports',
    path: '/employee/daily-reports',
    label: '日报管理',
    description: '查询企业微信已同步的员工日报',
    icon: ClipboardList,
    requiredPermission: 'employee-reports',
    group: 'employee-management',
    component: EmployeeReportsModule,
  },
  {
    id: 'recruitment-management',
    path: '/recruitment',
    label: '招聘管理',
    description: '按岗位批量筛选与管理候选人简历',
    icon: BriefcaseBusiness,
    requiredPermission: 'recruitment-management',
    group: 'recruitment-management',
    component: RecruitmentManagementModule,
  },
  {
    id: 'finance-management',
    path: '/finance',
    label: '财务管理',
    description: '财务数据与业务流程管理',
    icon: Landmark,
    requiredPermission: 'finance-management',
    group: 'finance-management',
    component: FinanceManagementModule,
  },
  {
    id: 'meeting-records',
    path: '/meetings',
    label: '会议管理',
    description: '查看会议摘要与原始记录',
    icon: Presentation,
    requiredPermission: 'meeting-records',
    component: MeetingRecordsModule,
  },
  {
    id: 'project-management',
    path: '/projects',
    label: '项目管理',
    description: '项目计划与协作管理',
    icon: BriefcaseBusiness,
    requiredPermission: 'project-management',
    group: 'project-management',
    component: ProjectManagementModule,
  },
  {
    id: 'developer-console',
    path: '/developer',
    label: '平台管理',
    description: '管理账号、权限与平台模块',
    icon: Code2,
    requiredPermission: 'platform-administration',
    component: DeveloperConsoleModule,
  },
]

export function getVisibleModules(user: AuthenticatedUser, disabledModuleIds: readonly ModuleId[] = []): readonly PlatformModule[] {
  const disabled = new Set(disabledModuleIds)
  return platformModules.filter((module) => {
    if (disabled.has(module.id)) return false
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
