export interface ReportAnalysisResult { readonly content: string; readonly reportCount: number }

export async function analyzeReports(input: { readonly startDate: string; readonly endDate: string; readonly question?: string }): Promise<ReportAnalysisResult> {
  const response = await fetch('/api/daily-reports/analysis', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  const body = await response.json().catch(() => ({})) as { error?: string } & Partial<ReportAnalysisResult>
  if (!response.ok || typeof body.content !== 'string' || typeof body.reportCount !== 'number') throw new Error(body.error ?? '汇总分析暂时不可用。')
  return { content: body.content, reportCount: body.reportCount }
}
