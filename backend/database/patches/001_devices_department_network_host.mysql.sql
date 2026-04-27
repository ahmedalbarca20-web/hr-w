-- Upgrade existing MySQL DB: device ↔ department + longer network host (IPv6 / DNS).
-- Safe to run once; skip statements that already applied if your tool errors on duplicates.

ALTER TABLE devices
  ADD COLUMN department_id INT UNSIGNED NULL AFTER company_id;

ALTER TABLE devices
  MODIFY COLUMN ip_address VARCHAR(255) NULL;

ALTER TABLE devices
  ADD CONSTRAINT fk_devices_department
    FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL;

CREATE INDEX idx_devices_department_id ON devices (department_id);
