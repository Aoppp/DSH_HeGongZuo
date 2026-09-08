export interface ReportAnalysisReference { readonly id: string; readonly name: string; readonly date: string }
export interface ReportAnalysisResult { readonly id?: string; readonly startDate?: string; readonly endDate?: string; readonly content: string; readonly reportCount: number; readonly references: readonly ReportAnalysisReference[]; readonly generatedAt?: string }
export interface ReportAnalysisVersion extends ReportAnalysisResult { readonly id: string; readonly startDate: string; readonly endDate: string; readonly generatedAt: string }
export interface ReportAnalysisVersionsPage { readonly versions: readonly ReportAnalysisVersion[]; readonly total: number; readonly page: number; readonly pageSize: number; readonly totalPages: number }

export async function analyzeReports(input: { readonly startDate: string; readonly endDate: string; readonly question?: string }): Promise<ReportAnalysisResult> {
  const response = await fetch('/api/daily-reports/analysis', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  const body = await response.json().catch(() => ({})) as { error?: string } & Partial<ReportAnalysisResult>
  if (!response.ok || typeof body.content !== 'string' || typeof body.reportCount !== 'number' || !Array.isArray(body.references)) throw new Error(body.error ?? '汇总分析暂时不可用。')
  return { content: body.content, reportCount: body.reportCount, references: body.references.filter((reference): reference is ReportAnalysisReference => Boolean(reference && typeof reference.id === 'string' && typeof reference.name === 'string' && typeof reference.date === 'string')), ...(typeof body.id === 'string' ? { id: body.id } : {}), ...(typeof body.startDate === 'string' ? { startDate: body.startDate } : {}), ...(typeof body.endDate === 'string' ? { endDate: body.endDate } : {}), ...(typeof body.generatedAt === 'string' ? { generatedAt: body.generatedAt } : {}) }
}

export async function readReportAnalysisVersions(page = 1): Promise<ReportAnalysisVersionsPage> {
  const response = await fetch(`/api/daily-reports/analysis/versions?${new URLSearchParams({ page: String(page) })}`, { credentials: 'same-origin' })
  const body = await response.json().catch(() => ({})) as { versions?: readonly ReportAnalysisResult[]; total?: number; page?: number; pageSize?: number; totalPages?: number; error?: string }
  if (!response.ok || !Array.isArray(body.versions)) throw new Error(body.error ?? '报告版本读取失败。')
  return { versions: body.versions.filter((item): item is ReportAnalysisVersion => Boolean(item && typeof item.id === 'string' && typeof item.startDate === 'string' && typeof item.endDate === 'string' && typeof item.generatedAt === 'string' && typeof item.content === 'string' && typeof item.reportCount === 'number' && Array.isArray(item.references))), total: typeof body.total === 'number' ? body.total : 0, page: typeof body.page === 'number' ? body.page : page, pageSize: typeof body.pageSize === 'number' ? body.pageSize : 8, totalPages: typeof body.totalPages === 'number' ? body.totalPages : 0 }
}

export async function deleteReportAnalysisVersion(id: string): Promise<void> {
  const response = await fetch(`/api/daily-reports/analysis/versions/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' })
  const body = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(body.error ?? '汇总记录删除失败。')
}

export async function readReportAnalysisSnapshot(startDate: string, endDate: string): Promise<ReportAnalysisResult | null> {
  const response = await fetch(`/api/daily-reports/analysis?${new URLSearchParams({ startDate, endDate })}`, { credentials: 'same-origin' })
  const body = await response.json().catch(() => ({})) as { snapshot?: ReportAnalysisResult | null; error?: string }
  if (!response.ok) throw new Error(body.error ?? '汇总读取失败。')
  return body.snapshot ?? null
}
