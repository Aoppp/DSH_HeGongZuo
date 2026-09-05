import type { Pool } from 'pg'
import type { ReportAnalysisReference } from './report-analysis-service.js'

export interface ReportAnalysisSnapshot { readonly content: string; readonly reportCount: number; readonly references: readonly ReportAnalysisReference[]; readonly generatedAt: string }

export class ReportAnalysisSnapshotRepository {
  constructor(private readonly pool: Pool) {}
  async latest(startDate: string, endDate: string): Promise<ReportAnalysisSnapshot | null> {
    const result = await this.pool.query<{ content: string; report_count: number; references: unknown; created_at: string | Date }>('SELECT content, report_count, references, created_at FROM daily_report_analysis_snapshots WHERE start_date=$1::date AND end_date=$2::date ORDER BY created_at DESC, id DESC LIMIT 1', [startDate, endDate])
    const row = result.rows[0]; if (!row) return null
    return { content: row.content, reportCount: row.report_count, references: Array.isArray(row.references) ? row.references as readonly ReportAnalysisReference[] : [], generatedAt: new Date(row.created_at).toISOString() }
  }
  async save(startDate: string, endDate: string, snapshot: Omit<ReportAnalysisSnapshot, 'generatedAt'>, accountId: string): Promise<ReportAnalysisSnapshot> {
    const result = await this.pool.query<{ created_at: string | Date }>('INSERT INTO daily_report_analysis_snapshots (start_date,end_date,content,references,report_count,created_by_account_id) VALUES ($1::date,$2::date,$3,$4::jsonb,$5,$6) RETURNING created_at', [startDate, endDate, snapshot.content, JSON.stringify(snapshot.references), snapshot.reportCount, accountId])
    return { ...snapshot, generatedAt: new Date(result.rows[0]!.created_at).toISOString() }
  }
}
