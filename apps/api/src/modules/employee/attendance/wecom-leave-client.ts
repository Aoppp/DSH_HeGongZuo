import { requiredEnvironment } from '../../../environment.js'

const wecomApi = 'https://qyapi.weixin.qq.com'

interface WeComResponse {
  readonly errcode?: number
  readonly errmsg?: string
  readonly access_token?: string
  readonly expires_in?: number
  readonly sp_no_list?: unknown
  readonly next_cursor?: unknown
  readonly new_next_cursor?: unknown
  readonly info?: unknown
}

export interface WeComLeaveClientOptions {
  readonly corpId?: string
  readonly secret?: string
  readonly fetchImpl?: typeof fetch
}

export class WeComLeaveClient {
  private readonly corpId: string
  private readonly secret: string
  private readonly fetchImpl: typeof fetch
  private token: { readonly value: string; readonly expiresAt: number } | null = null

  constructor(options: WeComLeaveClientOptions = {}) {
    this.corpId = options.corpId?.trim() || requiredEnvironment('HEGONGZUO_WECOM_CORP_ID')
    this.secret = options.secret?.trim() || requiredEnvironment('HEGONGZUO_WECOM_APPROVAL_SECRET')
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  private async response(url: string, init?: RequestInit): Promise<WeComResponse> {
    const response = await this.fetchImpl(url, init)
    if (!response.ok) throw new Error(`企业微信请假接口请求失败（HTTP ${response.status}）。`)
    const body = await response.json() as WeComResponse
    if (body.errcode && body.errcode !== 0) throw new Error(`企业微信请假接口失败：${body.errmsg ?? `errcode=${body.errcode}`}`)
    return body
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value
    const url = new URL('/cgi-bin/gettoken', wecomApi)
    url.searchParams.set('corpid', this.corpId); url.searchParams.set('corpsecret', this.secret)
    const body = await this.response(url.toString())
    if (!body.access_token) throw new Error('企业微信未返回 access_token。')
    this.token = { value: body.access_token, expiresAt: Date.now() + Math.max(60, Number(body.expires_in ?? 7_200) - 120) * 1_000 }
    return this.token.value
  }

  async approvalNumbers(startTime: number, endTime: number): Promise<readonly string[]> {
    const url = new URL('/cgi-bin/oa/getapprovalinfo', wecomApi)
    url.searchParams.set('access_token', await this.accessToken())
    const numbers: string[] = []
    let cursor = 0
    do {
      const body = await this.response(url.toString(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ starttime: startTime, endtime: endTime, cursor, size: 100 }) })
      const page = Array.isArray(body.sp_no_list) ? body.sp_no_list.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())) : []
      numbers.push(...page)
      const rawNext = body.next_cursor ?? body.new_next_cursor
      const next = typeof rawNext === 'number' || typeof rawNext === 'string' ? Number(rawNext) : Number.NaN
      if (!Number.isFinite(next) || next === cursor || page.length < 100) break
      cursor = next
    } while (true)
    return numbers
  }

  async approvalDetail(approvalNo: string): Promise<Record<string, unknown>> {
    const url = new URL('/cgi-bin/oa/getapprovaldetail', wecomApi)
    url.searchParams.set('access_token', await this.accessToken())
    const body = await this.response(url.toString(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sp_no: approvalNo }) })
    if (!body.info || typeof body.info !== 'object') throw new Error(`审批单 ${approvalNo} 未返回详情。`)
    return body.info as Record<string, unknown>
  }
}
