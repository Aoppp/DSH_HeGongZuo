import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runtimeCredential } from '../../agent-runtime/credentials.js'

export async function runtimeCredentialStatus(root: string, revision: string) {
  let entries: { runtimeId: string; port: number }[]
  try { entries = JSON.parse(await readFile(path.join(root, '.runtime', 'agent-runtimes.json'), 'utf8')) } catch { throw new Error('运行配置尚未就绪。') }
  if (!Array.isArray(entries)) throw new Error('运行配置无效。')
  const states = await Promise.all(entries.map(async (entry) => {
    if (!/^[a-z][a-z0-9-]{1,62}--[a-z][a-z0-9]{1,31}$/.test(entry.runtimeId) || !Number.isInteger(entry.port) || entry.port < 1024 || entry.port > 65535) return 'unknown'
    try {
      const { token } = await runtimeCredential(root, entry.runtimeId)
      const response = await fetch(`http://127.0.0.1:${entry.port}/hegongzuo/api/credential-status`, { headers: { 'x-hegongzuo-runtime-token': token }, signal: AbortSignal.timeout(1500) })
      if (!response.ok) return 'pending'
      const body = await response.json() as { revision?: unknown }
      return body.revision === revision ? 'current' : 'pending'
    } catch (error) {
      const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : null
      return cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ECONNREFUSED' ? 'idle' : 'unknown'
    }
  }))
  return { pending: states.filter((state) => state === 'pending').length, unknown: states.filter((state) => state === 'unknown').length }
}
