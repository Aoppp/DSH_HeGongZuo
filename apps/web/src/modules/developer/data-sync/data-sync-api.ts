export interface SyncSource {
  id: string; label: string; status: string; startedAt: string | null; finishedAt: string | null; lastSuccessAt: string | null; advice: string | null
  counts: { pulled: number; inserted: number | null; updated: number | null; saved: number | null; failed: number } | null
}
export async function syncRequest<T>(method: 'GET' | 'POST', signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/platform/data-sync${method === 'POST' ? '/daily' : ''}`, { method, credentials: 'same-origin', ...(signal ? { signal } : {}) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? '无法读取数据同步状态。')
  return body as T
}
