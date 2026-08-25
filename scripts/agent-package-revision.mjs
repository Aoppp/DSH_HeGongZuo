import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

/** @param {string} root @param {string} directory @param {import('node:crypto').Hash} hash */
async function appendDirectoryToHash(root, directory, hash) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) await appendDirectoryToHash(root, target, hash)
    else if (entry.isFile()) {
      hash.update(path.relative(root, target))
      hash.update(await readFile(target))
    }
  }
}

/** Agent 进程和初始化器共享同一版本算法，避免能力包安装完成前启动基础运行时。 @param {string} pluginDirectory */
export async function agentPackageRevision(pluginDirectory) {
  const hash = createHash('sha256')
  for (const entry of ['package.json', 'cordis.patch.yml', 'dist']) {
    const target = path.join(pluginDirectory, entry)
    if (entry === 'dist') await appendDirectoryToHash(pluginDirectory, target, hash)
    else { hash.update(entry); hash.update(await readFile(target)) }
  }
  return hash.digest('hex')
}

/** @param {string} revisionPath @param {string} expectedRevision @param {{ attempts?: number, retryDelayMs?: number }} [options] */
export async function waitForProvisionedPackage(revisionPath, expectedRevision, options = {}) {
  const attempts = options.attempts ?? 120
  const retryDelayMs = options.retryDelayMs ?? 500
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if ((await readFile(revisionPath, 'utf8')).trim() === expectedRevision) return
    } catch { /* 初始化器尚未发布能力包版本。 */ }
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
  }
  throw new Error('Agent 能力包未在规定时间内完成安装。')
}
