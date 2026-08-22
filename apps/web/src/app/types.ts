import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { PlatformManagementPermissionId } from '@hegongzuo/employee-domain'
export type AccountPermissionId = PlatformManagementPermissionId

export type ModuleId = 'management-cockpit' | 'overview' | 'employee-data' | 'employee-agent' | 'finance-management' | 'project-management' | 'developer-console'
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
