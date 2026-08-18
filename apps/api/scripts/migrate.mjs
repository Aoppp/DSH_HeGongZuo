import { readdir, readFile } from 'node:fs/promises'

import { pool } from './database.mjs'

try {
  const migrationsUrl = new URL('../migrations/', import.meta.url)
  const migrations = (await readdir(migrationsUrl)).filter((name) => name.endsWith('.sql')).sort()
  for (const migration of migrations) {
    await pool.query(await readFile(new URL(migration, migrationsUrl), 'utf8'))
    console.log(`PostgreSQL 迁移完成：${migration}`)
  }
} finally {
  await pool.end()
}
