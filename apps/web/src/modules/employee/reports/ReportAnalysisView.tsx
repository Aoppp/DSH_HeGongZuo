import { LoaderCircle, Sparkles } from 'lucide-react'
import { useState } from 'react'

import { analyzeReports } from './report-analysis-api'

export function ReportAnalysisView({ startDate, endDate }: { readonly startDate: string; readonly endDate: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(nextQuestion?: string) { setBusy(true); setError(null); try { const result = await analyzeReports({ startDate, endDate, ...(nextQuestion?.trim() ? { question: nextQuestion.trim() } : {}) }); setContent(result.content); setCount(result.reportCount) } catch (reason) { setError(reason instanceof Error ? reason.message : '汇总分析暂时不可用。') } finally { setBusy(false) } }
  return <section className="report-analysis panel-card"><header><div><h2>汇总分析</h2><p>基于所选日期范围的日报生成临时汇总，结果不会保存。</p></div><button type="button" className="employee-data__primary" disabled={busy} onClick={() => void run()}>{busy ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}生成汇总</button></header><div className="report-analysis__question"><input value={question} maxLength={500} placeholder="例如：本周有哪些需要重点关注的问题？" onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void run(question) } }} /><button type="button" disabled={busy || !question.trim()} onClick={() => void run(question)}>查询</button></div>{error && <div className="daily-reports__error">{error}</div>}{content && <article className="report-analysis__result"><small>已分析 {count} 条日报 · {startDate} 至 {endDate}</small><div>{content}</div></article>}</section>
}
