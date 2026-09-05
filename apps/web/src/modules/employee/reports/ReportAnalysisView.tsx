import { FileSearch, LoaderCircle } from 'lucide-react'
import { Fragment, useState, type ReactNode } from 'react'

import { analyzeReports, type ReportAnalysisReference } from './report-analysis-api'

function inline(value: string, references: readonly ReportAnalysisReference[], onOpenReport: (id: string) => void) {
  return value.split(/(\*\*[^*]+\*\*|【[^｜】]+｜\d{4}-\d{2}-\d{2}｜[^】]+】)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    const citation = /^【([^｜】]+)｜(\d{4}-\d{2}-\d{2})｜([^】]+)】$/.exec(part)
    const reference = citation && references.find((item) => item.id === citation[3] && item.name === citation[1] && item.date === citation[2])
    return reference ? <button type="button" className="report-analysis__source" key={index} onClick={() => onOpenReport(reference.id)}>【{reference.name}｜{reference.date}】</button> : <Fragment key={index}>{part}</Fragment>
  })
}

function MarkdownContent({ content, references, onOpenReport }: { readonly content: string; readonly references: readonly ReportAnalysisReference[]; readonly onOpenReport: (id: string) => void }) {
  const lines = content.replaceAll('\r\n', '\n').split('\n')
  const nodes: ReactNode[] = []
  let list: { readonly ordered: boolean; readonly values: string[] } | null = null
  const flush = () => { if (!list) return; const Tag = list.ordered ? 'ol' : 'ul'; nodes.push(<Tag key={`list-${nodes.length}`}>{list.values.map((value, index) => <li key={index}>{inline(value, references, onOpenReport)}</li>)}</Tag>); list = null }
  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    const bullet = /^[-*]\s+(.+)$/.exec(line)
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line)
    if (heading) { flush(); const Tag = (`h${heading[1]!.length}` as 'h1' | 'h2' | 'h3'); nodes.push(<Tag key={`heading-${nodes.length}`}>{inline(heading[2]!, references, onOpenReport)}</Tag>); continue }
    if (bullet || ordered) { const nextOrdered = Boolean(ordered); if (!list || list.ordered !== nextOrdered) { flush(); list = { ordered: nextOrdered, values: [] } } list.values.push((bullet ?? ordered)![1]!); continue }
    if (!line.trim()) { flush(); continue }
    flush(); nodes.push(<p key={`paragraph-${nodes.length}`}>{inline(line, references, onOpenReport)}</p>)
  }
  flush()
  return <div className="report-analysis__markdown">{nodes}</div>
}

export function ReportAnalysisView({ startDate, endDate, onOpenReport }: { readonly startDate: string; readonly endDate: string; readonly onOpenReport: (id: string) => void }) {
  const [question, setQuestion] = useState('')
  const [summary, setSummary] = useState<{ readonly content: string; readonly count: number; readonly references: readonly ReportAnalysisReference[] } | null>(null)
  const [query, setQuery] = useState<{ readonly content: string; readonly count: number; readonly question: string; readonly references: readonly ReportAnalysisReference[] } | null>(null)
  const [summaryBusy, setSummaryBusy] = useState(false)
  const [queryBusy, setQueryBusy] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  async function runSummary() {
    setSummaryBusy(true)
    setSummaryError(null)
    try {
      const result = await analyzeReports({ startDate, endDate })
      setSummary({ content: result.content, count: result.reportCount, references: result.references })
    } catch (reason) {
      setSummaryError(reason instanceof Error ? reason.message : '汇总服务暂时不可用。')
    } finally {
      setSummaryBusy(false)
    }
  }
  async function runQuery() {
    const value = question.trim()
    if (!value) return
    setQueryBusy(true)
    setQueryError(null)
    try { const result = await analyzeReports({ startDate, endDate, question: value }); setQuery({ content: result.content, count: result.reportCount, question: value, references: result.references }) }
    catch (reason) { setQueryError(reason instanceof Error ? reason.message : '查询服务暂时不可用。') }
    finally { setQueryBusy(false) }
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
        <div><h3>生成日报汇总</h3><p>按部门整理当前日期范围内的日报重点</p></div>
        <span>{startDate} 至 {endDate}</span>
      </div>
      <div className="report-analysis__summary-footer">
        <ul aria-label="汇总内容"><li>部门工作进展</li><li>已完成事项</li><li>风险与问题</li><li>下一步计划</li><li>未提交情况</li></ul>
        <button type="button" className="report-analysis__button report-analysis__button--primary" disabled={summaryBusy} onClick={() => void runSummary()}>
          {summaryBusy ? <LoaderCircle className="spin" size={15} /> : <FileSearch size={15} />}
          {summaryBusy ? '正在生成' : '生成汇总'}
        </button>
      </div>
    </article>
    {summaryError && <div className="daily-reports__error">{summaryError}</div>}
    {summary && <AnalysisResult title="部门汇总" count={summary.count} content={summary.content} references={summary.references} startDate={startDate} endDate={endDate} onOpenReport={onOpenReport} />}

    <article className="report-analysis__card report-analysis__question">
      <div className="report-analysis__card-heading">
        <div><h3>智能查询</h3><p>针对当前日期范围内的日报提出具体问题</p></div>
      </div>
      <div className="report-analysis__question-form">
        <input value={question} maxLength={500} placeholder="例如：本周有哪些需要重点关注的问题？" aria-label="定向查询问题" onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void runQuery() } }} />
        <button type="button" className="report-analysis__button report-analysis__button--secondary" disabled={queryBusy || !question.trim()} onClick={() => void runQuery()}>{queryBusy ? '正在查询' : '查询'}</button>
      </div>
      <div className="report-analysis__examples"><span>示例问题</span>{['本周有哪些客户问题？', '谁提到生产延期？', '有哪些事项尚未完成？'].map((example) => <button type="button" key={example} onClick={() => setQuestion(example)}>{example}</button>)}</div>
    </article>

    {queryError && <div className="daily-reports__error">{queryError}</div>}
    {query && <AnalysisResult title="查询结果" count={query.count} content={query.content} references={query.references} question={query.question} startDate={startDate} endDate={endDate} onOpenReport={onOpenReport} />}
  </section>
}

function AnalysisResult({ title, count, content, references, question, startDate, endDate, onOpenReport }: { readonly title: string; readonly count: number; readonly content: string; readonly references: readonly ReportAnalysisReference[]; readonly question?: string; readonly startDate: string; readonly endDate: string; readonly onOpenReport: (id: string) => void }) {
  return <article className="report-analysis__result"><header><div><strong>{title}</strong><small>{question ? `问题：${question} · ` : ''}已分析 {count} 条日报 · {startDate} 至 {endDate}</small></div><span>当前结果</span></header><MarkdownContent content={content} references={references} onOpenReport={onOpenReport} /></article>
}
