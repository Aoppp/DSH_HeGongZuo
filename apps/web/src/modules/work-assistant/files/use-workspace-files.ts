import { useCallback, useState } from 'react'

const maximumFileBytes = 200 * 1024 * 1024

export interface WorkspaceFile {
  readonly path: string
  readonly name: string
  readonly size: number
  readonly updatedAt: string
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) })
  const body = await response.json().catch(() => ({})) as { error?: unknown } & T
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : '操作失败。')
  return body
}

function uploadRequest(file: File, onProgress: (progress: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', '/api/work-assistant/files')
    request.timeout = 5 * 60_000
    request.setRequestHeader('content-type', file.type || 'application/octet-stream')
    request.setRequestHeader('x-workspace-file-name', encodeURIComponent(file.name))
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)) }
    request.onerror = () => reject(new Error('文件上传失败，请检查网络后重试。'))
    request.ontimeout = () => reject(new Error('文件上传超时，请检查网络后重试。'))
    request.onload = () => {
      let body: { error?: unknown } = {}
      try { body = JSON.parse(request.responseText) as { error?: unknown } } catch { /* 由状态码处理。 */ }
      if (request.status < 200 || request.status >= 300) { reject(new Error(typeof body.error === 'string' ? body.error : '文件上传失败。')); return }
      resolve()
    }
    request.send(file)
  })
}

export function useWorkspaceFiles() {
  const [files, setFiles] = useState<readonly WorkspaceFile[]>([])
  const [usedBytes, setUsedBytes] = useState(0)
  const [quotaBytes, setQuotaBytes] = useState(3 * 1024 * 1024 * 1024)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await apiRequest<{ files: readonly WorkspaceFile[]; usedBytes: number; quotaBytes: number }>('/api/work-assistant/files')
      setFiles(result.files)
      setUsedBytes(result.usedBytes)
      setQuotaBytes(result.quotaBytes)
      setError(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '工作区文件加载失败。') }
  }, [])

  const upload = useCallback(async (file: File) => {
    if (file.size > maximumFileBytes) { setError('单个文件不能超过 200MB。'); return }
    setUploading(true)
    setUploadProgress(0)
    setError(null)
    try { await uploadRequest(file, setUploadProgress); await refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '文件上传失败。') }
    finally { setUploading(false); setUploadProgress(null) }
  }, [refresh])

  const remove = useCallback(async (file: WorkspaceFile) => {
    try {
      setError(null)
      await apiRequest(`/api/work-assistant/files?path=${encodeURIComponent(file.path)}`, { method: 'DELETE' })
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '文件删除失败。') }
  }, [refresh])

  return { error, files, quotaBytes, refresh, remove, upload, uploadProgress, uploading, usedBytes }
}
