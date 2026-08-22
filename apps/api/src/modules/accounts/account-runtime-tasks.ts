import { spawn } from 'node:child_process'
import path from 'node:path'

import { AccountsService, type AccountRecord } from '../../accounts.js'

/** 进程内串行任务队列：请求只入队，外部运行时初始化不阻塞 HTTP 响应。 */
export class AccountRuntimeTasks {
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly accounts: AccountsService, private readonly projectRoot: string) {}

  enqueue(account: Pick<AccountRecord, 'id' | 'accountId' | 'permissions'>, options: { readonly transitionStatus: boolean; readonly provision: boolean }): void {
    this.queue = this.queue.catch(() => undefined).then(async () => {
      if (options.transitionStatus) await this.accounts.setStatus(account.id, 'initializing')
      try {
        await this.run('sync-account-agent-runtimes.mjs')
        if (options.provision) await this.run('provision-account-agent-runtimes.mjs', [account.accountId])
        if (options.transitionStatus && !await this.accounts.setStatus(account.id, 'active')) throw new Error('账号不存在。')
        // 完成后再同步一次，让服务管理器按最终配置启动或停止运行空间。
        await this.run('sync-account-agent-runtimes.mjs')
      } catch {
        // 普通权限更新不影响账号登录。只有新建和管理员主动重试才记录初始化失败状态。
        if (options.transitionStatus) await this.accounts.setStatus(account.id, 'initialization_failed')
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
