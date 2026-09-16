import assert from 'node:assert/strict'
import test from 'node:test'
import { AccountsService } from '../dist/accounts.js'
import { revokeAccountConnections, trackAccountConnection } from '../dist/modules/accounts/active-connections.js'

test('重置密码在同一事务内更新密码、解除锁定并撤销所有登录', async () => {
  const queries = []
  let released = false
  const client = { query: async (sql) => { queries.push(sql); return { rowCount: 1 } }, release() { released = true } }
  const accounts = new AccountsService({ connect: async () => client })
  assert.equal(await accounts.resetPassword('ACC-test'), true)
  assert.deepEqual(queries.map((sql) => sql.split(' ')[0]), ['BEGIN', 'UPDATE', 'DELETE', 'COMMIT'])
  assert.match(queries[1], /locked_until = NULL/)
  assert.match(queries[2], /DELETE FROM sessions/)
  assert.equal(released, true)
})

test('撤销登录失败时密码更新回滚', async () => {
  const queries = []
  const client = { query: async (sql) => { queries.push(sql); if (sql.startsWith('DELETE')) throw new Error('fixture failure'); return { rowCount: 1 } }, release() {} }
  await assert.rejects(new AccountsService({ connect: async () => client }).resetPassword('ACC-test'))
  assert.equal(queries.at(-1), 'ROLLBACK')
})

test('账号连接撤销只影响目标账号，已经关闭的连接不重复调用', () => {
  const closed = []
  trackAccountConnection('a', () => closed.push('a'))
  const release = trackAccountConnection('a', () => closed.push('released'))
  trackAccountConnection('b', () => closed.push('b'))
  release()
  revokeAccountConnections('a')
  revokeAccountConnections('a')
  assert.deepEqual(closed, ['a'])
  revokeAccountConnections('b')
})
