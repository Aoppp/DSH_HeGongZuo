import { createWriteStream } from 'node:fs'
import { lstat, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import { HttpError } from '../../http/http.js'

export const workAssistantQuotaBytes = 3 * 1024 * 1024 * 1024
export const workAssistantMaximumFileBytes = 200 * 1024 * 1024

const supportedExtensions = new Set(['csv', 'tsv', 'xls', 'xlsx', 'doc', 'docx', 'md', 'txt', 'pdf', 'rtf'])

export interface WorkspaceFile {
  readonly path: string
  readonly name: string
  readonly size: number
  readonly updatedAt: string
}

function safeFileName(value: string | undefined): string {
  let decoded = value?.trim() ?? ''
  try { decoded = decodeURIComponent(decoded) } catch { throw new HttpError(400, '文件名编码无效。') }
  const name = decoded.split(/[\\/]/).at(-1)?.replace(/[\r\n]/g, '') ?? ''
  const extension = name.split('.').at(-1)?.toLowerCase() ?? ''
  if (!name || name === '.' || name === '..' || !supportedExtensions.has(extension)) throw new HttpError(400, '仅支持常用表格与文档格式：CSV、TSV、XLS、XLSX、DOC、DOCX、MD、TXT、PDF、RTF。')
  if (Buffer.byteLength(name, 'utf8') > 180) throw new HttpError(400, '文件名过长。')
  return name
}

function safeRelativePath(value: string | null): string {
  if (!value) throw new HttpError(400, '缺少文件路径。')
  const normalized = path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\/+/, '')
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) throw new HttpError(400, '文件路径无效。')
  return normalized
}

function resolveWorkspacePath(workspacePath: string, relativePath: string): string {
  const root = path.resolve(workspacePath)
  const target = path.resolve(root, relativePath)
  if (!target.startsWith(`${root}${path.sep}`)) throw new HttpError(400, '文件路径超出个人工作区。')
  return target
}

async function directorySize(directory: string): Promise<number> {
  let total = 0
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.upload-')) continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) total += await directorySize(target)
    else if (entry.isFile()) total += (await stat(target)).size
  }
  return total
}

async function collectFiles(directory: string, prefix = ''): Promise<WorkspaceFile[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: WorkspaceFile[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.upload-')) continue
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(target, relativePath))
    else if (entry.isFile()) {
      const details = await stat(target)
      files.push({ path: relativePath, name: entry.name, size: details.size, updatedAt: details.mtime.toISOString() })
    }
  }
  return files
}

function contentLength(request: IncomingMessage): number | null {
  const value = request.headers['content-length']
  const parsed = typeof value === 'string' ? Number(value) : Array.isArray(value) ? Number(value[0]) : Number.NaN
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export class WorkAssistantWorkspaceFiles {
  constructor(private readonly projectRoot: string) {}

  workspacePath(accountId: string): string {
    if (!/^[a-z][a-z0-9]{1,31}$/.test(accountId)) throw new HttpError(400, '账号标识无效。')
    return path.join(this.projectRoot, '.runtime', 'workspaces', 'work-assistant', accountId)
  }

  async list(accountId: string): Promise<{ readonly files: readonly WorkspaceFile[]; readonly usedBytes: number; readonly quotaBytes: number }> {
    const workspace = this.workspacePath(accountId)
    await mkdir(workspace, { recursive: true })
    const files = await collectFiles(workspace)
    const usedBytes = files.reduce((total, file) => total + file.size, 0)
    return { files: files.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), usedBytes, quotaBytes: workAssistantQuotaBytes }
  }

  async upload(accountId: string, request: IncomingMessage): Promise<WorkspaceFile> {
    const name = safeFileName(typeof request.headers['x-workspace-file-name'] === 'string' ? request.headers['x-workspace-file-name'] : undefined)
    const declaredLength = contentLength(request)
    if (declaredLength !== null && declaredLength > workAssistantMaximumFileBytes) throw new HttpError(413, '单个表格文件不能超过 200MB。')
    const workspace = this.workspacePath(accountId)
    await mkdir(workspace, { recursive: true })
    const target = resolveWorkspacePath(workspace, name)
    let previousSize = 0
    try { previousSize = (await stat(target)).size } catch { /* 新文件无需扣除旧大小。 */ }
    const usedBytes = await directorySize(workspace)
    if (usedBytes - previousSize + (declaredLength ?? 0) > workAssistantQuotaBytes) throw new HttpError(413, '个人工作区空间不足，请删除不再需要的文件后再上传。')

    const temporary = path.join(workspace, `.upload-${crypto.randomUUID()}`)
    let received = 0
    const limit = async function* () {
      for await (const chunk of request) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        received += bytes.length
        if (received > workAssistantMaximumFileBytes || usedBytes - previousSize + received > workAssistantQuotaBytes) throw new HttpError(413, received > workAssistantMaximumFileBytes ? '单个表格文件不能超过 200MB。' : '个人工作区空间不足，请删除不再需要的文件后再上传。')
        yield bytes
      }
    }
    try {
      await pipeline(limit(), createWriteStream(temporary, { flags: 'wx' }))
      if (received === 0) throw new HttpError(400, '不能上传空文件。')
      await rename(temporary, target)
      const details = await stat(target)
      return { path: name, name, size: details.size, updatedAt: details.mtime.toISOString() }
    } catch (error) {
      await rm(temporary, { force: true })
      throw error
    }
  }

  async remove(accountId: string, requestedPath: string | null): Promise<void> {
    const workspace = this.workspacePath(accountId)
    const target = resolveWorkspacePath(workspace, safeRelativePath(requestedPath))
    let details
    try { details = await lstat(target) } catch { throw new HttpError(404, '文件不存在。') }
    if (!details.isFile()) throw new HttpError(400, '只能删除文件。')
    await rm(target)
  }

  async download(accountId: string, requestedPath: string | null, response: ServerResponse): Promise<void> {
    const workspace = this.workspacePath(accountId)
    const relativePath = safeRelativePath(requestedPath)
    const target = resolveWorkspacePath(workspace, relativePath)
    let details
    try { details = await lstat(target) } catch { throw new HttpError(404, '文件不存在。') }
    if (!details.isFile()) throw new HttpError(400, '只能下载文件。')
    const fileName = path.basename(relativePath)
    response.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': String(details.size),
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
    })
    await pipeline((await import('node:fs')).createReadStream(target), response)
  }
}
