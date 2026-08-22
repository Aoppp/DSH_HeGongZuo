// 初始平台账号种子：幂等（ON CONFLICT DO NOTHING），密码使用 scrypt 哈希。
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

import { pool } from './database.mjs'

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 32).toString('hex')
  return `scrypt$${salt}$${hash}`
}

const initialAccounts = [
  { accountId: 'taochunlin', displayName: '陶春霖', position: 'CEO' },
  { accountId: 'liuao', displayName: '刘奥', position: '开发者' },
]
const initialPassword = process.env.ACCOUNT_SEED_PASSWORD ?? 'wangshuhe123'

const client = await pool.connect()
try {
  await client.query('BEGIN')
  for (const [index, account] of initialAccounts.entries()) {
    const id = `ACC-${String(index + 1).padStart(4, '0')}`
    await client.query(
      `INSERT INTO accounts (id, account_id, display_name, position, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (account_id) DO NOTHING`,
      [id, account.accountId, account.displayName, account.position, hashPassword(initialPassword)],
    )
  }
  await client.query('COMMIT')
  console.log(`账号种子完成：${initialAccounts.map((account) => `${account.displayName}(${account.accountId})`).join('、')}。`)
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
  await pool.end()
}
