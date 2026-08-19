// 将历史离职档案中误存为 Excel 日期序列的离职原因还原为 YYYY-MM-DD。
import { pool } from './database.mjs'

function excelSerialDate(value) {
  if (!/^\d{4,5}(?:\.0+)?$/.test(value)) return null
  const serial = Number(value)
  if (serial < 30_000 || serial > 60_000) return null
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10)
}

try {
  const result = await pool.query("SELECT id, departure_reason FROM employees WHERE departure_reason ~ '^[0-9]{4,5}(\\.0+)?$'")
  let updated = 0
  for (const row of result.rows) {
    const normalized = excelSerialDate(row.departure_reason)
    if (!normalized) continue
    await pool.query('UPDATE employees SET departure_reason = $2, updated_at = now() WHERE id = $1', [row.id, normalized])
    updated++
  }
  console.log(`已还原 ${updated} 条离职日期序列。`)
} finally {
  await pool.end()
}
