-- 历史导入会直接写入员工编号，需要将自增序列同步到现有最大编号。
SELECT setval(
  'employee_id_seq',
  GREATEST(
    (SELECT last_value FROM employee_id_seq),
    COALESCE((SELECT max(substring(id FROM '^EMP-([0-9]+)$')::bigint) FROM employees WHERE id ~ '^EMP-[0-9]+$'), 1)
  ),
  true
);
