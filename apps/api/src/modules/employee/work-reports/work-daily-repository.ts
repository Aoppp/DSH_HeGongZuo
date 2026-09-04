import type { Pool } from 'pg'

import type { WorkDailyReport } from './work-daily-record.js'

export type WorkDailySyncSource = 'history' | 'wecom'
export type WorkDailySyncStatus = 'succeeded' | 'partial' | 'failed' | 'skipped'

export interface WorkDailySyncStats {
  readonly pulled: number
  readonly inserted: number
  readonly updated: number
  readonly unchanged: number
  readonly failed: number
}

export interface WorkDailySyncRun {
  readonly id: number
  readonly source: WorkDailySyncSource
  readonly status: 'running' | WorkDailySyncStatus
  readonly startedAt: string
  readonly finishedAt: string | null
  readonly stats: WorkDailySyncStats
}

interface WorkDailySyncRunRow {
  readonly id: string
  readonly source: WorkDailySyncSource
  readonly status: 'running' | WorkDailySyncStatus
  readonly started_at: string | Date
  readonly finished_at: string | Date | null
  readonly pulled_count: number
  readonly inserted_count: number
  readonly updated_count: number
  readonly unchanged_count: number
  readonly failed_count: number
}

function timestamp(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

export class WorkDailyRepository {
  constructor(private readonly pool: Pool) {}

  async startRun(source: WorkDailySyncSource): Promise<number> {
    const result = await this.pool.query<{ id: string }>('INSERT INTO employee_work_daily_sync_runs (source) VALUES ($1) RETURNING id::text', [source])
    const id = Number(result.rows[0]?.id)
    if (!Number.isSafeInteger(id)) throw new Error('日报同步日志创建失败。')
    return id
  }

  async finishRun(id: number, status: WorkDailySyncStatus, stats: WorkDailySyncStats, errorMessage: string | null = null): Promise<void> {
    await this.pool.query(`UPDATE employee_work_daily_sync_runs
      SET status=$2, finished_at=now(), pulled_count=$3, inserted_count=$4, updated_count=$5, unchanged_count=$6, failed_count=$7, error_message=$8
      WHERE id=$1`, [id, status, stats.pulled, stats.inserted, stats.updated, stats.unchanged, stats.failed, errorMessage?.slice(0, 8_000) ?? null])
  }

  async latestRun(): Promise<WorkDailySyncRun | null> {
    const result = await this.pool.query<WorkDailySyncRunRow>(`SELECT id::text, source, status, started_at, finished_at,
      pulled_count, inserted_count, updated_count, unchanged_count, failed_count
      FROM employee_work_daily_sync_runs ORDER BY id DESC LIMIT 1`)
    const row = result.rows[0]
    if (!row) return null
    return {
      id: Number(row.id), source: row.source, status: row.status, startedAt: timestamp(row.started_at),
      finishedAt: row.finished_at ? timestamp(row.finished_at) : null,
      stats: { pulled: row.pulled_count, inserted: row.inserted_count, updated: row.updated_count, unchanged: row.unchanged_count, failed: row.failed_count },
    }
  }

  async upsert(report: WorkDailyReport): Promise<'inserted' | 'updated' | 'unchanged'> {
    const result = await this.pool.query<{ outcome: 'inserted' | 'updated' | 'unchanged' }>(`WITH existing AS MATERIALIZED (
        SELECT content_hash FROM employee_work_daily_reports WHERE record_id=$1
      ), changed AS (
        INSERT INTO employee_work_daily_reports (
          record_id, author_user_id, author_name, department_id, department_name, submitted_at, report_date,
          today_summary, tomorrow_plan, other_items, attachments, wecom_created_at, wecom_updated_at,
          raw_values, content_hash, synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14::jsonb,$15,now())
        ON CONFLICT (record_id) DO UPDATE SET
          author_user_id=EXCLUDED.author_user_id, author_name=EXCLUDED.author_name,
          department_id=EXCLUDED.department_id, department_name=EXCLUDED.department_name,
          submitted_at=EXCLUDED.submitted_at, report_date=EXCLUDED.report_date,
          today_summary=EXCLUDED.today_summary, tomorrow_plan=EXCLUDED.tomorrow_plan, other_items=EXCLUDED.other_items,
          attachments=EXCLUDED.attachments, wecom_created_at=EXCLUDED.wecom_created_at,
          wecom_updated_at=EXCLUDED.wecom_updated_at, raw_values=EXCLUDED.raw_values,
          content_hash=EXCLUDED.content_hash, synced_at=now()
        WHERE employee_work_daily_reports.content_hash IS DISTINCT FROM EXCLUDED.content_hash
        RETURNING record_id
      )
      SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM existing) AND EXISTS (SELECT 1 FROM changed) THEN 'inserted'
        WHEN EXISTS (SELECT 1 FROM existing) AND EXISTS (SELECT 1 FROM changed) THEN 'updated'
        ELSE 'unchanged'
      END AS outcome`, [
      report.recordId, report.authorUserId, report.authorName, report.departmentId, report.departmentName,
      report.submittedAt, report.reportDate, report.todaySummary, report.tomorrowPlan, report.otherItems,
      JSON.stringify(report.attachments), report.wecomCreatedAt, report.wecomUpdatedAt,
      JSON.stringify(report.rawValues), report.contentHash,
    ])
    return result.rows[0]?.outcome ?? 'unchanged'
  }

  async linkUniqueReporters(): Promise<number> {
    const result = await this.pool.query(`WITH unique_reporters AS (
        SELECT author_name, min(author_user_id) AS user_id
        FROM employee_work_daily_reports
        WHERE author_user_id IS NOT NULL AND btrim(author_user_id) <> ''
        GROUP BY author_name
        HAVING count(DISTINCT author_user_id) = 1
      ), unique_employees AS (
        SELECT display_name, min(id) AS employee_id
        FROM employees
        GROUP BY display_name
        HAVING count(*) = 1
      )
      UPDATE employees AS employee
      SET wecom_report_user_id = reporter.user_id, updated_at = now()
      FROM unique_reporters AS reporter
      JOIN unique_employees AS matched ON matched.display_name = reporter.author_name
      WHERE employee.id = matched.employee_id
        AND employee.wecom_report_user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM employees AS occupied WHERE occupied.wecom_report_user_id = reporter.user_id
        )`)
    return result.rowCount ?? 0
  }
}
