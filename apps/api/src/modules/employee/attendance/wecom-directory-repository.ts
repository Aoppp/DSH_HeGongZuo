import type { Pool } from 'pg'

export interface DirectoryCandidateEmployee {
  readonly id: string
  readonly displayName: string
  readonly wecomUserId: string | null
}

export class WeComDirectoryRepository {
  constructor(private readonly pool: Pool) {}

  async activeEmployees(): Promise<readonly DirectoryCandidateEmployee[]> {
    const result = await this.pool.query<DirectoryCandidateEmployee>(`SELECT id, display_name AS "displayName", wecom_user_id AS "wecomUserId"
      FROM employees
      WHERE status <> 'inactive'
      ORDER BY id`)
    return result.rows
  }

  async linkEmployee(employeeId: string, wecomUserId: string): Promise<boolean> {
    const result = await this.pool.query(`UPDATE employees SET wecom_user_id=$2, updated_at=now()
      WHERE id=$1 AND wecom_user_id IS DISTINCT FROM $2
        AND NOT EXISTS (SELECT 1 FROM employees occupied WHERE occupied.id <> $1 AND occupied.wecom_user_id=$2)`, [employeeId, wecomUserId])
    return result.rowCount === 1
  }
}
