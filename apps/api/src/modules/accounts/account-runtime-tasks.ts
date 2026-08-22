import { spawn } from 'node:child_process'
import path from 'node:path'

import type { AccountPermissionId } from '../../account-permissions.js'
import { AccountsService, type AccountRecord } from '../../accounts.js'

/** 进程内串行任务队列：请求只入队，外部运行时初始化不阻塞 HTTP 响应。 */
export class AccountRuntimeTasks {
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly accounts: AccountsService, private readonly projectRoot: string) {}

  enqueue(account: Pick<AccountRecord, 'id' | 'accountId' | 'permissions'>): void {
    this.queue = this.queue.catch(() => undefined).then(async () => {
      await this.accounts.setStatus(account.id, 'initializing')
      try {
        await this.run('sync-account-agent-runtimes.mjs')
        await this.run('provision-account-agent-runtimes.mjs', [account.accountId])
        if (!await this.accounts.setStatus(account.id, 'active')) throw new Error('账号不存在。')
        // 账号回到正常状态后再同步一次，让服务管理器按最终配置启动运行空间。
        await this.run('sync-account-agent-runtimes.mjs')
      } catch {
        await this.accounts.setStatus(account.id, 'initialization_failed')
        try { await this.run('sync-account-agent-runtimes.mjs') } catch { /* 保留失败状态，供管理员重试。 */ }
      }
    })
  }

  private run(script: string, args: readonly string[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(this.projectRoot, 'scripts', script), ...args], { cwd: this.projectRoot, env: process.env, stdio: 'inherit' })
      child.once('error', reject)
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`账号初始化脚本执行失败（code=${String(code)}）`)))
    })
  }
}
