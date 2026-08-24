import type { HistoryEntry, SessionId, WorkspaceView } from '@deepseek-ai/dsh-client-connection/client'
import { Download, FileSpreadsheet, LoaderCircle, Send, Trash2, Upload } from 'lucide-react'
import { type ChangeEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ModuleProps } from '../../../app/types'
import { AccountDshApiClient, unwrapDshResponse } from '../../../shared/dsh/client'
import './work-assistant.css'

const maximumFileBytes = 200 * 1024 * 1024

interface WorkspaceFile {
  readonly path: string
  readonly name: string
  readonly size: number
  readonly updatedAt: string
}

interface AssistantMessage {
  readonly id: string
  readonly kind: 'user' | 'assistant' | 'error'
  readonly text: string
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`
}

function visibleText(content: readonly { readonly type: string; readonly text?: string }[]): string {
  return content.filter((part) => part.type === 'text' && typeof part.text === 'string').map((part) => part.text ?? '').join('\n').trim()
}

function messagesFromHistory(entries: readonly HistoryEntry[]): readonly AssistantMessage[] {
  const messages: AssistantMessage[] = []
  for (const entry of entries.map((item) => item.event).sort((left, right) => left.seq - right.seq)) {
    if (entry.type === 'user/message' && entry.data.source.kind === 'user') {
      const text = visibleText(entry.data.content)
      if (text) messages.push({ id: `user-${entry.data.id}`, kind: 'user', text })
    }
    if (entry.type === 'assistant/message') {
      const text = visibleText(entry.data.message.content)
      if (text) messages.push({ id: `assistant-${entry.data.turn}-${entry.data.step}`, kind: 'assistant', text })
    }
  }
  return messages
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init })
  const body = await response.json().catch(() => ({})) as { error?: unknown } & T
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : '操作失败。')
  return body
}

export function WorkAssistantModule(_props: ModuleProps) {
  const client = useMemo(() => new AccountDshApiClient('/api/agents/work-assistant'), [])
  const [workspace, setWorkspace] = useState<WorkspaceView | null>(null)
  const [sessionId, setSessionId] = useState<SessionId | null>(null)
  const [files, setFiles] = useState<readonly WorkspaceFile[]>([])
  const [usedBytes, setUsedBytes] = useState(0)
  const [quotaBytes, setQuotaBytes] = useState(3 * 1024 * 1024 * 1024)
  const [messages, setMessages] = useState<readonly AssistantMessage[]>([])
  const [draft, setDraft] = useState('')
  const [initializing, setInitializing] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const refreshFiles = useCallback(async () => {
    const result = await apiRequest<{ files: readonly WorkspaceFile[]; usedBytes: number; quotaBytes: number }>('/api/work-assistant/files')
    setFiles(result.files)
    setUsedBytes(result.usedBytes)
    setQuotaBytes(result.quotaBytes)
  }, [])

  const refreshHistory = useCallback(async (targetSessionId: SessionId) => {
    const history = unwrapDshResponse(await client.sessions.history({ sessionId: targetSessionId, maxMessages: 100 }))
    setMessages(messagesFromHistory(history.events))
  }, [client])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [workspaceResponse] = await Promise.all([client.workspace.list({}), refreshFiles()])
        const targetWorkspace = unwrapDshResponse(workspaceResponse).items[0]
        if (!targetWorkspace) throw new Error('工作空间正在准备，请稍后刷新。')
        const sessions = unwrapDshResponse(await client.sessions.list({}))
        const existing = sessions.items.find((item) => item.cwd === targetWorkspace.path && item.origin !== 'subagent')
        const active = existing?.sessionId ?? unwrapDshResponse(await client.sessions.create({ workspaceId: targetWorkspace.workspaceId })).sessionId
        if (cancelled) return
        setWorkspace(targetWorkspace)
        setSessionId(active)
        await refreshHistory(active)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '工作助理暂时不可用。')
      } finally {
        if (!cancelled) setInitializing(false)
      }
    })()
    return () => { cancelled = true }
  }, [client, refreshFiles, refreshHistory])

  async function upload(file: File) {
    if (file.size > maximumFileBytes) { setError('单个表格文件不能超过 200MB。'); return }
    setUploading(true)
    setError(null)
    try {
      await apiRequest('/api/work-assistant/files', { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-workspace-file-name': encodeURIComponent(file.name) }, body: file })
      await refreshFiles()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '文件上传失败。')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) void upload(file)
  }

  async function removeFile(file: WorkspaceFile) {
    if (!window.confirm(`确定删除“${file.name}”吗？此操作无法恢复。`)) return
    setError(null)
    try {
      await apiRequest(`/api/work-assistant/files?path=${encodeURIComponent(file.path)}`, { method: 'DELETE' })
      await refreshFiles()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '文件删除失败。') }
  }

  async function submit() {
    const text = draft.trim()
    if (!text || !sessionId || sending) return
    setSending(true)
    setError(null)
    setDraft('')
    try {
      unwrapDshResponse(await client.promptSession({ sessionId, mode: 'queue', content: [{ type: 'text', text }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }))
      await Promise.all([refreshHistory(sessionId), refreshFiles()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '处理任务时发生错误。')
    } finally { setSending(false) }
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
  }

  return <div className="work-assistant module-page">
    <section className="work-assistant__heading">
      <div><h1>工作助理</h1><p>上传表格或文档，在个人工作区内完成整理、归类、合并和汇总。</p></div>
      <span className={workspace ? 'work-assistant__status' : 'work-assistant__status is-loading'}>{workspace ? '工作空间已就绪' : '正在准备工作空间'}</span>
    </section>
    {error && <div className="work-assistant__error">{error}</div>}
    <div className="work-assistant__layout">
      <section className="work-assistant__files panel-card">
        <header><div><h2>工作文件</h2><p>支持表格、Word、Markdown、文本、PDF、RTF，单个文件不超过 200MB。</p></div><button className="work-assistant__upload" type="button" onClick={() => fileInput.current?.click()} disabled={uploading || initializing}><Upload size={16} />{uploading ? '正在上传' : '上传文件'}</button><input ref={fileInput} type="file" accept=".csv,.tsv,.xls,.xlsx,.doc,.docx,.md,.txt,.pdf,.rtf" onChange={selectFile} /></header>
        <div className="work-assistant__quota"><span>已使用 {formatBytes(usedBytes)} / {formatBytes(quotaBytes)}</span><i><b style={{ width: `${Math.min(100, usedBytes / quotaBytes * 100)}%` }} /></i></div>
        {files.length === 0 ? <div className="work-assistant__empty"><FileSpreadsheet size={24} />上传一个表格或文档后，告诉工作助理你希望如何处理。</div> : <div className="work-assistant__file-list">{files.map((file) => <article key={file.path}><FileSpreadsheet size={18} /><div><strong>{file.name}</strong><small>{formatBytes(file.size)} · {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(file.updatedAt))}</small></div><a href={`/api/work-assistant/files/download?path=${encodeURIComponent(file.path)}`} title="下载"><Download size={16} /></a><button type="button" onClick={() => void removeFile(file)} title="删除"><Trash2 size={16} /></button></article>)}</div>}
      </section>
      <section className="work-assistant__conversation panel-card">
        <header><div><h2>任务处理</h2><p>原始文件会保留；处理结果将生成新文件。</p></div></header>
        <div className="work-assistant__messages">{initializing ? <div className="work-assistant__empty"><LoaderCircle className="spin" size={22} />正在连接工作空间…</div> : messages.length === 0 ? <div className="work-assistant__empty">例如：将“销售数据.xlsx”按客户汇总，或将“会议纪要.docx”整理为一份新的行动清单。</div> : messages.map((message) => <article className={`work-assistant__message work-assistant__message--${message.kind}`} key={message.id}>{message.text}</article>)}{sending && <div className="work-assistant__working"><LoaderCircle className="spin" size={15} />正在处理文件…</div>}</div>
        <div className="work-assistant__composer"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} disabled={!sessionId || sending} placeholder="描述你希望如何整理当前工作区的文件或文档…" rows={3} /><button type="button" onClick={() => void submit()} disabled={!draft.trim() || !sessionId || sending}><Send size={18} />发送</button></div>
      </section>
    </div>
  </div>
}
