import { ChevronDown, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SkeletonList } from '../../../components/Skeleton'
import { syncRequest, type SyncSource } from './data-sync-api'
import './data-sync.css'

const labels: Record<string, string> = { succeeded: '同步完成', partial: '部分失败', failed: '同步失败', running: '同步中', skipped: '已跳过', never: '暂无记录' }
const time = (value: string | null) => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '暂无'

export function DataSyncPanel() {
  const [open, setOpen] = useState(false)
  const [sources, setSources] = useState<SyncSource[] | null>(null)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const refresh = () => { void syncRequest<{ sources: SyncSource[] }>('GET', controller.signal).then((result) => { if (!controller.signal.aborted) { setSources(result.sources); setError('') } }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '读取失败') }) }
    refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [open, revision])
  async function retry() {
    setBusy(true); setError('')
    try { const result = await syncRequest<{ accepted: boolean }>('POST'); setMessage(result.accepted ? '日报同步任务已提交，状态将自动刷新。' : '已有日报同步任务等待执行。'); setRevision((value) => value + 1) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '提交失败') }
    finally { setBusy(false) }
  }
  return <section className="platform-management panel-card">
    <header className="platform-management__header"><div><h2>数据同步</h2><p>查看日报、考勤与请假审批的同步情况。</p></div><div className="platform-management__audit-actions"><button type="button" className="employee-data__secondary" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '收起' : '展开'}<ChevronDown size={15} className={open ? 'platform-management__audit-chevron platform-management__audit-chevron--open' : 'platform-management__audit-chevron'} /></button>{open && <button type="button" className="employee-data__secondary" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} />刷新</button>}</div></header>
    {open && <div className="platform-data-sync">{error && <div className="account-admin__error" role="alert">{error}</div>}{message && <p role="status">{message}</p>}{!sources ? <SkeletonList count={3} /> : sources.map((item) => <article key={item.id}><header><strong>{item.label}</strong><span className={`platform-data-sync__status platform-data-sync__status--${item.status}`}>{labels[item.status] ?? '未知状态'}</span></header><dl><div><dt>最近成功同步</dt><dd>{time(item.lastSuccessAt)}</dd></div><div><dt>最近一次执行</dt><dd>{time(item.startedAt)}</dd></div><div><dt>完成时间</dt><dd>{time(item.finishedAt)}</dd></div></dl>{item.counts && <p>读取 {item.counts.pulled} 条{item.counts.inserted !== null ? ` · 新增 ${item.counts.inserted} · 更新 ${item.counts.updated}` : ` · 写入 ${item.counts.saved ?? 0}`} · 失败 {item.counts.failed}</p>}{item.advice && <div className="platform-data-sync__advice">{item.advice}</div>}<footer>{item.id === 'daily' ? <button type="button" className="employee-data__secondary" disabled={busy || item.status === 'running'} onClick={() => void retry()}><RefreshCw size={14} />{busy ? '提交中' : '同步日报'}</button> : <small>由现有定时任务同步</small>}</footer></article>)}</div>}
  </section>
}
