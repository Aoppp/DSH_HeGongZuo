import type { Pool } from 'pg'
import type { ReportAnalysisReference } from './report-analysis-service.js'

export interface ReportAnalysisSnapshot { readonly id: string; readonly startDate: string; readonly endDate: string; readonly content: string; readonly reportCount: number; readonly references: readonly ReportAnalysisReference[]; readonly generatedAt: string }

export class ReportAnalysisSnapshotRepository {
  constructor(private readonly pool: Pool) {}
  private snapshot(row: { id: string | number; start_date: string | Date; end_date: string | Date; content: string; report_count: number; references: unknown; created_at: string | Date }): ReportAnalysisSnapshot {
    const date = (value: string | Date) => typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
    return { id: String(row.id), startDate: date(row.start_date), endDate: date(row.end_date), content: row.content, reportCount: row.report_count, references: Array.isArray(row.references) ? row.references as readonly ReportAnalysisReference[] : [], generatedAt: new Date(row.created_at).toISOString() }
  }
  async latest(startDate: string, endDate: string): Promise<ReportAnalysisSnapshot | null> {
    const result = await this.pool.query<{ id: string | number; start_date: string | Date; end_date: string | Date; content: string; report_count: number; references: unknown; created_at: string | Date }>('SELECT id,start_date,end_date,content,report_count,report_references AS references,created_at FROM daily_report_analysis_snapshots WHERE start_date=$1::date AND end_date=$2::date ORDER BY created_at DESC,id DESC LIMIT 1', [startDate, endDate])
    const row = result.rows[0]; if (!row) return null
    return this.snapshot(row)
  }
  async list(): Promise<readonly ReportAnalysisSnapshot[]> {
    const result = await this.pool.query<{ id: string | number; start_date: string | Date; end_date: string | Date; content: string; report_count: number; references: unknown; created_at: string | Date }>('SELECT id,start_date,end_date,content,report_count,report_references AS references,created_at FROM daily_report_analysis_snapshots ORDER BY created_at DESC,id DESC LIMIT 50')
    return result.rows.map((row) => this.snapshot(row))
  }
  async save(startDate: string, endDate: string, snapshot: Pick<ReportAnalysisSnapshot, 'content' | 'reportCount' | 'references'>, accountId: string): Promise<ReportAnalysisSnapshot> {
    const result = await this.pool.query<{ id: string | number; start_date: string | Date; end_date: string | Date; content: string; report_count: number; references: unknown; created_at: string | Date }>('INSERT INTO daily_report_analysis_snapshots (start_date,end_date,content,report_references,report_count,created_by_account_id) VALUES ($1::date,$2::date,$3,$4::jsonb,$5,$6) RETURNING id,start_date,end_date,content,report_count,report_references AS references,created_at', [startDate, endDate, snapshot.content, JSON.stringify(snapshot.references), snapshot.reportCount, accountId])
    return this.snapshot(result.rows[0]!)
  }
}
