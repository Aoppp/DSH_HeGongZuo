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
  async function run(nextQuestion?: string) {
    setBusy(true)
    setError(null)
    try {
      const result = await analyzeReports({ startDate, endDate, ...(nextQuestion?.trim() ? { question: nextQuestion.trim() } : {}) })
      setContent(result.content)
      setCount(result.reportCount)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '汇总分析暂时不可用。')
    } finally {
      setBusy(false)
    }
  }

  return <section className="report-analysis panel-card">
    <header className="report-analysis__header">
      <div>
        <h2>汇总分析</h2>
        <p>围绕已选日期范围整理日报内容，结果仅在当前页面保留。</p>
      </div>
    </header>

    <div className="report-analysis__actions">
      <div className="report-analysis__action-copy">
        <strong>生成日报汇总</strong>
        <span>{startDate} 至 {endDate}</span>
      </div>
      <button type="button" className="report-analysis__button report-analysis__button--primary" disabled={busy} onClick={() => void run()}>
        {busy ? <LoaderCircle className="spin" size={15} /> : <FileSearch size={15} />}
        {busy ? '正在生成' : '生成汇总'}
      </button>
    </div>

    <div className="report-analysis__question">
      <div className="report-analysis__question-title">
        <strong>按问题查询</strong>
        <span>输入具体问题，可在当前日期范围内查找重点信息。</span>
      </div>
      <div className="report-analysis__question-form">
        <input value={question} maxLength={500} placeholder="例如：本周有哪些需要重点关注的问题？" aria-label="定向查询问题" onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void run(question) } }} />
        <button type="button" className="report-analysis__button report-analysis__button--secondary" disabled={busy || !question.trim()} onClick={() => void run(question)}>查询</button>
      </div>
    </div>

    {error && <div className="daily-reports__error">{error}</div>}
    {content && <article className="report-analysis__result">
      <header>
        <div><strong>{question.trim() ? '查询结果' : '日报汇总'}</strong><small>已分析 {count} 条日报 · {startDate} 至 {endDate}</small></div>
        <span>当前结果</span>
      </header>
      <MarkdownContent content={content} />
    </article>}
  </section>
}
