import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const constraintMigrations = [
  '011_add_finance_and_project_permissions.sql',
  '013_replace_roles_with_permissions.sql',
  '016_add_employee_work_records_permission.sql',
  '017_split_attendance_and_reports_permissions.sql',
]

test('可重复执行的权限迁移兼容当前考勤和汇报权限', async () => {
  for (const migration of constraintMigrations) {
    const sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8')
    assert.match(sql, /employee-attendance/, `${migration} 缺少考勤权限`)
    assert.match(sql, /employee-reports/, `${migration} 缺少汇报权限`)
  }
})
