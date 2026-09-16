import { timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export async function runtimeCredential(root: string, runtimeId: string): Promise<{ accountKey: string; token: string }> {
  if (!/^[a-z][a-z0-9-]{1,62}--[a-z][a-z0-9]{1,31}$/.test(runtimeId)) throw new Error('运行空间标识无效。')
  const result = JSON.parse(await readFile(path.join(root, '.runtime', 'agent-credentials', `${runtimeId}.json`), 'utf8')) as { accountKey: string; token: string }
  if (!/^[a-f0-9]{64}$/.test(result.token) || !/^[a-z][a-z0-9]{1,31}$/.test(result.accountKey)) throw new Error('运行空间凭证无效。')
  return result
}

export function credentialMatches(expected: string, supplied: string): boolean {
  const left = Buffer.from(expected), right = Buffer.from(supplied)
  return left.length === right.length && timingSafeEqual(left, right)
}
