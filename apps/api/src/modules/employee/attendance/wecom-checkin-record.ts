import { createHash } from 'node:crypto'

export interface WeComCheckinValue {
  readonly userid?: unknown
  readonly checkin_time?: unknown
  readonly checkin_type?: unknown
  readonly exception_type?: unknown
  readonly location_title?: unknown
  readonly location_detail?: unknown
  readonly notes?: unknown
  readonly wifiname?: unknown
  readonly wifi_mac?: unknown
  readonly deviceid?: unknown
  readonly lat?: unknown
  readonly lng?: unknown
  readonly groupname?: unknown
  readonly groupid?: unknown
  readonly schedule_id?: unknown
  readonly standard_checkin_time?: unknown
  readonly [key: string]: unknown
}

export interface WeComCheckinRecord {
  readonly wecomUserId: string
  readonly recordKey: string
  readonly checkinTime: string
  readonly checkinType: string
  readonly exceptionType: string | null
  readonly locationTitle: string | null
  readonly locationDetail: string | null
  readonly notes: string | null
  readonly wifiName: string | null
  readonly wifiMac: string | null
  readonly deviceId: string | null
  readonly lat: number | null
  readonly lng: number | null
  readonly groupName: string | null
  readonly groupId: string | null
  readonly scheduleId: string | null
  readonly standardCheckinTime: string | null
  readonly rawData: WeComCheckinValue
  readonly contentHash: string
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : null
}

function number(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function unixTime(value: unknown, field: string): string {
  const seconds = number(value)
  if (seconds === null || seconds <= 0 || !Number.isSafeInteger(seconds)) throw new Error(`企业微信打卡记录缺少有效 ${field}。`)
  return new Date(seconds * 1_000).toISOString()
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function parseWeComCheckinRecord(value: WeComCheckinValue): WeComCheckinRecord {
  const wecomUserId = string(value.userid)
  const checkinType = string(value.checkin_type)
  if (!wecomUserId || !checkinType) throw new Error('企业微信打卡记录缺少 userid 或 checkin_type。')
  const checkinTime = unixTime(value.checkin_time, 'checkin_time')
  const groupId = string(value.groupid)
  const scheduleId = string(value.schedule_id)
  const standardCheckinTime = value.standard_checkin_time ? unixTime(value.standard_checkin_time, 'standard_checkin_time') : null
  // 企业微信没有返回单独的打卡记录 ID；使用不会随异常、地点备注修订而变化的身份字段作为稳定键。
  const recordKey = hash({ wecomUserId, checkinType, checkinTime, groupId, scheduleId, standardCheckinTime })
  return {
    wecomUserId, recordKey, checkinTime, checkinType, exceptionType: string(value.exception_type),
    locationTitle: string(value.location_title), locationDetail: string(value.location_detail), notes: string(value.notes),
    wifiName: string(value.wifiname), wifiMac: string(value.wifi_mac), deviceId: string(value.deviceid),
    lat: number(value.lat), lng: number(value.lng), groupName: string(value.groupname), groupId, scheduleId, standardCheckinTime,
    rawData: value, contentHash: hash(value),
  }
}
