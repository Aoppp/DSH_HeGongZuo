import type { Pool } from 'pg'

export type LeaveSyncSource = 'history' | 'incremental'
export interface LeaveEmployee { readonly id: string; readonly wecomUserId: string }
export interface WeComLeaveRecord { readonly spNo: string; readonly employeeId: string; readonly userId: string; readonly leaveType: string | null; readonly startTime: string; readonly endTime: string; readonly duration: number; readonly reason: string | null; readonly spStatus: number; readonly applyTime: string | null; readonly rawData: Record<string, unknown>; readonly contentHash: string }
export interface LeaveSyncStats { readonly approvals: number; readonly upserted: number; readonly skipped: number; readonly failed: number }

export class WeComLeaveRepository {
  constructor(private readonly pool: Pool) {}

  async employees(): Promise<readonly LeaveEmployee[]> {
    const result = await this.pool.query<{ id: string; wecom_user_id: string }>(`SELECT id,wecom_user_id FROM employees WHERE wecom_user_id IS NOT NULL AND btrim(wecom_user_id) <> ''`)
    return result.rows.map((row) => ({ id: row.id, wecomUserId: row.wecom_user_id }))
  }

  async checkpoint(): Promise<string | null> {
    const result = await this.pool.query<{ checkpoint_at: string | Date }>(`SELECT checkpoint_at FROM employee_wecom_leave_sync_checkpoints WHERE name='default'`)
    const value = result.rows[0]?.checkpoint_at
    return value ? (value instanceof Date ? value : new Date(value)).toISOString() : null
  }

  async startRun(source: LeaveSyncSource, startDate: string, endDate: string, checkpointBefore: string | null): Promise<number> {
    const result = await this.pool.query<{ id: string }>(`INSERT INTO employee_wecom_leave_sync_runs (source,start_date,end_date,checkpoint_before) VALUES ($1,$2,$3,$4) RETURNING id::text`, [source, startDate, endDate, checkpointBefore])
    const id = Number(result.rows[0]?.id); if (!Number.isSafeInteger(id)) throw new Error('请假同步日志创建失败。')
    return id
  }

  async finishRun(id: number, status: 'succeeded' | 'partial' | 'failed', stats: LeaveSyncStats, checkpointAfter: string | null, error: string | null): Promise<void> {
    await this.pool.query(`UPDATE employee_wecom_leave_sync_runs SET status=$2,finished_at=now(),approval_count=$3,upserted_count=$4,skipped_count=$5,failed_count=$6,checkpoint_after=$7,error_message=$8 WHERE id=$1`, [id, status, stats.approvals, stats.upserted, stats.skipped, stats.failed, checkpointAfter, error?.slice(0, 8_000) ?? null])
  }

  async advanceCheckpoint(value: string): Promise<void> {
    await this.pool.query(`INSERT INTO employee_wecom_leave_sync_checkpoints (name,checkpoint_at) VALUES ('default',$1) ON CONFLICT (name) DO UPDATE SET checkpoint_at=EXCLUDED.checkpoint_at,updated_at=now()`, [value])
  }

  async upsert(record: WeComLeaveRecord): Promise<'inserted' | 'updated' | 'unchanged'> {
    const result = await this.pool.query<{ outcome: 'inserted' | 'updated' | 'unchanged' }>(`WITH existing AS MATERIALIZED (SELECT content_hash FROM employee_wecom_leaves WHERE sp_no=$1), changed AS (
      INSERT INTO employee_wecom_leaves (sp_no,employee_id,wecom_user_id,leave_type,start_time,end_time,duration,reason,sp_status,apply_time,raw_data,content_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
      ON CONFLICT (sp_no) DO UPDATE SET employee_id=EXCLUDED.employee_id,wecom_user_id=EXCLUDED.wecom_user_id,leave_type=EXCLUDED.leave_type,start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,duration=EXCLUDED.duration,reason=EXCLUDED.reason,sp_status=EXCLUDED.sp_status,apply_time=EXCLUDED.apply_time,raw_data=EXCLUDED.raw_data,content_hash=EXCLUDED.content_hash,updated_at=now()
      WHERE employee_wecom_leaves.content_hash IS DISTINCT FROM EXCLUDED.content_hash RETURNING sp_no)
      SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM existing) AND EXISTS (SELECT 1 FROM changed) THEN 'inserted' WHEN EXISTS (SELECT 1 FROM changed) THEN 'updated' ELSE 'unchanged' END AS outcome`, [record.spNo, record.employeeId, record.userId, record.leaveType, record.startTime, record.endTime, record.duration, record.reason, record.spStatus, record.applyTime, JSON.stringify(record.rawData), record.contentHash])
    return result.rows[0]?.outcome ?? 'unchanged'
  }
}
