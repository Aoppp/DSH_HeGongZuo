CREATE SEQUENCE IF NOT EXISTS employee_id_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS employees (
  id varchar(32) PRIMARY KEY,
  display_name varchar(120) NOT NULL,
  work_email varchar(320) UNIQUE,
  work_phone varchar(64) NOT NULL,
  department_name varchar(120) NOT NULL,
  job_title varchar(120) NOT NULL,
  employment_type varchar(32) NOT NULL CHECK (employment_type IN ('full_time', 'part_time', 'contractor', 'intern')),
  status varchar(32) NOT NULL CHECK (status IN ('probation', 'active', 'on_leave', 'inactive')),
  hire_date date NOT NULL,
  work_location varchar(120) NOT NULL,
  responsibilities text NOT NULL DEFAULT '',
  resume_file_name varchar(255),
  resume_mime_type varchar(120),
  resume_data bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employees_id_format CHECK (id ~ '^EMP-[0-9]{4,}$')
);

CREATE INDEX IF NOT EXISTS employees_status_idx ON employees(status);
