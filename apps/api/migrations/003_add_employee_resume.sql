ALTER TABLE employees ADD COLUMN IF NOT EXISTS responsibilities text NOT NULL DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS resume_file_name varchar(255);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS resume_mime_type varchar(120);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS resume_data bytea;

