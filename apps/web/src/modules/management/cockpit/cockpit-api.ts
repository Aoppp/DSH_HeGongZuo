export interface CockpitSnapshot {
  readonly generatedAt: string
  readonly employees: {
    readonly employed: number
    readonly departed: number
    readonly probation: number
    readonly onLeave: number
    readonly departments: readonly { readonly name: string; readonly count: number }[]
  }
  readonly contracts: {
    readonly alerts: readonly {
      readonly employeeId: string
      readonly displayName: string
      readonly departmentName: string
      readonly jobTitle: string
      readonly contractEndDate: string
      readonly daysLeft: number
    }[]
    readonly expired: number
    readonly dueToday: number
    readonly upcoming: number
  }
  readonly accounts: { readonly total: number; readonly active: number; readonly disabled: number; readonly attention: number }
  readonly platform: {
    readonly database: 'available'
    readonly agentRuntimes: { readonly expected: number; readonly available: number; readonly running: number; readonly idle: number; readonly unavailable: readonly string[] }
    readonly modules: readonly { readonly id: string; readonly label: string; readonly enabled: boolean }[]
  }
  readonly recentActivity: readonly {
    readonly id: string
    readonly action: string
    readonly targetType: string
    readonly targetId: string
    readonly actorName: string | null
    readonly createdAt: string
  }[]
}

export async function readCockpitSnapshot(signal?: AbortSignal): Promise<CockpitSnapshot> {
  const response = await fetch('/api/management/cockpit', { credentials: 'same-origin', ...(signal ? { signal } : {}) })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { readonly error?: unknown }
    throw new Error(typeof body.error === 'string' ? body.error : `管理驾驶舱加载失败（HTTP ${response.status}）。`)
  }
  return response.json() as Promise<CockpitSnapshot>
}
