import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { PlatformManagementPermissionId } from '@hegongzuo/employee-domain'

export type RoleId = 'owner' | 'developer'
export type AccountPermissionId = PlatformManagementPermissionId

export type ModuleId = 'management-cockpit' | 'overview' | 'employee-data' | 'employee-agent' | 'finance-management' | 'project-management' | 'developer-console'
export type ModuleGroupId = 'employee-management' | 'finance-management' | 'project-management'

export interface AuthenticatedUser {
  readonly id: string
  readonly accountId: string
  readonly displayName: string
  readonly position: string
  readonly role: RoleId
  readonly permissions: readonly AccountPermissionId[]
}

export interface RoleDefinition {
  readonly id: RoleId
  readonly label: string
  readonly title: string
  readonly description: string
  readonly initials: string
}

export interface ModuleProps {
  readonly user: AuthenticatedUser
  readonly onNavigate: (moduleId: ModuleId) => void
  readonly onUserProfileUpdated?: (profile: Pick<AuthenticatedUser, 'accountId' | 'displayName' | 'position' | 'role' | 'permissions'>) => void
}

export interface PlatformModule {
  readonly id: ModuleId
  readonly label: string
  readonly description: string
  readonly icon: LucideIcon
  readonly allowedRoles: readonly RoleId[]
  readonly requiredPermission?: AccountPermissionId
  readonly group?: ModuleGroupId
  readonly bossOnly?: boolean
  readonly component: ComponentType<ModuleProps>
  readonly badge?: string
}
