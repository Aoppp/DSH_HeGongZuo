export interface MeetingRecord {
  readonly id: string
  readonly title: string
  readonly mode: 'chinese' | 'bilingual'
  readonly startedAt: string
  readonly endedAt: string
  readonly summary: string | null
  readonly transcript: string
  readonly participants: readonly { readonly name: string }[]
  readonly createdAt: string
}

export interface MeetingRecordListItem extends Omit<MeetingRecord, 'summary' | 'transcript'> {
  readonly hasSummary: boolean
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...(signal ? { signal } : {}) })
  if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error ?? `会议记录加载失败（HTTP ${response.status}）。`) }
  return response.json() as Promise<T>
}

export function readMeetingRecords(input: { query: string; mode: string; date: string; page: number }, signal?: AbortSignal) {
  const search = new URLSearchParams({ query: input.query, mode: input.mode, date: input.date, page: String(input.page), pageSize: '10' })
  return request<{ records: readonly MeetingRecordListItem[]; total: number; page: number; pageSize: number }>(`/api/meeting-records?${search}`, signal)
}

export function readMeetingRecord(id: string, signal?: AbortSignal) {
  return request<{ record: MeetingRecord }>(`/api/meeting-records/${encodeURIComponent(id)}`, signal).then((result) => result.record)
}
