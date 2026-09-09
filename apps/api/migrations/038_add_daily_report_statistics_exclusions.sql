ALTER TABLE employee_daily_report_individual_scope
  ADD COLUMN IF NOT EXISTS exclusion_type varchar(32) NOT NULL DEFAULT 'individual_report';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employee_daily_report_scope_type_check'
  ) THEN
    ALTER TABLE employee_daily_report_individual_scope
      ADD CONSTRAINT employee_daily_report_scope_type_check
      CHECK (exclusion_type IN ('individual_report', 'statistics_excluded'));
  END IF;
END $$;

INSERT INTO employee_daily_report_individual_scope (display_name, employee_id, exclusion_type)
SELECT source.name, employee.id, 'statistics_excluded'
FROM unnest(ARRAY[
  '龙博天','李雨青','殷慧琳','邓丹','邱欢欢','潘庆','彭群霖',
  '李芮','程婷婷','李圣乐','黄晴晴','林韦康','姚云龙'
]) AS source(name)
LEFT JOIN LATERAL (
  SELECT id FROM employees
  WHERE display_name = source.name AND status <> 'inactive'
  ORDER BY id LIMIT 1
) AS employee ON true
ON CONFLICT (display_name) DO UPDATE
SET employee_id = EXCLUDED.employee_id,
    exclusion_type = EXCLUDED.exclusion_type;
