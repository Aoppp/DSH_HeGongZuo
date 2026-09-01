-- 日报统一查询服务所需的部门和名称索引。
-- record_id、employee/user id、report_date 和 update_time 索引已由 020 迁移创建。
CREATE INDEX IF NOT EXISTS employee_work_daily_reports_author_name_idx
  ON employee_work_daily_reports (lower(author_name), report_date DESC);

CREATE INDEX IF NOT EXISTS employee_work_daily_reports_department_idx
  ON employee_work_daily_reports (department_id, report_date DESC);

CREATE INDEX IF NOT EXISTS employee_work_daily_reports_department_name_idx
  ON employee_work_daily_reports (lower(department_name), report_date DESC);
