/* =============================================================
   HR System — SQLite Schema
   Dialect  : SQLite 3.35+
   Notes    :
     • Run `PRAGMA foreign_keys = ON;` at each connection
     • updated_at columns require app-level updates or triggers
       (SQLite has no ON UPDATE CURRENT_TIMESTAMP)
     • ENUM is replaced by TEXT + CHECK constraint
     • JSON is stored as TEXT
     • remaining_days is a regular column (no GENERATED support
       before SQLite 3.31; update via app or trigger)
   ============================================================= */

PRAGMA foreign_keys    = ON;
PRAGMA journal_mode    = WAL;
PRAGMA synchronous     = NORMAL;


-- ─────────────────────────────────────────────────────────────
-- 1. COMPANIES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
    id          INTEGER     PRIMARY KEY AUTOINCREMENT,
    name        TEXT        NOT NULL,
    name_ar     TEXT        NOT NULL DEFAULT '',
    logo        TEXT        NULL,
    phone       TEXT        NULL,
    email       TEXT        NULL,
    address     TEXT        NULL,
    tax_id      TEXT        NULL,
    currency    TEXT        NOT NULL DEFAULT 'SAR',
    timezone    TEXT        NOT NULL DEFAULT 'Asia/Riyadh',
    is_active   INTEGER     NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at  TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT        NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_companies_is_active ON companies (is_active);


-- ─────────────────────────────────────────────────────────────
-- 2. ROLES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    id          INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id  INTEGER     NOT NULL,
    name        TEXT        NOT NULL,
    name_ar     TEXT        NOT NULL DEFAULT '',
    permissions TEXT        NULL,   -- JSON array of permission keys
    is_system   INTEGER     NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
    created_at  TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
);

CREATE INDEX  IF NOT EXISTS idx_roles_company_id     ON roles (company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_company_name ON roles (company_id, name);


-- ─────────────────────────────────────────────────────────────
-- 3. DEPARTMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
    id          INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id  INTEGER     NOT NULL,
    name        TEXT        NOT NULL,
    name_ar     TEXT        NOT NULL DEFAULT '',
    parent_id   INTEGER     NULL,
    manager_id  INTEGER     NULL,   -- FK employees; set after employees table
    is_active   INTEGER     NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at  TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies   (id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id)  REFERENCES departments (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_departments_company_id ON departments (company_id);
CREATE INDEX IF NOT EXISTS idx_departments_parent_id  ON departments (parent_id);
CREATE INDEX IF NOT EXISTS idx_departments_manager_id ON departments (manager_id);


-- ─────────────────────────────────────────────────────────────
-- 4. POSITIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS positions (
    id              INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER     NOT NULL,
    department_id   INTEGER     NULL,
    title           TEXT        NOT NULL,
    title_ar        TEXT        NOT NULL DEFAULT '',
    grade           TEXT        NULL,
    is_active       INTEGER     NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at      TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id)    REFERENCES companies   (id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_positions_company_id    ON positions (company_id);
CREATE INDEX IF NOT EXISTS idx_positions_department_id ON positions (department_id);


-- ─────────────────────────────────────────────────────────────
-- 5. WORK SHIFTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_shifts (
    id                          INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id                  INTEGER     NOT NULL,
    name                        TEXT        NOT NULL,
    name_ar                     TEXT        NOT NULL DEFAULT '',
    shift_start                 TEXT        NOT NULL,   -- HH:MM or HH:MM:SS
    shift_end                   TEXT        NOT NULL,   -- HH:MM or HH:MM:SS
    standard_hours              NUMERIC     NOT NULL DEFAULT 8.00,
    grace_minutes               INTEGER     NOT NULL DEFAULT 0,
    overtime_threshold_minutes  INTEGER     NOT NULL DEFAULT 0,
    is_default                  INTEGER     NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
    is_active                   INTEGER     NOT NULL DEFAULT 1 CHECK (is_active  IN (0,1)),
    created_at                  TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at                  TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ws_company_id      ON work_shifts (company_id);
CREATE INDEX IF NOT EXISTS idx_ws_company_default ON work_shifts (company_id, is_default);
CREATE INDEX IF NOT EXISTS idx_ws_is_active       ON work_shifts (is_active);


-- ─────────────────────────────────────────────────────────────
-- 6. EMPLOYEES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id          INTEGER     NOT NULL,
    employee_number     TEXT        NOT NULL,
    first_name          TEXT        NOT NULL,
    last_name           TEXT        NOT NULL,
    first_name_ar       TEXT        NOT NULL DEFAULT '',
    last_name_ar        TEXT        NOT NULL DEFAULT '',
    gender              TEXT        NOT NULL DEFAULT 'MALE'
                                    CHECK (gender IN ('MALE','FEMALE','OTHER')),
    birth_date          TEXT        NULL,   -- ISO 8601: YYYY-MM-DD
    national_id         TEXT        NULL,
    nationality         TEXT        NULL,
    marital_status      TEXT        NULL
                                    CHECK (marital_status IS NULL OR
                                           marital_status IN ('SINGLE','MARRIED','DIVORCED','WIDOWED')),
    phone               TEXT        NULL,
    email               TEXT        NULL,
    address             TEXT        NULL,
    photo               TEXT        NULL,
    -- Employment
    hire_date           TEXT        NOT NULL,
    termination_date    TEXT        NULL,
    contract_type       TEXT        NOT NULL DEFAULT 'FULL_TIME'
                                    CHECK (contract_type IN ('FULL_TIME','PART_TIME','CONTRACT','INTERN')),
    status              TEXT        NOT NULL DEFAULT 'ACTIVE'
                                    CHECK (status IN ('ACTIVE','INACTIVE','TERMINATED','ON_LEAVE')),
    department_id       INTEGER     NULL,
    position_id         INTEGER     NULL,
    manager_id          INTEGER     NULL,
    -- Banking
    bank_name           TEXT        NULL,
    bank_account        TEXT        NULL,
    iban                TEXT        NULL,
    -- Salary
    base_salary         NUMERIC     NOT NULL DEFAULT 0.00,
    -- Work shift override (NULL = use company default)
    shift_id            INTEGER     NULL,
    -- Soft delete
    deleted_at          TEXT        NULL,
    created_at          TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id)    REFERENCES companies   (id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL,
    FOREIGN KEY (position_id)   REFERENCES positions   (id) ON DELETE SET NULL,
    FOREIGN KEY (manager_id)    REFERENCES employees   (id) ON DELETE SET NULL,
    FOREIGN KEY (shift_id)      REFERENCES work_shifts (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_number   ON employees (company_id, employee_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_national ON employees (company_id, national_id)
    WHERE national_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_company_id     ON employees (company_id);
CREATE INDEX IF NOT EXISTS idx_employees_department_id  ON employees (department_id);
CREATE INDEX IF NOT EXISTS idx_employees_position_id    ON employees (position_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager_id     ON employees (manager_id);
CREATE INDEX IF NOT EXISTS idx_employees_status         ON employees (status);
CREATE INDEX IF NOT EXISTS idx_employees_hire_date      ON employees (hire_date);
CREATE INDEX IF NOT EXISTS idx_employees_deleted_at     ON employees (deleted_at);
CREATE INDEX IF NOT EXISTS idx_employees_shift_id       ON employees (shift_id);


-- ─────────────────────────────────────────────────────────────
-- 7. USERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER     NULL, -- NULL للسوبر أدمن
    employee_id     INTEGER     NULL,
    role_id         INTEGER     NOT NULL,
    email           TEXT        NOT NULL,
    password_hash   TEXT        NOT NULL,
    is_active       INTEGER     NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    last_login      TEXT        NULL,
    refresh_token   TEXT        NULL,
    created_at      TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id)  REFERENCES companies  (id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees  (id) ON DELETE SET NULL,
    FOREIGN KEY (role_id)     REFERENCES roles      (id)
);

-- بريد فريد عالميًا لتجنب تضارب الدخول بين الشركات
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email    ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_company_id     ON users (company_id);
CREATE INDEX IF NOT EXISTS idx_users_employee_id    ON users (employee_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id        ON users (role_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active      ON users (is_active);


-- ─────────────────────────────────────────────────────────────
-- 8. EMPLOYEE DOCUMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_documents (
    id              INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER     NOT NULL,
    employee_id     INTEGER     NOT NULL,
    doc_type        TEXT        NOT NULL,   -- IQAMA, PASSPORT, CONTRACT …
    title           TEXT        NOT NULL,
    file_path       TEXT        NOT NULL,
    expiry_date     TEXT        NULL,
    notes           TEXT        NULL,
    uploaded_by     INTEGER     NULL,
    created_at      TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id)  REFERENCES companies (id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users     (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_edocs_company_id  ON employee_documents (company_id);
CREATE INDEX IF NOT EXISTS idx_edocs_employee_id ON employee_documents (employee_id);
CREATE INDEX IF NOT EXISTS idx_edocs_doc_type    ON employee_documents (doc_type);
CREATE INDEX IF NOT EXISTS idx_edocs_expiry_date ON employee_documents (expiry_date);


-- ─────────────────────────────────────────────────────────────
-- 9. ATTENDANCE
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
    id               INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id       INTEGER     NOT NULL,
    employee_id      INTEGER     NOT NULL,
    work_date        TEXT        NOT NULL,   -- YYYY-MM-DD
    check_in         TEXT        NULL,
    check_out        TEXT        NULL,
    total_minutes    INTEGER     NULL,
    overtime_minutes INTEGER     NOT NULL DEFAULT 0,
    late_minutes     INTEGER     NOT NULL DEFAULT 0,
    status           TEXT        NOT NULL DEFAULT 'PRESENT'
                                 CHECK (status IN
                                   ('PRESENT','ABSENT','LATE','HALF_DAY','HOLIDAY','WEEKEND','ON_LEAVE')),
    source           TEXT        NOT NULL DEFAULT 'MANUAL'
                                 CHECK (source IN ('MANUAL','DEVICE','IMPORT')),
    notes            TEXT        NULL,
    created_by       INTEGER     NULL,
    created_at       TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id)  REFERENCES companies (id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by)  REFERENCES users     (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_emp_date ON attendance (company_id, employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_company_id     ON attendance (company_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_id    ON attendance (employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_work_date      ON attendance (work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_status         ON attendance (status);


-- ─────────────────────────────────────────────────────────────
-- 10. LEAVE TYPES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_types (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id          INTEGER     NOT NULL,
    name                TEXT        NOT NULL,
    name_ar             TEXT        NOT NULL DEFAULT '',
    max_days_per_year   INTEGER     NOT NULL DEFAULT 0,
    is_paid             INTEGER     NOT NULL DEFAULT 1  CHECK (is_paid           IN (0,1)),
    carry_forward       INTEGER     NOT NULL DEFAULT 0  CHECK (carry_forward     IN (0,1)),
    max_carry_days      INTEGER     NOT NULL DEFAULT 0,
    requires_approval   INTEGER     NOT NULL DEFAULT 1  CHECK (requires_approval IN (0,1)),
    gender_specific     TEXT        NOT NULL DEFAULT 'ALL'
                                    CHECK (gender_specific IN ('ALL','MALE','FEMALE')),
    is_active           INTEGER     NOT NULL DEFAULT 1  CHECK (is_active         IN (0,1)),
    created_at          TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leave_types_company_id ON leave_types (company_id);
CREATE INDEX IF NOT EXISTS idx_leave_types_is_active  ON leave_types (is_active);


-- ─────────────────────────────────────────────────────────────
-- 11. LEAVE BALANCES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_balances (
    id              INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER     NOT NULL,
    employee_id     INTEGER     NOT NULL,
    leave_type_id   INTEGER     NOT NULL,
    year            INTEGER     NOT NULL,
    total_days      NUMERIC     NOT NULL DEFAULT 0.0,
    used_days       NUMERIC     NOT NULL DEFAULT 0.0,
    pending_days    NUMERIC     NOT NULL DEFAULT 0.0,
    remaining_days  NUMERIC     NOT NULL DEFAULT 0.0,  -- maintained by app / trigger
    updated_at      TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id)    REFERENCES companies   (id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id)   REFERENCES employees   (id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_balances ON leave_balances
    (company_id, employee_id, leave_type_id, year);
CREATE INDEX IF NOT EXISTS idx_lb_company_id  ON leave_balances (company_id);
CREATE INDEX IF NOT EXISTS idx_lb_employee_id ON leave_balances (employee_id);
CREATE INDEX IF NOT EXISTS idx_lb_year        ON leave_balances (year);


-- ─────────────────────────────────────────────────────────────
-- 12. LEAVE REQUESTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id          INTEGER     NOT NULL,
    employee_id         INTEGER     NOT NULL,
    leave_type_id       INTEGER     NOT NULL,
    start_date          TEXT        NOT NULL,
    end_date            TEXT        NOT NULL,
    total_days          NUMERIC     NOT NULL DEFAULT 1.0,
    reason              TEXT        NULL,
    status              TEXT        NOT NULL DEFAULT 'PENDING'
                                    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
    approved_by         INTEGER     NULL,
    approved_at         TEXT        NULL,
    rejection_reason    TEXT        NULL,
    created_at          TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id)    REFERENCES companies   (id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id)   REFERENCES employees   (id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types (id),
    FOREIGN KEY (approved_by)   REFERENCES users       (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lr_company_id    ON leave_requests (company_id);
CREATE INDEX IF NOT EXISTS idx_lr_employee_id   ON leave_requests (employee_id);
CREATE INDEX IF NOT EXISTS idx_lr_leave_type_id ON leave_requests (leave_type_id);
CREATE INDEX IF NOT EXISTS idx_lr_status        ON leave_requests (status);
CREATE INDEX IF NOT EXISTS idx_lr_start_date    ON leave_requests (start_date);
CREATE INDEX IF NOT EXISTS idx_lr_end_date      ON leave_requests (end_date);


-- ─────────────────────────────────────────────────────────────
-- 13. SALARY COMPONENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_components (
    id              INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER     NOT NULL,
    name            TEXT        NOT NULL,
    name_ar         TEXT        NOT NULL DEFAULT '',
    type            TEXT        NOT NULL CHECK (type IN ('ADDITION','DEDUCTION')),
    is_percentage   INTEGER     NOT NULL DEFAULT 0 CHECK (is_percentage   IN (0,1)),
    value           NUMERIC     NOT NULL DEFAULT 0.0,
    is_taxable      INTEGER     NOT NULL DEFAULT 0 CHECK (is_taxable      IN (0,1)),
    applies_to_all  INTEGER     NOT NULL DEFAULT 1 CHECK (applies_to_all  IN (0,1)),
    is_active       INTEGER     NOT NULL DEFAULT 1 CHECK (is_active       IN (0,1)),
    created_at      TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sc_company_id ON salary_components (company_id);
CREATE INDEX IF NOT EXISTS idx_sc_type       ON salary_components (type);
CREATE INDEX IF NOT EXISTS idx_sc_is_active  ON salary_components (is_active);


-- ─────────────────────────────────────────────────────────────
-- 14. EMPLOYEE SALARY COMPONENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_salary_components (
    id              INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER     NOT NULL,
    employee_id     INTEGER     NOT NULL,
    component_id    INTEGER     NOT NULL,
    override_value  NUMERIC     NULL,
    effective_from  TEXT        NOT NULL,
    effective_to    TEXT        NULL,
    created_at      TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id)   REFERENCES companies          (id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id)  REFERENCES employees          (id) ON DELETE CASCADE,
    FOREIGN KEY (component_id) REFERENCES salary_components  (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_esc_company_id   ON employee_salary_components (company_id);
CREATE INDEX IF NOT EXISTS idx_esc_employee_id  ON employee_salary_components (employee_id);
CREATE INDEX IF NOT EXISTS idx_esc_component_id ON employee_salary_components (component_id);


-- ─────────────────────────────────────────────────────────────
-- 15. PAYROLL RUNS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id          INTEGER     NOT NULL,
    run_month           INTEGER     NOT NULL CHECK (run_month BETWEEN 1 AND 12),
    run_year            INTEGER     NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'DRAFT'
                                    CHECK (status IN ('DRAFT','PROCESSING','APPROVED','PAID','CANCELLED')),
    total_employees     INTEGER     NOT NULL DEFAULT 0,
    total_gross         NUMERIC     NOT NULL DEFAULT 0.00,
    total_deductions    NUMERIC     NOT NULL DEFAULT 0.00,
    total_net           NUMERIC     NOT NULL DEFAULT 0.00,
    notes               TEXT        NULL,
    processed_by        INTEGER     NULL,
    processed_at        TEXT        NULL,
    approved_by         INTEGER     NULL,
    approved_at         TEXT        NULL,
    created_at          TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id)   REFERENCES companies (id) ON DELETE CASCADE,
    FOREIGN KEY (processed_by) REFERENCES users     (id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by)  REFERENCES users     (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_runs ON payroll_runs (company_id, run_month, run_year);
CREATE INDEX IF NOT EXISTS idx_pr_company_id ON payroll_runs (company_id);
CREATE INDEX IF NOT EXISTS idx_pr_status     ON payroll_runs (status);
CREATE INDEX IF NOT EXISTS idx_pr_year_month ON payroll_runs (run_year, run_month);


-- ─────────────────────────────────────────────────────────────
-- 16. PAYROLL ITEMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_items (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id          INTEGER     NOT NULL,
    payroll_run_id      INTEGER     NOT NULL,
    employee_id         INTEGER     NOT NULL,
    working_days        INTEGER     NOT NULL DEFAULT 30,
    actual_days         NUMERIC     NOT NULL DEFAULT 0.0,
    absent_days         NUMERIC     NOT NULL DEFAULT 0.0,
    paid_leave_days     NUMERIC     NOT NULL DEFAULT 0.0,
    unpaid_leave_days   NUMERIC     NOT NULL DEFAULT 0.0,
    leave_days          NUMERIC     NOT NULL DEFAULT 0.0,   -- total (paid + unpaid)
    overtime_minutes    INTEGER     NOT NULL DEFAULT 0,
    late_minutes        INTEGER     NOT NULL DEFAULT 0,
    base_salary         NUMERIC     NOT NULL DEFAULT 0.00,
    total_additions     NUMERIC     NOT NULL DEFAULT 0.00,
    total_deductions    NUMERIC     NOT NULL DEFAULT 0.00,
    gross_salary        NUMERIC     NOT NULL DEFAULT 0.00,
    tax_amount          NUMERIC     NOT NULL DEFAULT 0.00,
    net_salary          NUMERIC     NOT NULL DEFAULT 0.00,
    notes               TEXT        NULL,
    created_at          TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id)    REFERENCES companies    (id) ON DELETE CASCADE,
    FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs (id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id)   REFERENCES employees    (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_items ON payroll_items
    (company_id, payroll_run_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_pi_company_id  ON payroll_items (company_id);
CREATE INDEX IF NOT EXISTS idx_pi_run_id      ON payroll_items (payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_pi_employee_id ON payroll_items (employee_id);


-- ─────────────────────────────────────────────────────────────
-- 17. PAYROLL ITEM COMPONENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_item_components (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id          INTEGER     NOT NULL,
    payroll_item_id     INTEGER     NOT NULL,
    component_id        INTEGER     NULL,       -- NULL for AUTO items (overtime, absence, etc.)
    component_name      TEXT        NOT NULL,   -- snapshot at run time
    type                TEXT        NOT NULL CHECK (type IN ('ADDITION','DEDUCTION')),
    amount              NUMERIC     NOT NULL DEFAULT 0.00,
    source              TEXT        NOT NULL DEFAULT 'COMPONENT'
                                    CHECK (source IN ('COMPONENT','AUTO')),
    created_at          TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id)      REFERENCES companies         (id) ON DELETE CASCADE,
    FOREIGN KEY (payroll_item_id) REFERENCES payroll_items     (id) ON DELETE CASCADE,
    FOREIGN KEY (component_id)    REFERENCES salary_components (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pic_company_id      ON payroll_item_components (company_id);
CREATE INDEX IF NOT EXISTS idx_pic_payroll_item_id ON payroll_item_components (payroll_item_id);
CREATE INDEX IF NOT EXISTS idx_pic_component_id    ON payroll_item_components (component_id);


-- ─────────────────────────────────────────────────────────────
-- 18. ANNOUNCEMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
    id              INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER     NOT NULL,
    title           TEXT        NOT NULL,
    title_ar        TEXT        NOT NULL DEFAULT '',
    body            TEXT        NOT NULL,
    body_ar         TEXT        NOT NULL DEFAULT '',
    target_role_id  INTEGER     NULL,
    published_by    INTEGER     NULL,
    published_at    TEXT        NULL,
    expires_at      TEXT        NULL,
    is_pinned       INTEGER     NOT NULL DEFAULT 0 CHECK (is_pinned IN (0,1)),
    created_at      TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id)    REFERENCES companies (id) ON DELETE CASCADE,
    FOREIGN KEY (published_by)  REFERENCES users     (id) ON DELETE SET NULL,
    FOREIGN KEY (target_role_id) REFERENCES roles    (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ann_company_id   ON announcements (company_id);
CREATE INDEX IF NOT EXISTS idx_ann_published_at ON announcements (published_at);
CREATE INDEX IF NOT EXISTS idx_ann_expires_at   ON announcements (expires_at);


-- ─────────────────────────────────────────────────────────────
-- 19. AUDIT LOGS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id          INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id  INTEGER     NOT NULL,
    user_id     INTEGER     NULL,
    action      TEXT        NOT NULL,   -- CREATE | UPDATE | DELETE | LOGIN | LOGOUT
    table_name  TEXT        NOT NULL,
    record_id   INTEGER     NULL,
    old_values  TEXT        NULL,       -- JSON text
    new_values  TEXT        NULL,       -- JSON text
    ip_address  TEXT        NULL,
    user_agent  TEXT        NULL,
    created_at  TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users     (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_company_id ON audit_logs (company_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_id    ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_table_name ON audit_logs (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs (created_at);


-- ─────────────────────────────────────────────────────────────
-- 20. DEVICES  (biometric / RFID / face readers)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
    id               INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id       INTEGER     NOT NULL,
    department_id    INTEGER     NULL,
    name             TEXT        NOT NULL,
    serial_number    TEXT        NOT NULL,
    location         TEXT        NULL,
    ip_address       TEXT        NULL,
    firmware_version TEXT        NULL,
    type             TEXT        NOT NULL DEFAULT 'FINGERPRINT'
                                 CHECK (type IN ('FINGERPRINT','CARD','FACE','PIN','HYBRID')),
    mode             TEXT        NOT NULL DEFAULT 'ATTENDANCE'
                                 CHECK (mode IN ('ATTENDANCE','VERIFY_ONLY')),
    status           TEXT        NOT NULL DEFAULT 'ACTIVE'
                                 CHECK (status IN ('ACTIVE','INACTIVE','OFFLINE')),
    api_key          TEXT        NOT NULL,
    last_sync        TEXT        NULL,
    created_at       TEXT        NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_serial  ON devices (company_id, serial_number);
CREATE INDEX IF NOT EXISTS idx_devices_company_id    ON devices (company_id);
CREATE INDEX IF NOT EXISTS idx_devices_department_id ON devices (department_id);
CREATE INDEX IF NOT EXISTS idx_devices_status        ON devices (status);
CREATE INDEX IF NOT EXISTS idx_devices_mode          ON devices (mode);


-- ─────────────────────────────────────────────────────────────
-- 21. DEVICE LOGS  (raw push log archive — one row per event)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_logs (
    id              INTEGER     PRIMARY KEY AUTOINCREMENT,
    company_id      INTEGER     NOT NULL,
    device_id       INTEGER     NOT NULL,
    employee_id     INTEGER     NULL,   -- resolved at push time; NULL if not matched
    card_number     TEXT        NOT NULL,
    event_type      TEXT        NOT NULL DEFAULT 'CHECK_IN'
                                CHECK (event_type IN ('CHECK_IN','CHECK_OUT','VERIFY','ALARM','OTHER')),
    event_time      TEXT        NOT NULL,   -- ISO 8601 datetime
    raw_payload     TEXT        NULL,       -- JSON body verbatim
    is_duplicate    INTEGER     NOT NULL DEFAULT 0 CHECK (is_duplicate    IN (0,1)),
    is_verify_only  INTEGER     NOT NULL DEFAULT 0 CHECK (is_verify_only  IN (0,1)),
    processed       INTEGER     NOT NULL DEFAULT 0 CHECK (processed       IN (0,1)),
    created_at      TEXT        NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (company_id)  REFERENCES companies (id) ON DELETE CASCADE,
    FOREIGN KEY (device_id)   REFERENCES devices   (id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_device_log_dedup ON device_logs
    (device_id, card_number, event_type, event_time);
CREATE INDEX IF NOT EXISTS idx_dlog_company_id   ON device_logs (company_id);
CREATE INDEX IF NOT EXISTS idx_dlog_device_id    ON device_logs (device_id);
CREATE INDEX IF NOT EXISTS idx_dlog_employee_id  ON device_logs (employee_id);
CREATE INDEX IF NOT EXISTS idx_dlog_event_time   ON device_logs (event_time);
CREATE INDEX IF NOT EXISTS idx_dlog_event_type   ON device_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_dlog_is_duplicate ON device_logs (is_duplicate);
CREATE INDEX IF NOT EXISTS idx_dlog_is_verify    ON device_logs (is_verify_only);
CREATE INDEX IF NOT EXISTS idx_dlog_processed    ON device_logs (processed);

PRAGMA foreign_keys=off;
CREATE TABLE users_new AS SELECT id, company_id, employee_id, role_id, email, password_hash, is_active, last_login, refresh_token, created_at, updated_at FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE UNIQUE INDEX uq_users_email ON users (email);
CREATE INDEX idx_users_company_id ON users (company_id);
CREATE INDEX idx_users_employee_id ON users (employee_id);
CREATE INDEX idx_users_role_id ON users (role_id);
CREATE INDEX idx_users_is_active ON users (is_active);
PRAGMA foreign_keys=on;