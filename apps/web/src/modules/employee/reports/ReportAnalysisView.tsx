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

  return <section className="report-analysis">
    <header className="report-analysis__header">
      <div>
        <h2>汇总分析</h2>
        <p>围绕已选日期范围整理日报内容，结果仅在当前页面保留。</p>
      </div>
    </header>

    <article className="report-analysis__card report-analysis__card--summary">
      <div className="report-analysis__card-heading">
        <div><h3>生成日报汇总</h3><p>自动整理当前日期范围内全部日报</p></div>
        <span>{startDate} 至 {endDate}</span>
      </div>
      <div className="report-analysis__summary-footer">
        <ul aria-label="汇总内容"><li>整体进展</li><li>已完成事项</li><li>风险与问题</li><li>下一步计划</li><li>未提交情况</li></ul>
        <button type="button" className="report-analysis__button report-analysis__button--primary" disabled={busy} onClick={() => void run()}>
          {busy ? <LoaderCircle className="spin" size={15} /> : <FileSearch size={15} />}
          {busy ? '正在生成' : '生成汇总'}
        </button>
      </div>
    </article>

    <article className="report-analysis__card report-analysis__question">
      <div className="report-analysis__card-heading">
        <div><h3>智能查询</h3><p>针对当前日期范围内的日报提出具体问题</p></div>
      </div>
      <div className="report-analysis__question-form">
        <input value={question} maxLength={500} placeholder="例如：本周有哪些需要重点关注的问题？" aria-label="定向查询问题" onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void run(question) } }} />
        <button type="button" className="report-analysis__button report-analysis__button--secondary" disabled={busy || !question.trim()} onClick={() => void run(question)}>查询</button>
      </div>
      <div className="report-analysis__examples"><span>示例问题</span>{['本周有哪些客户问题？', '谁提到生产延期？', '有哪些事项尚未完成？'].map((example) => <button type="button" key={example} onClick={() => setQuestion(example)}>{example}</button>)}</div>
    </article>

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
