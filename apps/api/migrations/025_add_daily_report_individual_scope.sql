CREATE TABLE IF NOT EXISTS employee_daily_report_individual_scope (
  display_name varchar(160) PRIMARY KEY,
  employee_id varchar(32) REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO employee_daily_report_individual_scope (display_name, employee_id)
SELECT name, employee.id FROM unnest(ARRAY['郭月平','李微','刘晶文','任振兴','钟西林','李金豹','郭金辉','李杰','李敏','陶明','周聪颖','蒋思怡']) AS source(name)
LEFT JOIN LATERAL (SELECT id FROM employees WHERE display_name=source.name AND status <> 'inactive' ORDER BY id LIMIT 1) AS employee ON true
ON CONFLICT (display_name) DO UPDATE SET employee_id=EXCLUDED.employee_id;
