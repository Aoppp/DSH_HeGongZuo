import assert from 'node:assert/strict'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import test from 'node:test'

import { handleWeComCallback } from '../dist/modules/employee/wecom/callback.js'

const corpId = 'ww-test-corp'
const token = 'callback-test-token'
const key = randomBytes(32)
const encodingAesKey = key.toString('base64').replace(/=$/, '')

function encrypt(message) {
  const randomPrefix = randomBytes(16)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(Buffer.byteLength(message))
  const plaintext = Buffer.concat([randomPrefix, length, Buffer.from(message), Buffer.from(corpId)])
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16))
  return Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64')
}

function signature(timestamp, nonce, encrypted) {
  return createHash('sha1').update([token, timestamp, nonce, encrypted].sort().join('')).digest('hex')
}

function request(method, url, body = '') {
  const stream = Readable.from(body ? [Buffer.from(body)] : [])
  stream.method = method
  stream.url = url
  return stream
}

function response() {
  return {
    status: undefined,
    headers: undefined,
    body: undefined,
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(body = '') { this.body = body },
  }
}

async function withConfig(action) {
  const previous = {
    token: process.env.HEGONGZUO_WECOM_CALLBACK_TOKEN,
    aes: process.env.HEGONGZUO_WECOM_CALLBACK_AES_KEY,
    corpId: process.env.HEGONGZUO_WECOM_CORP_ID,
  }
  process.env.HEGONGZUO_WECOM_CALLBACK_TOKEN = token
  process.env.HEGONGZUO_WECOM_CALLBACK_AES_KEY = encodingAesKey
  process.env.HEGONGZUO_WECOM_CORP_ID = corpId
  try { await action() } finally {
    for (const [name, value] of Object.entries({ HEGONGZUO_WECOM_CALLBACK_TOKEN: previous.token, HEGONGZUO_WECOM_CALLBACK_AES_KEY: previous.aes, HEGONGZUO_WECOM_CORP_ID: previous.corpId })) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

test('企业微信 GET 校验通过后返回解密挑战值', async () => {
  await withConfig(async () => {
    const timestamp = '1710000000'
    const nonce = 'nonce-1'
    const echostr = encrypt('challenge-text')
    const url = new URL(`/api/integrations/wecom/callback?msg_signature=${signature(timestamp, nonce, echostr)}&timestamp=${timestamp}&nonce=${nonce}&echostr=${encodeURIComponent(echostr)}`, 'https://hgzuo.com')
    const result = response()
    await handleWeComCallback(request('GET', url.pathname + url.search), result, url)
    assert.equal(result.status, 200)
    assert.equal(result.body, 'challenge-text')
  })
})

test('企业微信 POST 事件仅在签名和企业标识均有效时确认接收', async () => {
  await withConfig(async () => {
    const timestamp = '1710000001'
    const nonce = 'nonce-2'
    const encrypted = encrypt('<xml><Event>subscribe</Event></xml>')
    const url = new URL(`/api/integrations/wecom/callback?msg_signature=${signature(timestamp, nonce, encrypted)}&timestamp=${timestamp}&nonce=${nonce}`, 'https://hgzuo.com')
    const result = response()
    await handleWeComCallback(request('POST', url.pathname + url.search, `<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`), result, url)
    assert.equal(result.status, 200)
    assert.equal(result.body, 'success')
  })
})

test('企业微信回调拒绝伪造签名', async () => {
  await withConfig(async () => {
    const timestamp = '1710000002'
    const nonce = 'nonce-3'
    const echostr = encrypt('challenge-text')
    const url = new URL(`/api/integrations/wecom/callback?msg_signature=invalid&timestamp=${timestamp}&nonce=${nonce}&echostr=${encodeURIComponent(echostr)}`, 'https://hgzuo.com')
    await assert.rejects(handleWeComCallback(request('GET', url.pathname + url.search), response(), url), { status: 401 })
  })
})
