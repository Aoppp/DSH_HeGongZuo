import { constants } from 'node:fs'
import { lstat, open, type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { HttpError } from '../../http/http.js'

/** Linux 使用目录句柄逐级定位，阻止中间目录符号链接及检查后的目录替换。 */
export async function withWorkspaceTarget<T>(root: string, relative: string, action: (target: string) => Promise<T>): Promise<T> {
  const parts = relative.split('/').filter(Boolean)
  if (!parts.length || parts.some((part) => part === '..' || part === '.')) throw new HttpError(400, '文件路径无效。')
  const handles: FileHandle[] = []
  try {
    let directory = root
    const pinnedRoot = process.platform === 'linux' && /^\/proc\/self\/fd\/\d+$/.test(root)
    if (!pinnedRoot) {
      const rootDetails = await lstat(root)
      if (!rootDetails.isDirectory() || rootDetails.isSymbolicLink()) throw new HttpError(400, '工作区路径无效。')
    }
    for (const part of ['', ...parts.slice(0, -1)]) {
      const next = part ? path.join(directory, part) : directory
      const handle = await open(next, constants.O_RDONLY | constants.O_DIRECTORY | (!part && pinnedRoot ? 0 : constants.O_NOFOLLOW))
      handles.push(handle)
      directory = process.platform === 'linux' ? `/proc/self/fd/${handle.fd}` : next
    }
    const target = path.join(directory, parts.at(-1)!)
    const details = await lstat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (details?.isSymbolicLink()) throw new HttpError(400, '不允许访问工作区符号链接。')
    return await action(target)
  } catch (error) {
    if (error instanceof HttpError) throw error
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ELOOP' || code === 'ENOTDIR') throw new HttpError(400, '不允许访问工作区符号链接。')
    if (code === 'ENOENT') throw new HttpError(404, '文件不存在。')
    throw error
  } finally { await Promise.all(handles.map((handle) => handle.close())) }
}
