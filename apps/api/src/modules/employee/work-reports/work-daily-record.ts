import { createHash } from 'node:crypto'

export interface WorkDailyAttachment {
  readonly name: string
  readonly url: string
  readonly type: string | null
  readonly extension: string | null
  readonly size: number | null
  readonly documentType: number | null
}

export interface WorkDailyReport {
  readonly recordId: string
  readonly authorUserId: string | null
  readonly authorName: string
  readonly departmentId: string | null
  readonly departmentName: string | null
  readonly submittedAt: string
  readonly reportDate: string
  readonly todaySummary: string | null
  readonly tomorrowPlan: string | null
  readonly otherItems: string | null
  readonly attachments: readonly WorkDailyAttachment[]
  readonly wecomCreatedAt: string
  readonly wecomUpdatedAt: string
  readonly rawValues: Readonly<Record<string, unknown>>
  readonly contentHash: string
}

export interface WeComSmartSheetPage {
  readonly records: readonly unknown[]
  readonly hasMore: boolean
  readonly nextCursor: string | null
  readonly total: number | null
}

export class WorkDailyRecordError extends Error {}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorkDailyRecordError(`${label}格式无效。`)
  return value as Record<string, unknown>
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text || null
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new WorkDailyRecordError(`${label}缺失。`)
  const text = value.trim()
  const chinaTime = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(text)
  const normalized = chinaTime ? `${chinaTime[1]}T${chinaTime[2]}+08:00` : text
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) || Number.isNaN(Date.parse(normalized))) throw new WorkDailyRecordError(`${label}格式无效。`)
  return new Date(normalized).toISOString()
}

function reportDate(value: unknown): string {
  if (typeof value !== 'string') throw new WorkDailyRecordError('汇报日期缺失。')
  const date = value.trim().slice(0, 10)
  const parsed = new Date(`${date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new WorkDailyRecordError('汇报日期格式无效。')
  return date
}

function firstObject(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value) || !value[0] || typeof value[0] !== 'object' || Array.isArray(value[0])) return null
  return value[0] as Record<string, unknown>
}

function richText(value: unknown): string | null {
  if (!Array.isArray(value)) return optionalText(value)
  const text = value.map((part) => part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string'
    ? String((part as Record<string, unknown>).text)
    : '').join('').trim()
  return text || null
}

function attachment(value: unknown): WorkDailyAttachment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  const name = optionalText(item.name)
  const url = optionalText(item.fileUrl)
  if (!name || !url) return null
  return {
    name,
    url,
    type: optionalText(item.fileType),
    extension: optionalText(item.fileExt),
    size: typeof item.size === 'number' && Number.isFinite(item.size) && item.size >= 0 ? item.size : null,
    documentType: typeof item.docType === 'number' && Number.isFinite(item.docType) ? item.docType : null,
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export function parseWeComSmartSheetPage(value: unknown): WeComSmartSheetPage {
  const page = object(value, '企业微信分页响应')
  if (page.errcode !== 0) throw new WorkDailyRecordError(`企业微信读取失败：${typeof page.errmsg === 'string' ? page.errmsg : `errcode=${String(page.errcode)}`}`)
  if (!Array.isArray(page.records)) throw new WorkDailyRecordError('企业微信响应缺少 records。')
  return {
    records: page.records,
    hasMore: page.has_more === true,
    nextCursor: optionalText(page.next_cursor),
    total: typeof page.total === 'number' && Number.isSafeInteger(page.total) ? page.total : null,
  }
}

export function parseWeComWorkDailyRecord(value: unknown): WorkDailyReport {
  const record = object(value, '日报记录')
  const recordId = optionalText(record.record_id)
  if (!recordId || recordId.length > 160) throw new WorkDailyRecordError('record_id 缺失或过长。')
  const values = object(record.values, '日报字段')
  const author = firstObject(values['填写人'])
  const department = firstObject(values['所在部门'])
  const authorName = optionalText(author?.userName) ?? optionalText(record.creator_name)
  if (!authorName) throw new WorkDailyRecordError(`日报 ${recordId} 缺少填写人。`)
  const createdAt = timestamp(record.create_time, '企业微信创建时间')
  const updatedAt = timestamp(record.update_time ?? record.create_time, '企业微信更新时间')
  const normalized = {
    recordId,
    authorUserId: optionalText(author?.userId),
    authorName,
    departmentId: optionalText(department?.id),
    departmentName: optionalText(department?.text),
    submittedAt: timestamp(values['填写时间'] ?? record.create_time, '填写时间'),
    reportDate: reportDate(values['汇报日期']),
    todaySummary: richText(values['今日工作总结']),
    tomorrowPlan: richText(values['明日工作计划']),
    otherItems: richText(values['其他事项']),
    attachments: Array.isArray(values['附件']) ? values['附件'].map(attachment).filter((item): item is WorkDailyAttachment => item !== null) : [],
    wecomCreatedAt: createdAt,
    wecomUpdatedAt: updatedAt,
    rawValues: values,
  }
  return { ...normalized, contentHash: createHash('sha256').update(canonical(normalized)).digest('hex') }
}
