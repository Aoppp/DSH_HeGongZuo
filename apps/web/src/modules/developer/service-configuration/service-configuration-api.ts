export type ServiceId = 'assistant' | 'daily-report'
export interface ServiceConfiguration {
  readonly id: ServiceId
  readonly label: string
  readonly configured: boolean
  readonly revision: string | null
  readonly updatedAt: string | null
  readonly updatedBy: string | null
  readonly state: 'environment' | 'effective' | 'applying' | 'failed' | 'unknown' | 'waiting' | 'unavailable'
  readonly pending: number
}

export async function credentialRequest<T>(path = '', body?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/platform/service-credentials${path}`, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  })
  const payload = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(payload.error ?? '服务配置请求未完成，请稍后重试。')
  return payload
}

export const serviceStateLabels: Record<ServiceConfiguration['state'], string> = {
  environment: '使用服务器配置', effective: '已生效', applying: '生效中', failed: '同步失败', unknown: '状态待确认', waiting: '部分连接待更新',
  unavailable: '配置不可读取',
}
