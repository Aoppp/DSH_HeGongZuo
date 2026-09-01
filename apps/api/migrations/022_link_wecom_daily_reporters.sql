ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS wecom_user_id varchar(160);

CREATE UNIQUE INDEX IF NOT EXISTS employees_wecom_user_id_key
  ON employees (wecom_user_id)
  WHERE wecom_user_id IS NOT NULL;

WITH unique_reporters AS (
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
SET wecom_user_id = reporter.user_id,
    updated_at = now()
FROM unique_reporters AS reporter
JOIN unique_employees AS matched ON matched.display_name = reporter.author_name
WHERE employee.id = matched.employee_id
  AND employee.wecom_user_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM employees AS occupied WHERE occupied.wecom_user_id = reporter.user_id
  );
