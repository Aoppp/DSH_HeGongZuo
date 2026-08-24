import { Download, FileSpreadsheet, LoaderCircle, RotateCcw, Send, Square, Trash2, Upload } from 'lucide-react'
import { type ChangeEvent, type DragEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'

import type { ModuleProps } from '../../../app/types'
import { shouldSubmitOnEnter } from '../../../shared/forms/submit-on-enter'
import { useWorkspaceFiles, type WorkspaceFile } from '../files/use-workspace-files'
import { useWorkAssistantSession } from '../session/use-work-assistant-session'
import { parseMarkdownTable } from './conversation'
import './work-assistant.css'

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>
    return part
  })
}

function MarkdownMessage({ text }: { readonly text: string }) {
  return <>{text.split(/\n{2,}/).map((block, blockIndex) => {
    const lines = block.split('\n').filter(Boolean)
    const table = parseMarkdownTable(lines)
    if (table) return <div className="work-assistant__table-wrap" key={blockIndex}><table><thead><tr>{table.headers.map((header, index) => <th key={index}>{renderInline(header)}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell)}</td>)}</tr>)}</tbody></table></div>
    if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line))) return <ul key={blockIndex}>{lines.map((line, lineIndex) => <li key={lineIndex}>{renderInline(line.replace(/^[-*]\s+/, ''))}</li>)}</ul>
    return <div key={blockIndex}>{lines.map((line, lineIndex) => {
      const heading = line.match(/^#{1,3}\s+(.+)$/)
      if (heading) return <strong className="work-assistant__message-heading" key={lineIndex}>{renderInline(heading[1] ?? '')}</strong>
      return <p key={lineIndex}>{renderInline(line)}</p>
    })}</div>
  })}</>
}

export function WorkAssistantModule(_props: ModuleProps) {
  const session = useWorkAssistantSession()
  const workspaceFiles = useWorkspaceFiles()
  const [draft, setDraft] = useState('')
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [clearing, setClearing] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const inputFiles = workspaceFiles.files.filter((file) => file.path.startsWith('uploads/'))
  const outputFiles = workspaceFiles.files.filter((file) => file.path.startsWith('outputs/'))

  useEffect(() => {
    if (session.workspace) void workspaceFiles.refresh()
  }, [session.settledRevision, session.workspace, workspaceFiles.refresh])

  function upload(file: File) {
    void workspaceFiles.upload(file).finally(() => { if (fileInput.current) fileInput.current.value = '' })
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) upload(file)
  }

  function dragEnter(event: DragEvent<HTMLElement>) { event.preventDefault(); dragDepth.current += 1; setDraggingFiles(true) }
  function dragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDraggingFiles(false)
  }
  function dropFile(event: DragEvent<HTMLElement>) {
    event.preventDefault(); dragDepth.current = 0; setDraggingFiles(false)
    const file = event.dataTransfer.files[0]
    if (file) upload(file)
  }

  function removeFile(file: WorkspaceFile) {
    if (window.confirm(`确定删除“${file.name}”吗？此操作无法恢复。`)) void workspaceFiles.remove(file)
  }

  async function clearConversation() {
    if (clearing) return
    setClearing(true)
    try { await session.clearConversation() } catch { /* 错误由会话控制器呈现。 */ }
    finally { setClearing(false) }
  }

  function submit() {
    const text = draft.trim()
    if (!text || session.busy) return
    setDraft('')
    void session.send(text)
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (shouldSubmitOnEnter(event)) { event.preventDefault(); submit() }
  }

  const connectionText = session.connection === 'connected' && session.workspace
    ? '工作空间已就绪'
    : session.connection === 'failed' ? '连接失败，正在重试' : '正在恢复连接'
  const initializing = !session.sessionId && session.connection !== 'failed'
  const error = session.error ?? workspaceFiles.error

  return <div className="work-assistant module-page">
    <section className="work-assistant__heading">
      <div><h1>工作助理</h1><p>上传表格或文档，在个人工作区内完成整理、归类、合并和汇总。</p></div>
      <span className={session.connection === 'connected' && session.workspace ? 'work-assistant__status' : 'work-assistant__status is-loading'}>{connectionText}</span>
    </section>
    {error && <div className="work-assistant__error">{error}</div>}
    <div className="work-assistant__layout">
      <section className="work-assistant__files panel-card">
        <header><div><h2>工作区文件</h2><p>输入区用于提交原始文件；输出区仅保留你明确要求生成的结果。</p></div></header>
        <section className={`work-assistant__zone work-assistant__zone--input${draggingFiles ? ' is-dragging' : ''}`} onDragEnter={dragEnter} onDragOver={(event) => event.preventDefault()} onDragLeave={dragLeave} onDrop={dropFile}>
          <header><div><h3>输入区</h3><p>上传需要处理的表格或文档，支持拖拽，单个文件不超过 200MB。</p></div><button className="work-assistant__upload" type="button" onClick={() => fileInput.current?.click()} disabled={workspaceFiles.uploading || initializing}><Upload size={16} />{workspaceFiles.uploading ? `正在上传${workspaceFiles.uploadProgress === null ? '' : ` ${workspaceFiles.uploadProgress}%`}` : '上传文件'}</button><input ref={fileInput} type="file" accept=".csv,.tsv,.xls,.xlsx,.doc,.docx,.md,.txt,.pdf,.rtf" onChange={selectFile} /></header>
          {draggingFiles && <div className="work-assistant__drop-hint">松开以上传到输入区</div>}
          {workspaceFiles.uploading && <div className="work-assistant__upload-progress" aria-label="上传进度"><i><b style={{ width: `${workspaceFiles.uploadProgress ?? 0}%` }} /></i><span>{workspaceFiles.uploadProgress ?? 0}%</span></div>}
          {inputFiles.length === 0 ? <div className="work-assistant__zone-empty">尚未提交输入文件。</div> : <FileList files={inputFiles} onRemove={removeFile} />}
        </section>
        <section className="work-assistant__zone work-assistant__zone--output">
          <header><div><h3>输出区</h3><p>仅显示明确要求生成、导出或保存的结果文件。</p></div></header>
          {outputFiles.length === 0 ? <div className="work-assistant__zone-empty">暂无输出文件。</div> : <FileList files={outputFiles} onRemove={removeFile} />}
        </section>
        <div className="work-assistant__quota"><span>已使用 {formatBytes(workspaceFiles.usedBytes)} / {formatBytes(workspaceFiles.quotaBytes)}</span><i><b style={{ width: `${Math.min(100, workspaceFiles.usedBytes / workspaceFiles.quotaBytes * 100)}%` }} /></i></div>
      </section>
      <section className="work-assistant__conversation panel-card">
        <header><div><h2>任务处理</h2><p>分析结果会直接回复；如需生成文件，请明确说明文件类型和内容。</p></div><button className="work-assistant__clear" type="button" onClick={() => void clearConversation()} disabled={!session.sessionId || session.busy || clearing}>{clearing ? <LoaderCircle className="spin" size={15} /> : <RotateCcw size={15} />}清空对话</button></header>
        <div className="work-assistant__messages">{initializing ? <div className="work-assistant__empty"><LoaderCircle className="spin" size={22} />正在连接工作空间…</div> : session.messages.length === 0 ? <div className="work-assistant__empty">例如：将“销售数据.xlsx”按客户汇总，或将“会议纪要.docx”整理为一份新的行动清单。</div> : session.messages.map((message) => <article className={`work-assistant__message work-assistant__message--${message.kind}`} key={message.id}>{message.kind === 'assistant' ? <MarkdownMessage text={message.text} /> : message.text}{message.state === 'running' && session.busy && <span className="work-assistant__message-progress"><LoaderCircle className="spin" size={13} />正在生成</span>}</article>)}{session.busy && <div className="work-assistant__working"><LoaderCircle className="spin" size={15} />正在处理，长时间无进展会自动停止。</div>}</div>
        <div className="work-assistant__composer"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} disabled={!session.sessionId || session.busy} placeholder="描述你希望如何整理当前工作区的文件或文档…" rows={3} />{session.busy ? <button className="work-assistant__cancel" type="button" onClick={() => void session.stop()}><Square size={16} />停止处理</button> : <button type="button" onClick={submit} disabled={!draft.trim() || !session.sessionId}><Send size={18} />发送</button>}</div>
      </section>
    </div>
  </div>
}

function FileList({ files, onRemove }: { readonly files: readonly WorkspaceFile[]; readonly onRemove: (file: WorkspaceFile) => void }) {
  return <div className="work-assistant__file-list">{files.map((file) => <article key={file.path}><FileSpreadsheet size={18} /><div><strong>{file.name}</strong><small>{formatBytes(file.size)} · {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(file.updatedAt))}</small></div><a href={`/api/work-assistant/files/download?path=${encodeURIComponent(file.path)}`} title="下载"><Download size={16} /></a><button type="button" onClick={() => onRemove(file)} title="删除"><Trash2 size={16} /></button></article>)}</div>
}
