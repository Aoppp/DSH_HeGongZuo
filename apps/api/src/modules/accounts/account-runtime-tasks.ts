import { spawn } from 'node:child_process'
import path from 'node:path'

import { AccountsService, type AccountRecord } from '../../accounts.js'

/** 进程内串行任务队列：请求只入队，外部运行时初始化不阻塞 HTTP 响应。 */
export class AccountRuntimeTasks {
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly accounts: AccountsService, private readonly projectRoot: string) {}

  enqueue(account: Pick<AccountRecord, 'id' | 'accountId' | 'permissions'>, options: { readonly transitionStatus: boolean; readonly provision: boolean }): void {
    this.enqueueTask(async () => {
      if (options.transitionStatus) await this.accounts.setStatus(account.id, 'initializing')
      try {
        await this.run('sync-account-agent-runtimes.mjs')
        if (options.provision) await this.run('provision-account-agent-runtimes.mjs', [account.accountId])
        if (options.transitionStatus && !await this.accounts.setStatus(account.id, 'active')) throw new Error('账号不存在。')
        // 完成后再同步一次，让服务管理器按最终配置启动或停止运行空间。
        await this.run('sync-account-agent-runtimes.mjs')
      } catch (error) {
        // 普通权限更新不影响账号登录。只有新建和管理员主动重试才记录初始化失败状态。
        if (options.transitionStatus) await this.accounts.setStatus(account.id, 'initialization_failed')
        try { await this.run('sync-account-agent-runtimes.mjs') } catch { /* 保留失败状态，供管理员重试。 */ }
        console.error(`[和工作] 账号 ${account.accountId} 的运行空间初始化失败：`, error)
      }
    })
  }

  /**
   * API 重启时恢复未完成的账号初始化。运行空间任务原先只存在于进程内队列中，
   * 因此重启恰好发生在创建账号期间时，账号会一直没有对应运行空间。
   */
  recoverPending(): void {
    this.enqueueTask(async () => {
      const pendingAccounts = (await this.accounts.list())
        .filter((account) => account.status === 'initializing' || account.status === 'initialization_failed')
      for (const account of pendingAccounts) {
        await this.prepare(account)
      }
    })
  }

  /** 删除账号或移除全部 Agent 权限后，立即重建运行时定义并通知服务同步器停止旧实例。 */
  synchronize(): void {
    this.enqueueTask(async () => {
      try {
        await this.run('sync-account-agent-runtimes.mjs')
      } catch (error) {
        // 定时协调器会继续兜底；记录错误便于服务器日志告警定位。
        console.error('[和工作] 账号运行空间同步失败：', error)
      }
    })
  }

  private enqueueTask(task: () => Promise<void>): void {
    this.queue = this.queue.catch(() => undefined).then(task)
  }

  private async prepare(account: AccountRecord): Promise<void> {
    await this.accounts.setStatus(account.id, 'initializing')
    try {
      // 同步器从所有能力包清单和账号权限生成定义；这里不再把员工查询作为特例。
      await this.run('sync-account-agent-runtimes.mjs')
      await this.run('provision-account-agent-runtimes.mjs', [account.accountId])
      if (!await this.accounts.setStatus(account.id, 'active')) throw new Error('账号不存在。')
      await this.run('sync-account-agent-runtimes.mjs')
    } catch (error) {
      await this.accounts.setStatus(account.id, 'initialization_failed')
      try { await this.run('sync-account-agent-runtimes.mjs') } catch { /* 保留待恢复状态。 */ }
      console.error(`[和工作] 恢复账号 ${account.accountId} 的运行空间失败：`, error)
    }
  }

  private run(script: string, args: readonly string[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(this.projectRoot, 'scripts', script), ...args], { cwd: this.projectRoot, env: process.env, stdio: 'inherit' })
      child.once('error', reject)
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`账号初始化脚本执行失败（code=${String(code)}）`)))
    })
  }
}
