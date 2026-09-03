import { requiredEnvironment } from '../../../environment.js'
import type { WeComCheckinValue } from './wecom-checkin-record.js'

const wecomApi = 'https://qyapi.weixin.qq.com'

interface WeComApiResponse {
  readonly errcode?: number
  readonly errmsg?: string
  readonly access_token?: string
  readonly expires_in?: number
  readonly checkindata?: unknown
  readonly userlist?: unknown
}

export interface WeComDirectoryMember {
  readonly userId: string
  readonly name: string
}

export interface WeComCheckinClientOptions {
  readonly corpId?: string
  readonly secret?: string
  readonly fetchImpl?: typeof fetch
}

export class WeComCheckinClient {
  private readonly corpId: string
  private readonly secret: string
  private readonly fetchImpl: typeof fetch
  private token: { value: string; expiresAt: number } | null = null

  constructor(options: WeComCheckinClientOptions = {}) {
    this.corpId = options.corpId?.trim() || requiredEnvironment('HEGONGZUO_WECOM_CORP_ID')
    this.secret = options.secret?.trim() || requiredEnvironment('HEGONGZUO_WECOM_CHECKIN_SECRET')
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  private async response(url: string, init?: RequestInit): Promise<WeComApiResponse> {
    const response = await this.fetchImpl(url, init)
    if (!response.ok) throw new Error(`企业微信打卡接口请求失败（HTTP ${response.status}）。`)
    const body = await response.json() as WeComApiResponse
    if (body.errcode && body.errcode !== 0) throw new Error(`企业微信打卡接口失败：${body.errmsg ?? `errcode=${body.errcode}`}`)
    return body
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value
    const url = new URL('/cgi-bin/gettoken', wecomApi)
    url.searchParams.set('corpid', this.corpId)
    url.searchParams.set('corpsecret', this.secret)
    const body = await this.response(url.toString())
    if (!body.access_token) throw new Error('企业微信未返回 access_token。')
    const expiresIn = Math.max(60, Number(body.expires_in ?? 7_200) - 120)
    this.token = { value: body.access_token, expiresAt: Date.now() + expiresIn * 1_000 }
    return this.token.value
  }

  async checkins(userIds: readonly string[], startTime: number, endTime: number): Promise<readonly WeComCheckinValue[]> {
    if (!userIds.length) return []
    if (userIds.length > 100) throw new Error('企业微信打卡查询单批员工不能超过 100 人。')
    if (endTime <= startTime || endTime - startTime > 30 * 24 * 60 * 60) throw new Error('企业微信打卡查询时间范围必须大于 0 且不超过 30 天。')
    const url = new URL('/cgi-bin/checkin/getcheckindata', wecomApi)
    url.searchParams.set('access_token', await this.accessToken())
    const body = await this.response(url.toString(), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ opencheckindatatype: 3, starttime: startTime, endtime: endTime, useridlist: userIds }),
    })
    if (!Array.isArray(body.checkindata)) throw new Error('企业微信打卡接口未返回 checkindata 数组。')
    return body.checkindata.filter((item): item is WeComCheckinValue => !!item && typeof item === 'object')
  }

  async directoryMembers(): Promise<readonly WeComDirectoryMember[]> {
    const url = new URL('/cgi-bin/user/list', wecomApi)
    url.searchParams.set('access_token', await this.accessToken())
    url.searchParams.set('department_id', '1')
    url.searchParams.set('fetch_child', '1')
    const body = await this.response(url.toString())
    if (!Array.isArray(body.userlist)) throw new Error('企业微信通讯录接口未返回 userlist 数组。')
    return body.userlist.flatMap((value): readonly WeComDirectoryMember[] => {
      if (!value || typeof value !== 'object') return []
      const member = value as Record<string, unknown>
      const userId = typeof member.userid === 'string' ? member.userid.trim() : ''
      const name = typeof member.name === 'string' ? member.name.trim() : ''
      return userId && name ? [{ userId, name }] : []
    })
  }
}
