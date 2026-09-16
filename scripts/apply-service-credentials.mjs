// 固定能力的后台配置应用器；不接受命令、路径或密钥参数。
import { spawn } from 'node:child_process'
import { appendFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { pool } from '../apps/api/scripts/database.mjs'
import { projectRoot } from './account-agent-runtime-paths-base.mjs'

const requestPath = path.join(projectRoot, '.runtime', 'service-credential-tasks', 'apply.request')
const client = await pool.connect()
try {
  const lock = await client.query('SELECT pg_try_advisory_lock(2026091601) AS acquired')
  if (!lock.rows[0]?.acquired) throw new Error('配置任务正在执行。')
  await rm(requestPath, { force: true })
  const row = (await client.query("SELECT revision,apply_request_id,restart_requested FROM platform_service_credentials WHERE service_id='assistant' AND apply_status='pending'")).rows[0]
  if (row) {
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(projectRoot, 'scripts/sync-account-agent-runtimes.mjs')], { cwd: projectRoot, env: process.env, stdio: 'ignore' })
        const timeout = setTimeout(() => { child.kill(); reject(new Error('配置同步超时。')) }, 120_000)
        child.once('error', () => { clearTimeout(timeout); reject(new Error('配置同步未启动。')) })
        child.once('exit', (code) => { clearTimeout(timeout); if (code === 0) resolve(undefined); else reject(new Error('配置同步失败。')) })
      })
      // 持锁确认操作版本，旧任务不能重新连接或覆盖新配置的状态。
      await client.query('BEGIN')
      await client.query("SELECT pg_advisory_xact_lock(hashtext('platform-service-credential:assistant'))")
      const current = (await client.query("SELECT apply_request_id FROM platform_service_credentials WHERE service_id='assistant' FOR UPDATE")).rows[0]
      if (current?.apply_request_id === row.apply_request_id) {
        if (row.restart_requested) {
          const definitions = /** @type {{runtimeId:string}[]} */ (JSON.parse(await readFile(path.join(projectRoot, '.runtime/agent-runtimes.json'), 'utf8')))
          if (!Array.isArray(definitions) || definitions.some((entry) => !/^[a-z][a-z0-9-]{1,62}--[a-z][a-z0-9]{1,31}$/.test(entry.runtimeId))) throw new Error('配置清单无效。')
          if (definitions.length) await appendFile(path.join(projectRoot, '.runtime/agent-restart-request'), definitions.map((entry) => entry.runtimeId).join('\n') + '\n', { mode: 0o600 })
        }
        await client.query("UPDATE platform_service_credentials SET apply_status='succeeded',applied_at=now(),restart_requested=false WHERE service_id='assistant' AND apply_request_id=$1", [row.apply_request_id])
      }
      await client.query('COMMIT')
      console.log('服务凭证同步完成。')
    } catch {
      await client.query('ROLLBACK')
      await client.query("UPDATE platform_service_credentials SET apply_status='failed' WHERE service_id='assistant' AND apply_request_id=$1", [row.apply_request_id])
      throw new Error('服务凭证同步失败，请在平台中重新同步。')
    }
  }
} catch {
  console.error('服务凭证任务未完成，请检查任务状态与服务日志。')
  process.exitCode = 1
} finally {
  await client.query('SELECT pg_advisory_unlock(2026091601)').catch(() => undefined)
  client.release(); await pool.end()
}
