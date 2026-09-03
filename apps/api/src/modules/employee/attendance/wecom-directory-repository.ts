import type { Pool } from 'pg'

export interface UnlinkedEmployee {
  readonly id: string
  readonly displayName: string
}

export class WeComDirectoryRepository {
  constructor(private readonly pool: Pool) {}

  async unlinkedActiveEmployees(): Promise<readonly UnlinkedEmployee[]> {
    const result = await this.pool.query<UnlinkedEmployee>(`SELECT id, display_name AS "displayName"
      FROM employees
      WHERE status <> 'inactive' AND (wecom_user_id IS NULL OR btrim(wecom_user_id) = '')
      ORDER BY id`)
    return result.rows
  }

  async linkEmployee(employeeId: string, wecomUserId: string): Promise<boolean> {
    const result = await this.pool.query(`UPDATE employees SET wecom_user_id=$2, updated_at=now()
      WHERE id=$1 AND (wecom_user_id IS NULL OR btrim(wecom_user_id) = '')`, [employeeId, wecomUserId])
    return result.rowCount === 1
  }
}
