import { constants, createWriteStream } from 'node:fs'
import { lstat, mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import { HttpError } from '../../http/http.js'
import { withWorkspaceTarget } from './safe-workspace-path.js'

export const mainAssistantQuotaBytes = 3 * 1024 * 1024 * 1024
export const workAssistantMaximumFileBytes = 200 * 1024 * 1024

const supportedExtensions = new Set(['csv', 'tsv', 'xls', 'xlsx', 'doc', 'docx', 'md', 'txt', 'pdf', 'rtf'])
const uploadDirectory = 'uploads'
const outputDirectory = 'outputs'
const internalDirectory = '.work'

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

async function directorySize(directory: string): Promise<number> {
  return withWorkspaceTarget(path.dirname(directory), `${path.basename(directory)}/.guard`, async (anchor) => {
  directory = path.dirname(anchor)
  let total = 0
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.upload-')) continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) total += await directorySize(target)
    else if (entry.isFile()) total += (await lstat(target)).size
  }
  return total
  })
}

async function collectFiles(directory: string, prefix = ''): Promise<WorkspaceFile[]> {
  return withWorkspaceTarget(path.dirname(directory), `${path.basename(directory)}/.guard`, async (anchor) => {
  directory = path.dirname(anchor)
  const entries = await readdir(directory, { withFileTypes: true })
  const files: WorkspaceFile[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.upload-')) continue
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(target, relativePath))
    else if (entry.isFile()) {
      const details = await lstat(target)
      if (!details.isFile()) continue
      files.push({ path: relativePath, name: entry.name, size: details.size, updatedAt: details.mtime.toISOString() })
    }
  }
  return files
  })
}

function isVisibleFilePath(relativePath: string): boolean {
  return relativePath === uploadDirectory
    || relativePath === outputDirectory
    || relativePath.startsWith(`${uploadDirectory}/`)
    || relativePath.startsWith(`${outputDirectory}/`)
}

function contentLength(request: IncomingMessage): number | null {
  const value = request.headers['content-length']
  const parsed = typeof value === 'string' ? Number(value) : Array.isArray(value) ? Number(value[0]) : Number.NaN
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export class AssistantWorkspaceFiles {
  constructor(private readonly projectRoot: string, private readonly agentId = 'main-assistant') {
    if (!/^[a-z][a-z0-9-]{1,62}$/.test(agentId)) throw new Error('工作区能力标识无效。')
  }

  workspacePath(accountId: string): string {
    if (!/^[a-z][a-z0-9]{1,31}$/.test(accountId)) throw new HttpError(400, '账号标识无效。')
    return path.join(this.projectRoot, '.runtime', 'agent-sandboxes', `${this.agentId}--${accountId}`, 'workspace')
  }

  private async prepareWorkspace(accountId: string): Promise<string> {
    const workspace = this.workspacePath(accountId)
    await mkdir(workspace, { recursive: true })
    for (const directory of [uploadDirectory, outputDirectory, internalDirectory]) {
      await withWorkspaceTarget(workspace, directory, async (target) => {
        await mkdir(target, { recursive: true })
        if (!(await lstat(target)).isDirectory()) throw new HttpError(400, '工作区目录无效。')
      })
    }
    return workspace
  }

  private async visibleFiles(workspace: string): Promise<WorkspaceFile[]> {
    const [uploads, outputs] = await Promise.all([
      collectFiles(path.join(workspace, uploadDirectory), uploadDirectory),
      collectFiles(path.join(workspace, outputDirectory), outputDirectory),
    ])
    return [...uploads, ...outputs]
  }

  async list(accountId: string): Promise<{ readonly files: readonly WorkspaceFile[]; readonly usedBytes: number; readonly quotaBytes: number }> {
    const workspace = await this.prepareWorkspace(accountId)
    const files = await this.visibleFiles(workspace)
    const usedBytes = files.reduce((total, file) => total + file.size, 0)
    return { files: files.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), usedBytes, quotaBytes: mainAssistantQuotaBytes }
  }

  async upload(accountId: string, request: IncomingMessage): Promise<WorkspaceFile> {
    const name = safeFileName(typeof request.headers['x-workspace-file-name'] === 'string' ? request.headers['x-workspace-file-name'] : undefined)
    const declaredLength = contentLength(request)
    if (declaredLength !== null && declaredLength > workAssistantMaximumFileBytes) throw new HttpError(413, '单个表格文件不能超过 200MB。')
    const workspace = await this.prepareWorkspace(accountId)
    return withWorkspaceTarget(workspace, `${uploadDirectory}/${name}`, async (target) => {
    let previousSize = 0
    try { previousSize = (await stat(target)).size } catch { /* 新文件无需扣除旧大小。 */ }
    const [uploadBytes, outputBytes] = await Promise.all([
      directorySize(path.join(workspace, uploadDirectory)),
      directorySize(path.join(workspace, outputDirectory)),
    ])
    const usedBytes = uploadBytes + outputBytes
    if (usedBytes - previousSize + (declaredLength ?? 0) > mainAssistantQuotaBytes) throw new HttpError(413, '个人工作区空间不足，请删除不再需要的文件后再上传。')

    return withWorkspaceTarget(workspace, `${internalDirectory}/.upload-${crypto.randomUUID()}`, async (temporary) => {
    let received = 0
    const limit = async function* () {
      for await (const chunk of request) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        received += bytes.length
        if (received > workAssistantMaximumFileBytes || usedBytes - previousSize + received > mainAssistantQuotaBytes) throw new HttpError(413, received > workAssistantMaximumFileBytes ? '单个表格文件不能超过 200MB。' : '个人工作区空间不足，请删除不再需要的文件后再上传。')
        yield bytes
      }
    }
    try {
      await pipeline(limit(), createWriteStream(temporary, { flags: 'wx' }))
      if (received === 0) throw new HttpError(400, '不能上传空文件。')
      await rename(temporary, target)
      const details = await stat(target)
      return { path: `${uploadDirectory}/${name}`, name, size: details.size, updatedAt: details.mtime.toISOString() }
    } catch (error) {
      await rm(temporary, { force: true })
      throw error
    }
    })
    })
  }

  async remove(accountId: string, requestedPath: string | null): Promise<void> {
    const workspace = this.workspacePath(accountId)
    const relativePath = safeRelativePath(requestedPath)
    if (!isVisibleFilePath(relativePath)) throw new HttpError(400, '只能删除上传文件或处理结果。')
    await withWorkspaceTarget(workspace, relativePath, async (target) => {
    let details
    try { details = await lstat(target) } catch { throw new HttpError(404, '文件不存在。') }
    if (!details.isFile()) throw new HttpError(400, '只能删除文件。')
    await rm(target)
    })
  }

  async download(accountId: string, requestedPath: string | null, response: ServerResponse): Promise<void> {
    const workspace = this.workspacePath(accountId)
    const relativePath = safeRelativePath(requestedPath)
    if (!isVisibleFilePath(relativePath)) throw new HttpError(400, '只能下载上传文件或处理结果。')
    await withWorkspaceTarget(workspace, relativePath, async (target) => {
    const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
    const details = await handle.stat()
    if (!details.isFile()) throw new HttpError(400, '只能下载文件。')
    const fileName = path.basename(relativePath)
    response.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': String(details.size),
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
    })
    await pipeline(handle.createReadStream(), response)
    } finally { await handle.close() }
    })
  }
}
