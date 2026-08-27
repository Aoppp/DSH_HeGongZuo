export interface MeetingInput {
  readonly title: string
  readonly mode: 'chinese' | 'bilingual'
  readonly startedAt: string
  readonly endedAt: string
  readonly summary: string | null
  readonly transcript: string
  readonly participants: readonly { readonly name: string }[]
}

export class MeetingValidationError extends Error {}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) throw new MeetingValidationError(`${label}必须是包含时区的有效时间。`)
  return value
}

export function parseMeetingInput(value: unknown): MeetingInput {
  if (!value || typeof value !== 'object') throw new MeetingValidationError('请提交有效的会议记录。')
  const record = value as Record<string, unknown>
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  if (!title || title.length > 200) throw new MeetingValidationError('会议标题不能为空且不能超过 200 个字符。')
  if (record.mode !== 'chinese' && record.mode !== 'bilingual') throw new MeetingValidationError('会议模式仅支持 chinese 或 bilingual。')
  const startedAt = timestamp(record.started_at, '开始时间')
  const endedAt = timestamp(record.ended_at, '结束时间')
  if (Date.parse(endedAt) <= Date.parse(startedAt)) throw new MeetingValidationError('结束时间必须晚于开始时间。')
  const summary = record.summary === null ? null : typeof record.summary === 'string' ? record.summary : undefined
  if (summary === undefined || (summary?.length ?? 0) > 500_000) throw new MeetingValidationError('会议摘要格式无效或内容过长。')
  if (typeof record.transcript !== 'string' || !record.transcript.trim() || record.transcript.length > 6_000_000) throw new MeetingValidationError('会议原文不能为空且不能超过 600 万字符。')
  if (!Array.isArray(record.participants) || record.participants.length > 100) throw new MeetingValidationError('参会人员格式无效或人数过多。')
  const participants = record.participants.map((participant) => {
    const name = participant && typeof participant === 'object' && typeof (participant as Record<string, unknown>).name === 'string' ? String((participant as Record<string, unknown>).name).trim() : ''
    if (!name || name.length > 80) throw new MeetingValidationError('参会人员姓名不能为空且不能超过 80 个字符。')
    return { name }
  })
  return { title, mode: record.mode, startedAt, endedAt, summary, transcript: record.transcript, participants }
}
