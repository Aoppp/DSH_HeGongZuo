// 第三方运行时没有认证中间件钩子，在 Node HTTP 边界验证实例凭证。
// 仅保护指定监听端口，覆盖 HTTP 和 WebSocket；不修改第三方包。
import { timingSafeEqual } from 'node:crypto'
import { Server } from 'node:http'

const token = process.env.HEGONGZUO_RUNTIME_TOKEN
const port = Number(process.env.HEGONGZUO_RUNTIME_PORT)
if (!token || !Number.isInteger(port)) throw new Error('运行时缺少访问凭证。')
const expected = Buffer.from(token)
const emit = Server.prototype.emit
/** @this {import('node:http').Server} @param {string} event @param {any[]} args */
function guardedEmit(event, ...args) {
  const address = this.address()
  if ((event === 'request' || event === 'upgrade') && address && typeof address !== 'string' && address.port === port) {
    const [request, response] = args
    const raw = request.headers['x-hegongzuo-runtime-token']
    const supplied = Buffer.from(typeof raw === 'string' ? raw : '')
    if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
      if (event === 'request') { response.writeHead(401); response.end() }
      else response.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      return true
    }
    if (event === 'request' && request.method === 'GET' && request.url === '/hegongzuo/api/credential-status') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      response.end(JSON.stringify({ revision: process.env.HEGONGZUO_SERVICE_CREDENTIAL_REVISION ?? 'environment' }))
      return true
    }
  }
  return Reflect.apply(emit, this, [event, ...args])
}
Server.prototype.emit = /** @type {typeof Server.prototype.emit} */ (guardedEmit)
