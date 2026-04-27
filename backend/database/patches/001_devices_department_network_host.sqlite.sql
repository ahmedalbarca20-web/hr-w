-- SQLite: add department link (run once on existing DBs). Enforce FK in app layer if needed.

ALTER TABLE devices ADD COLUMN department_id INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_devices_department_id ON devices (department_id);
