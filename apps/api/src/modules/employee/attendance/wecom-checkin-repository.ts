import type { Pool } from 'pg'

import type { WeComCheckinRecord } from './wecom-checkin-record.js'

export type CheckinSyncSource = 'history' | 'incremental' | 'manual'
export type CheckinSyncStatus = 'succeeded' | 'partial' | 'failed' | 'skipped'

export interface CheckinEmployee {
  readonly id: string
  readonly wecomUserId: string
}

export interface CheckinSyncStats {
  readonly employees: number
  readonly pulled: number
  readonly inserted: number
  readonly updated: number
  readonly unchanged: number
  readonly skipped: number
  readonly failed: number
}
export interface WeComScheduleRecord { readonly employeeId: string; readonly userId: string; readonly date: string; readonly scheduleId: string; readonly scheduleName: string | null; readonly groupId: string | null; readonly groupName: string | null; readonly rawData: Record<string, unknown>; readonly contentHash: string }

export class WeComCheckinRepository {
  constructor(private readonly pool: Pool) {}

  async employees(userId?: string): Promise<readonly CheckinEmployee[]> {
    const result = await this.pool.query<{ id: string; wecom_user_id: string }>(`SELECT id, wecom_user_id
      FROM employees WHERE wecom_user_id IS NOT NULL AND btrim(wecom_user_id) <> ''
      ${userId ? 'AND wecom_user_id=$1' : ''} ORDER BY id`, userId ? [userId] : [])
    return result.rows.map((row) => ({ id: row.id, wecomUserId: row.wecom_user_id }))
  }

  async unlinkedEmployeeCount(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM employees
      WHERE status <> 'inactive' AND (wecom_user_id IS NULL OR btrim(wecom_user_id) = '')`)
    return Number(result.rows[0]?.count ?? 0)
  }

  async checkpoint(): Promise<string | null> {
    const result = await this.pool.query<{ checkpoint_at: string | Date }>(`SELECT checkpoint_at FROM employee_wecom_checkin_sync_checkpoints WHERE name='default'`)
    const value = result.rows[0]?.checkpoint_at
    return value ? (value instanceof Date ? value : new Date(value)).toISOString() : null
  }

  async startRun(source: CheckinSyncSource, startDate: string, endDate: string, checkpointBefore: string | null): Promise<number> {
    const result = await this.pool.query<{ id: string }>(`INSERT INTO employee_wecom_checkin_sync_runs
      (source, start_date, end_date, checkpoint_before) VALUES ($1,$2,$3,$4) RETURNING id::text`, [source, startDate, endDate, checkpointBefore])
    const id = Number(result.rows[0]?.id)
    if (!Number.isSafeInteger(id)) throw new Error('打卡同步日志创建失败。')
    return id
  }

  async finishRun(id: number, status: CheckinSyncStatus, stats: CheckinSyncStats, checkpointAfter: string | null, errorMessage: string | null): Promise<void> {
    await this.pool.query(`UPDATE employee_wecom_checkin_sync_runs SET status=$2, finished_at=now(), employee_count=$3,
      pulled_count=$4, inserted_count=$5, updated_count=$6, unchanged_count=$7, skipped_count=$8, failed_count=$9,
      checkpoint_after=$10, error_message=$11 WHERE id=$1`, [id, status, stats.employees, stats.pulled, stats.inserted,
      stats.updated, stats.unchanged, stats.skipped, stats.failed, checkpointAfter, errorMessage?.slice(0, 8_000) ?? null])
  }

  async advanceCheckpoint(value: string): Promise<void> {
    await this.pool.query(`INSERT INTO employee_wecom_checkin_sync_checkpoints (name, checkpoint_at)
      VALUES ('default',$1) ON CONFLICT (name) DO UPDATE SET checkpoint_at=EXCLUDED.checkpoint_at, updated_at=now()`, [value])
  }

  async upsert(employeeId: string, record: WeComCheckinRecord): Promise<'inserted' | 'updated' | 'unchanged'> {
    const result = await this.pool.query<{ outcome: 'inserted' | 'updated' | 'unchanged' }>(`WITH existing AS MATERIALIZED (
        SELECT content_hash FROM employee_wecom_checkins WHERE wecom_record_key=$1
      ), changed AS (
        INSERT INTO employee_wecom_checkins (employee_id,wecom_user_id,wecom_record_key,checkin_time,checkin_type,exception_type,
          location_title,location_detail,notes,wifiname,wifi_mac,device_id,lat,lng,group_name,group_id,schedule_id,
          standard_checkin_time,raw_data,content_hash)
        VALUES ($2,$3,$1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20)
        ON CONFLICT (wecom_record_key) DO UPDATE SET employee_id=EXCLUDED.employee_id,wecom_user_id=EXCLUDED.wecom_user_id,
          checkin_time=EXCLUDED.checkin_time,checkin_type=EXCLUDED.checkin_type,exception_type=EXCLUDED.exception_type,
          location_title=EXCLUDED.location_title,location_detail=EXCLUDED.location_detail,notes=EXCLUDED.notes,wifiname=EXCLUDED.wifiname,
          wifi_mac=EXCLUDED.wifi_mac,device_id=EXCLUDED.device_id,lat=EXCLUDED.lat,lng=EXCLUDED.lng,group_name=EXCLUDED.group_name,
          group_id=EXCLUDED.group_id,schedule_id=EXCLUDED.schedule_id,standard_checkin_time=EXCLUDED.standard_checkin_time,
          raw_data=EXCLUDED.raw_data,content_hash=EXCLUDED.content_hash,updated_at=now()
        WHERE employee_wecom_checkins.content_hash IS DISTINCT FROM EXCLUDED.content_hash
        RETURNING id
      ) SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM existing) AND EXISTS (SELECT 1 FROM changed) THEN 'inserted'
        WHEN EXISTS (SELECT 1 FROM existing) AND EXISTS (SELECT 1 FROM changed) THEN 'updated' ELSE 'unchanged' END AS outcome`, [
      record.recordKey, employeeId, record.wecomUserId, record.checkinTime, record.checkinType, record.exceptionType,
      record.locationTitle, record.locationDetail, record.notes, record.wifiName, record.wifiMac, record.deviceId,
      record.lat, record.lng, record.groupName, record.groupId, record.scheduleId, record.standardCheckinTime,
      JSON.stringify(record.rawData), record.contentHash,
    ])
    return result.rows[0]?.outcome ?? 'unchanged'
  }

  async upsertSchedule(record: WeComScheduleRecord): Promise<void> {
    await this.pool.query(`INSERT INTO employee_wecom_schedules (employee_id,wecom_user_id,schedule_date,schedule_id,schedule_name,group_id,group_name,raw_data,content_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
      ON CONFLICT (employee_id,schedule_date) DO UPDATE SET wecom_user_id=EXCLUDED.wecom_user_id,schedule_id=EXCLUDED.schedule_id,schedule_name=EXCLUDED.schedule_name,group_id=EXCLUDED.group_id,group_name=EXCLUDED.group_name,raw_data=EXCLUDED.raw_data,content_hash=EXCLUDED.content_hash,updated_at=now()
      WHERE employee_wecom_schedules.content_hash IS DISTINCT FROM EXCLUDED.content_hash`, [record.employeeId, record.userId, record.date, record.scheduleId, record.scheduleName, record.groupId, record.groupName, JSON.stringify(record.rawData), record.contentHash])
  }
}
