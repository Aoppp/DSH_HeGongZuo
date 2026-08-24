import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
/** 权限由模块和扩展能力在运行时注册，前端不维护封闭枚举。 */
export type AccountPermissionId = string

export type ModuleId = 'management-cockpit' | 'overview' | 'work-assistant' | 'employee-data' | 'employee-agent' | 'finance-management' | 'project-management' | 'developer-console'
export type ModuleGroupId = 'employee-management' | 'finance-management' | 'project-management'

export interface AuthenticatedUser {
  readonly id: string
  readonly accountId: string
  readonly displayName: string
  readonly position: string
  readonly permissions: readonly AccountPermissionId[]
}

export interface ModuleProps {
  readonly user: AuthenticatedUser
  readonly onNavigate: (moduleId: ModuleId) => void
  readonly onUserProfileUpdated?: (profile: Pick<AuthenticatedUser, 'accountId' | 'displayName' | 'position' | 'permissions'>) => void
  readonly onModuleSettingsUpdated?: (disabledModuleIds: readonly ModuleId[]) => void
}

export interface PlatformModule {
  readonly id: ModuleId
  readonly path: string
  readonly label: string
  readonly description: string
  readonly icon: LucideIcon
  readonly requiredPermission?: AccountPermissionId
  readonly group?: ModuleGroupId
  readonly bossOnly?: boolean
  readonly component: ComponentType<ModuleProps>
  readonly badge?: string
}
