import type { Pool, PoolClient } from 'pg'

/** 已有事务连接由调用方负责提交；内部方法不得提前提交外层事务。 */
export async function inTransaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>, existing?: PoolClient): Promise<T> {
  if (existing) return operation(existing)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
}
