import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pg from 'pg'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

try {
  process.loadEnvFile(path.join(projectRoot, '.env'))
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

if (!process.env.DATABASE_URL) {
  throw new Error('缺少 DATABASE_URL。请在项目根目录 .env 中配置 PostgreSQL 连接地址。')
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ...(process.env.DATABASE_SSL === 'require' ? { ssl: { rejectUnauthorized: false } } : {}),
})

