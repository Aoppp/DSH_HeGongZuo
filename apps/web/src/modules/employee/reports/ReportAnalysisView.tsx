import { FileSearch, LoaderCircle } from 'lucide-react'
import { Fragment, useState, type ReactNode } from 'react'

import { analyzeReports } from './report-analysis-api'

function inline(value: string) {
  return value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>)
}

function MarkdownContent({ content }: { readonly content: string }) {
  const lines = content.replaceAll('\r\n', '\n').split('\n')
  const nodes: ReactNode[] = []
  let list: { readonly ordered: boolean; readonly values: string[] } | null = null
  const flush = () => { if (!list) return; const Tag = list.ordered ? 'ol' : 'ul'; nodes.push(<Tag key={`list-${nodes.length}`}>{list.values.map((value, index) => <li key={index}>{inline(value)}</li>)}</Tag>); list = null }
  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    const bullet = /^[-*]\s+(.+)$/.exec(line)
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line)
    if (heading) { flush(); const Tag = (`h${heading[1]!.length}` as 'h1' | 'h2' | 'h3'); nodes.push(<Tag key={`heading-${nodes.length}`}>{inline(heading[2]!)}</Tag>); continue }
    if (bullet || ordered) { const nextOrdered = Boolean(ordered); if (!list || list.ordered !== nextOrdered) { flush(); list = { ordered: nextOrdered, values: [] } } list.values.push((bullet ?? ordered)![1]!); continue }
    if (!line.trim()) { flush(); continue }
    flush(); nodes.push(<p key={`paragraph-${nodes.length}`}>{inline(line)}</p>)
  }
  flush()
  return <div className="report-analysis__markdown">{nodes}</div>
}

export function ReportAnalysisView({ startDate, endDate }: { readonly startDate: string; readonly endDate: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(nextQuestion?: string) { setBusy(true); setError(null); try { const result = await analyzeReports({ startDate, endDate, ...(nextQuestion?.trim() ? { question: nextQuestion.trim() } : {}) }); setContent(result.content); setCount(result.reportCount) } catch (reason) { setError(reason instanceof Error ? reason.message : '汇总分析暂时不可用。') } finally { setBusy(false) } }
  return <section className="report-analysis panel-card"><header><div><span className="report-analysis__eyebrow"><FileSearch size={14} />日报管理</span><h2>汇总分析</h2><p>根据当前日期范围生成临时汇总或定向查询，结果不会保存。</p></div><button type="button" className="employee-data__primary" disabled={busy} onClick={() => void run()}>{busy ? <LoaderCircle className="spin" size={15} /> : <FileSearch size={15} />}生成汇总</button></header><div className="report-analysis__question"><label><span>定向查询</span><input value={question} maxLength={500} placeholder="例如：本周有哪些需要重点关注的问题？" onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void run(question) } }} /></label><button type="button" disabled={busy || !question.trim()} onClick={() => void run(question)}>查询</button></div>{error && <div className="daily-reports__error">{error}</div>}{content && <article className="report-analysis__result"><header><div><strong>{question.trim() ? '查询结果' : '日报汇总'}</strong><small>已分析 {count} 条日报 · {startDate} 至 {endDate}</small></div><span>临时结果</span></header><MarkdownContent content={content} /></article>}</section>
}
