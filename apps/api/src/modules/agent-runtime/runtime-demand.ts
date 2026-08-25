import { appendFile, mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const runtimeIdPattern = /^[a-z][a-z0-9-]{1,62}--[a-z][a-z0-9]{1,31}$/

export interface RuntimeDemandOptions {
  readonly idleTimeoutMs?: number
  readonly activationAttempts?: number
  readonly activationRetryMs?: number
  readonly activityWriteIntervalMs?: number
}

/** 管理 Agent 运行时的按需唤醒与活动续期，不接触业务会话和工作空间内容。 */
export class RuntimeDemand {
  private readonly activityDirectory: string
  private readonly activationRequestPath: string
  private readonly idleTimeoutMs: number
  private readonly activationAttempts: number
  private readonly activationRetryMs: number
  private readonly activityWriteIntervalMs: number
  private readonly lastActivityWrites = new Map<string, number>()
  private readonly pendingActivations = new Map<string, Promise<void>>()

  constructor(runtimeDirectory: string, options: RuntimeDemandOptions = {}) {
    this.activityDirectory = path.join(runtimeDirectory, 'agent-activity')
    this.activationRequestPath = path.join(runtimeDirectory, 'agent-activation-request')
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60_000
    this.activationAttempts = options.activationAttempts ?? 60
    this.activationRetryMs = options.activationRetryMs ?? 500
    this.activityWriteIntervalMs = options.activityWriteIntervalMs ?? 30_000
  }

  async touch(runtimeId: string, force = false): Promise<void> {
    this.assertRuntimeId(runtimeId)
    const now = Date.now()
    if (!force && now - (this.lastActivityWrites.get(runtimeId) ?? 0) < this.activityWriteIntervalMs) return
    await mkdir(this.activityDirectory, { recursive: true })
    await writeFile(path.join(this.activityDirectory, runtimeId), `${now}\n`, 'utf8')
    this.lastActivityWrites.set(runtimeId, now)
  }

  async recentlyActive(runtimeId: string): Promise<boolean> {
    this.assertRuntimeId(runtimeId)
    try {
      const status = await stat(path.join(this.activityDirectory, runtimeId))
      return Date.now() - status.mtimeMs <= this.idleTimeoutMs
    } catch { return false }
  }

  async ensureAvailable(runtimeId: string, ready: () => Promise<boolean>): Promise<void> {
    await this.touch(runtimeId, true)
    if (await ready()) return
    const existing = this.pendingActivations.get(runtimeId)
    if (existing) return existing
    const activation = this.activate(runtimeId, ready)
    this.pendingActivations.set(runtimeId, activation)
    try { await activation } finally {
      if (this.pendingActivations.get(runtimeId) === activation) this.pendingActivations.delete(runtimeId)
    }
  }

  private async activate(runtimeId: string, ready: () => Promise<boolean>): Promise<void> {
    for (let attempt = 0; attempt < this.activationAttempts; attempt += 1) {
      // 周期性重发可覆盖 systemd 正在消费请求文件时的极小竞态窗口。
      if (attempt % 10 === 0) await appendFile(this.activationRequestPath, `${runtimeId}\n`, 'utf8')
      if (attempt > 0 && await ready()) return
      if (attempt + 1 < this.activationAttempts) await new Promise((resolve) => setTimeout(resolve, this.activationRetryMs))
    }
    throw new Error('功能运行空间未能在规定时间内启动。')
  }

  private assertRuntimeId(runtimeId: string): void {
    if (!runtimeIdPattern.test(runtimeId)) throw new Error('运行时标识无效。')
  }
}
