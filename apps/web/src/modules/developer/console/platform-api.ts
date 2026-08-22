import type { ModuleId } from '../../../app/types'

export interface PlatformModuleStatus {
  readonly id: Exclude<ModuleId, 'overview' | 'developer-console'>
  readonly label: string
  readonly enabled: boolean
  readonly updatedAt: string | null
  readonly updatedBy: string | null
}

export interface PlatformStatus {
  readonly database: 'available'
  readonly agentRuntimes: { readonly expected: number; readonly available: number; readonly unavailable: readonly string[] }
  readonly modules: readonly PlatformModuleStatus[]
  readonly auditLogs: readonly { readonly id: string; readonly action: string; readonly targetType: string; readonly targetId: string; readonly detail: unknown; readonly createdAt: string; readonly actorName: string | null }[]
}

interface ErrorResponse { readonly error?: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as ErrorResponse
    throw new Error(payload.error ?? `平台请求失败（HTTP ${response.status}）。`)
  }
  return response.json() as Promise<T>
}

export function readPlatformStatus(): Promise<PlatformStatus> {
  return request<PlatformStatus>('/api/platform/status')
}

export function setPlatformModuleEnabled(moduleId: PlatformModuleStatus['id'], enabled: boolean): Promise<PlatformStatus> {
  return request<PlatformStatus>(`/api/platform/modules/${encodeURIComponent(moduleId)}`, { method: 'PATCH', body: JSON.stringify({ enabled }) })
}
