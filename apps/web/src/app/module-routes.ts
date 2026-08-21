import type { ModuleId, PlatformModule } from './types'

export function normalizeModulePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

export function moduleForPath(modules: readonly PlatformModule[], pathname: string): PlatformModule | null {
  const normalizedPath = normalizeModulePath(pathname)
  return modules.find((module) => module.path === normalizedPath) ?? null
}

export function defaultModuleIdForUser(position: string, visibleModules: readonly PlatformModule[]): ModuleId {
  const preferredId: ModuleId = position === 'CEO' ? 'management-cockpit' : 'overview'
  return visibleModules.find((module) => module.id === preferredId)?.id ?? visibleModules[0]?.id ?? 'overview'
}

export function accessibleModuleForPath(allModules: readonly PlatformModule[], visibleModules: readonly PlatformModule[], pathname: string, fallbackModuleId: ModuleId): PlatformModule {
  const requested = moduleForPath(allModules, pathname)
  if (requested && visibleModules.some((module) => module.id === requested.id)) return requested
  return allModules.find((module) => module.id === fallbackModuleId) ?? allModules[0]!
}
