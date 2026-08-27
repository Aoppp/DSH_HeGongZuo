import { CalendarDays, FileText, LoaderCircle, Search, Users, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { ModuleProps } from '../../../app/types'
import { MeetingMarkdown } from './MeetingMarkdown'
import { readMeetingRecord, readMeetingRecords, type MeetingRecord, type MeetingRecordListItem } from './meeting-records-api'
import './meeting-records.css'

function time(value: string) { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) }

export function MeetingRecordsModule(_props: ModuleProps) {
  const [records, setRecords] = useState<readonly MeetingRecordListItem[]>([])
  const [query, setQuery] = useState(''); const [mode, setMode] = useState(''); const [date, setDate] = useState(''); const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<MeetingRecord | null>(null); const [detailView, setDetailView] = useState<'summary' | 'transcript'>('summary'); const [detailLoading, setDetailLoading] = useState(false)
  const load = useCallback(async (signal?: AbortSignal) => { setLoading(true); setError(null); try { const result = await readMeetingRecords({ query, mode, date, page }, signal); setRecords(result.records); setTotal(result.total) } catch (reason) { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(reason instanceof Error ? reason.message : '会议记录暂时无法读取。') } finally { if (!signal?.aborted) setLoading(false) } }, [query, mode, date, page])
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => void load(controller.signal), 200); return () => { window.clearTimeout(timer); controller.abort() } }, [load])
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('record'); if (id) void openRecord(id, 'summary') }, [])
  async function openRecord(id: string, view: 'summary' | 'transcript') { setDetailView(view); setDetailLoading(true); try { const record = await readMeetingRecord(id); setDetail(record); if (view === 'summary' && !record.summary) setDetailView('transcript') } catch (reason) { setError(reason instanceof Error ? reason.message : '会议详情暂时无法读取。') } finally { setDetailLoading(false) } }
  function closeDetail() { setDetail(null); if (window.location.search) window.history.replaceState(null, '', '/meetings') }
  const pages = Math.max(1, Math.ceil(total / 10))

  return <div className="meeting-records module-page"><header className="meeting-records__heading"><div><h1>会议管理</h1><p>查看会议摘要与原始记录</p></div><span>{total} 场会议</span></header>
    <section className="meeting-records__filters"><label><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="搜索编号、标题或参会人员" /></label><select aria-label="会议模式" value={mode} onChange={(event) => { setMode(event.target.value); setPage(1) }}><option value="">全部模式</option><option value="chinese">中文</option><option value="bilingual">双语</option></select><label><CalendarDays size={15} /><input aria-label="会议日期" type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1) }} /></label></section>
    {error && <div className="meeting-records__error">{error}</div>}
    <section className="meeting-records__list">{loading ? <div className="meeting-records__empty"><LoaderCircle className="spin" size={20} />正在加载会议记录…</div> : records.length === 0 ? <div className="meeting-records__empty">暂无符合条件的会议记录</div> : records.map((record) => <article key={record.id}><div className="meeting-records__identity"><strong><span>{record.id}</span>{record.title}</strong><p><time>{time(record.startedAt)}</time><em>{record.mode === 'chinese' ? '中文' : '双语'}</em><span><Users size={14} />{record.participants.length ? record.participants.map((item) => item.name).join('、') : '未记录参会人员'}</span></p></div><div className="meeting-records__actions"><button type="button" disabled={!record.hasSummary} onClick={() => void openRecord(record.id, 'summary')}><FileText size={15} />{record.hasSummary ? '查看摘要' : '无会议摘要'}</button><button type="button" onClick={() => void openRecord(record.id, 'transcript')}><FileText size={15} />查看原文</button></div></article>)}</section>
    {pages > 1 && <nav className="meeting-records__pagination"><span>第 {page} / {pages} 页</span><div><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>上一页</button><button type="button" disabled={page === pages} onClick={() => setPage((value) => value + 1)}>下一页</button></div></nav>}
    {(detail || detailLoading) && <div className="meeting-detail" role="dialog" aria-modal="true"><button className="meeting-detail__backdrop" type="button" aria-label="关闭" onClick={closeDetail} /><section><header><div><small>{detailView === 'summary' ? '会议摘要' : '会议原文'}</small><strong>{detail?.id}　{detail?.title}</strong>{detail && <span>{time(detail.startedAt)}—{time(detail.endedAt)}</span>}</div><button type="button" onClick={closeDetail}><X size={19} /></button></header><main>{detailLoading ? <div className="meeting-records__empty"><LoaderCircle className="spin" size={20} />正在加载…</div> : detail && <MeetingMarkdown text={detailView === 'summary' ? detail.summary ?? '' : detail.transcript} />}</main></section></div>}
  </div>
}
