/* =============================================================
   HR System — MySQL / MariaDB Schema
   Dialect  : MySQL 8+ / MariaDB 10.6+
   Encoding : utf8mb4
   Notes    : Every table carries company_id for multi-tenancy
   ============================================================= */

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;


-- ─────────────────────────────────────────────────────────────
-- 1. COMPANIES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    name            VARCHAR(150)    NOT NULL,
    name_ar         VARCHAR(150)    NOT NULL DEFAULT '',
    logo            VARCHAR(500)    NULL,
    phone           VARCHAR(30)     NULL,
    email           VARCHAR(150)    NULL,
    address         TEXT            NULL,
    tax_id          VARCHAR(50)     NULL,
    currency        CHAR(3)         NOT NULL DEFAULT 'SAR',
    timezone        VARCHAR(60)     NOT NULL DEFAULT 'Asia/Riyadh',
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_companies_is_active ON companies (is_active);


-- ─────────────────────────────────────────────────────────────
-- 2. ROLES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id      INT UNSIGNED    NOT NULL,
    name            VARCHAR(80)     NOT NULL,
    name_ar         VARCHAR(80)     NOT NULL DEFAULT '',
    permissions     JSON            NULL COMMENT 'Array of permission keys',
    is_system       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1 = built-in, cannot delete',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_roles_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_roles_company_id ON roles (company_id);
CREATE UNIQUE INDEX uq_roles_company_name ON roles (company_id, name);


-- ─────────────────────────────────────────────────────────────
-- 3. DEPARTMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id      INT UNSIGNED    NOT NULL,
    name            VARCHAR(120)    NOT NULL,
    name_ar         VARCHAR(120)    NOT NULL DEFAULT '',
    parent_id       INT UNSIGNED    NULL     COMMENT 'Self-referencing for sub-departments',
    manager_id      INT UNSIGNED    NULL     COMMENT 'FK to employees — set after employees table',
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_dept_company   FOREIGN KEY (company_id) REFERENCES companies    (id) ON DELETE CASCADE,
    CONSTRAINT fk_dept_parent    FOREIGN KEY (parent_id)  REFERENCES departments  (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_departments_company_id ON departments (company_id);
CREATE INDEX idx_departments_parent_id  ON departments (parent_id);
CREATE INDEX idx_departments_manager_id ON departments (manager_id);


-- ─────────────────────────────────────────────────────────────
-- 4. POSITIONS  (job titles / grades)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS positions (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id      INT UNSIGNED    NOT NULL,
    department_id   INT UNSIGNED    NULL,
    title           VARCHAR(120)    NOT NULL,
    title_ar        VARCHAR(120)    NOT NULL DEFAULT '',
    grade           VARCHAR(20)     NULL,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_pos_company    FOREIGN KEY (company_id)    REFERENCES companies   (id) ON DELETE CASCADE,
    CONSTRAINT fk_pos_department FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_positions_company_id    ON positions (company_id);
CREATE INDEX idx_positions_department_id ON positions (department_id);


-- ─────────────────────────────────────────────────────────────
-- 5. EMPLOYEES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
    id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id          INT UNSIGNED    NOT NULL,
    employee_number     VARCHAR(30)     NOT NULL,
    first_name          VARCHAR(80)     NOT NULL,
    last_name           VARCHAR(80)     NOT NULL,
    first_name_ar       VARCHAR(80)     NOT NULL DEFAULT '',
    last_name_ar        VARCHAR(80)     NOT NULL DEFAULT '',
    gender              ENUM('MALE','FEMALE','OTHER') NOT NULL DEFAULT 'MALE',
    birth_date          DATE            NULL,
    national_id         VARCHAR(30)     NULL,
    nationality         VARCHAR(60)     NULL,
    marital_status      ENUM('SINGLE','MARRIED','DIVORCED','WIDOWED') NULL,
    phone               VARCHAR(30)     NULL,
    email               VARCHAR(150)    NULL,
    address             TEXT            NULL,
    photo               VARCHAR(500)    NULL,
    -- Employment
    hire_date           DATE            NOT NULL,
    termination_date    DATE            NULL,
    contract_type       ENUM('FULL_TIME','PART_TIME','CONTRACT','INTERN') NOT NULL DEFAULT 'FULL_TIME',
    status              ENUM('ACTIVE','INACTIVE','TERMINATED','ON_LEAVE') NOT NULL DEFAULT 'ACTIVE',
    department_id       INT UNSIGNED    NULL,
    position_id         INT UNSIGNED    NULL,
    manager_id          INT UNSIGNED    NULL COMMENT 'Direct manager (self-ref)',
    -- Banking
    bank_name           VARCHAR(100)    NULL,
    bank_account        VARCHAR(60)     NULL,
    iban                VARCHAR(34)     NULL,
    -- Salary
    base_salary         DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    -- Soft delete
    deleted_at          DATETIME        NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_emp_company    FOREIGN KEY (company_id)    REFERENCES companies   (id) ON DELETE CASCADE,
    CONSTRAINT fk_emp_dept       FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL,
    CONSTRAINT fk_emp_position   FOREIGN KEY (position_id)   REFERENCES positions   (id) ON DELETE SET NULL,
    CONSTRAINT fk_emp_manager    FOREIGN KEY (manager_id)    REFERENCES employees   (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE UNIQUE INDEX uq_employees_number     ON employees (company_id, employee_number);
CREATE UNIQUE INDEX uq_employees_national   ON employees (company_id, national_id);
CREATE INDEX idx_employees_company_id       ON employees (company_id);
CREATE INDEX idx_employees_department_id    ON employees (department_id);
CREATE INDEX idx_employees_position_id      ON employees (position_id);
CREATE INDEX idx_employees_manager_id       ON employees (manager_id);
CREATE INDEX idx_employees_status           ON employees (status);
CREATE INDEX idx_employees_hire_date        ON employees (hire_date);
CREATE INDEX idx_employees_deleted_at       ON employees (deleted_at);


-- ─────────────────────────────────────────────────────────────
-- 6. USERS  (auth accounts — one per employee or admin)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id      INT UNSIGNED    NOT NULL,
    employee_id     INT UNSIGNED    NULL     COMMENT 'NULL for super-admin',
    role_id         INT UNSIGNED    NOT NULL,
    email           VARCHAR(150)    NOT NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    last_login      DATETIME        NULL,
    refresh_token   VARCHAR(512)    NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_users_company  FOREIGN KEY (company_id)  REFERENCES companies  (id) ON DELETE CASCADE,
    CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees  (id) ON DELETE SET NULL,
    CONSTRAINT fk_users_role     FOREIGN KEY (role_id)     REFERENCES roles      (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE UNIQUE INDEX uq_users_email         ON users (company_id, email);
CREATE INDEX idx_users_company_id          ON users (company_id);
CREATE INDEX idx_users_employee_id         ON users (employee_id);
CREATE INDEX idx_users_role_id             ON users (role_id);
CREATE INDEX idx_users_is_active           ON users (is_active);

-- Back-fill deferred FK from departments.manager_id → employees
ALTER TABLE departments
    ADD CONSTRAINT fk_dept_manager
        FOREIGN KEY (manager_id) REFERENCES employees (id) ON DELETE SET NULL;


-- ─────────────────────────────────────────────────────────────
-- 7. EMPLOYEE DOCUMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_documents (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id      INT UNSIGNED    NOT NULL,
    employee_id     INT UNSIGNED    NOT NULL,
    doc_type        VARCHAR(60)     NOT NULL COMMENT 'e.g. IQAMA, PASSPORT, CONTRACT, CERTIFICATE',
    title           VARCHAR(200)    NOT NULL,
    file_path       VARCHAR(500)    NOT NULL,
    expiry_date     DATE            NULL,
    notes           TEXT            NULL,
    uploaded_by     INT UNSIGNED    NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_doc_company  FOREIGN KEY (company_id)  REFERENCES companies (id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_uploader FOREIGN KEY (uploaded_by) REFERENCES users     (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_edocs_company_id    ON employee_documents (company_id);
CREATE INDEX idx_edocs_employee_id   ON employee_documents (employee_id);
CREATE INDEX idx_edocs_doc_type      ON employee_documents (doc_type);
CREATE INDEX idx_edocs_expiry_date   ON employee_documents (expiry_date);


-- ─────────────────────────────────────────────────────────────
-- 8. ATTENDANCE
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id      INT UNSIGNED    NOT NULL,
    employee_id     INT UNSIGNED    NOT NULL,
    work_date       DATE            NOT NULL,
    check_in        DATETIME        NULL,
    check_out       DATETIME        NULL,
    total_minutes   SMALLINT        NULL COMMENT 'Calculated: check_out - check_in in minutes',
    overtime_minutes SMALLINT       NOT NULL DEFAULT 0,
    status          ENUM('PRESENT','ABSENT','LATE','HALF_DAY','HOLIDAY','WEEKEND','ON_LEAVE')
                                    NOT NULL DEFAULT 'PRESENT',
    source          ENUM('MANUAL','DEVICE','IMPORT') NOT NULL DEFAULT 'MANUAL',
    notes           TEXT            NULL,
    created_by      INT UNSIGNED    NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_att_company    FOREIGN KEY (company_id)  REFERENCES companies (id) ON DELETE CASCADE,
    CONSTRAINT fk_att_employee   FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
    CONSTRAINT fk_att_creator    FOREIGN KEY (created_by)  REFERENCES users     (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE UNIQUE INDEX uq_attendance_emp_date  ON attendance (company_id, employee_id, work_date);
CREATE INDEX idx_attendance_company_id      ON attendance (company_id);
CREATE INDEX idx_attendance_employee_id     ON attendance (employee_id);
CREATE INDEX idx_attendance_work_date       ON attendance (work_date);
CREATE INDEX idx_attendance_status          ON attendance (status);


-- ─────────────────────────────────────────────────────────────
-- 9. LEAVE TYPES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_types (
    id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id          INT UNSIGNED    NOT NULL,
    name                VARCHAR(100)    NOT NULL,
    name_ar             VARCHAR(100)    NOT NULL DEFAULT '',
    max_days_per_year   SMALLINT        NOT NULL DEFAULT 0 COMMENT '0 = unlimited',
    is_paid             TINYINT(1)      NOT NULL DEFAULT 1,
    carry_forward       TINYINT(1)      NOT NULL DEFAULT 0,
    max_carry_days      SMALLINT        NOT NULL DEFAULT 0,
    requires_approval   TINYINT(1)      NOT NULL DEFAULT 1,
    gender_specific     ENUM('ALL','MALE','FEMALE') NOT NULL DEFAULT 'ALL',
    is_active           TINYINT(1)      NOT NULL DEFAULT 1,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_lt_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_leave_types_company_id ON leave_types (company_id);
CREATE INDEX idx_leave_types_is_active  ON leave_types (is_active);


-- ─────────────────────────────────────────────────────────────
-- 10. LEAVE BALANCES  (per employee, per type, per year)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_balances (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id      INT UNSIGNED    NOT NULL,
    employee_id     INT UNSIGNED    NOT NULL,
    leave_type_id   INT UNSIGNED    NOT NULL,
    year            SMALLINT        NOT NULL,
    total_days      DECIMAL(6,1)    NOT NULL DEFAULT 0.0,
    used_days       DECIMAL(6,1)    NOT NULL DEFAULT 0.0,
    pending_days    DECIMAL(6,1)    NOT NULL DEFAULT 0.0,
    remaining_days  DECIMAL(6,1)    GENERATED ALWAYS AS (total_days - used_days - pending_days) STORED,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_lb_company    FOREIGN KEY (company_id)   REFERENCES companies   (id) ON DELETE CASCADE,
    CONSTRAINT fk_lb_employee   FOREIGN KEY (employee_id)  REFERENCES employees   (id) ON DELETE CASCADE,
    CONSTRAINT fk_lb_leave_type FOREIGN KEY (leave_type_id) REFERENCES leave_types (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE UNIQUE INDEX uq_leave_balances ON leave_balances (company_id, employee_id, leave_type_id, year);
CREATE INDEX idx_lb_company_id    ON leave_balances (company_id);
CREATE INDEX idx_lb_employee_id   ON leave_balances (employee_id);
CREATE INDEX idx_lb_year          ON leave_balances (year);


-- ─────────────────────────────────────────────────────────────
-- 11. LEAVE REQUESTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
    id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id          INT UNSIGNED    NOT NULL,
    employee_id         INT UNSIGNED    NOT NULL,
    leave_type_id       INT UNSIGNED    NOT NULL,
    start_date          DATE            NOT NULL,
    end_date            DATE            NOT NULL,
    total_days          DECIMAL(6,1)    NOT NULL DEFAULT 1.0,
    reason              TEXT            NULL,
    status              ENUM('PENDING','APPROVED','REJECTED','CANCELLED')
                                        NOT NULL DEFAULT 'PENDING',
    approved_by         INT UNSIGNED    NULL,
    approved_at         DATETIME        NULL,
    rejection_reason    TEXT            NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_lr_company    FOREIGN KEY (company_id)   REFERENCES companies   (id) ON DELETE CASCADE,
    CONSTRAINT fk_lr_employee   FOREIGN KEY (employee_id)  REFERENCES employees   (id) ON DELETE CASCADE,
    CONSTRAINT fk_lr_leave_type FOREIGN KEY (leave_type_id) REFERENCES leave_types (id),
    CONSTRAINT fk_lr_approver   FOREIGN KEY (approved_by)  REFERENCES users       (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_lr_company_id    ON leave_requests (company_id);
CREATE INDEX idx_lr_employee_id   ON leave_requests (employee_id);
CREATE INDEX idx_lr_leave_type_id ON leave_requests (leave_type_id);
CREATE INDEX idx_lr_status        ON leave_requests (status);
CREATE INDEX idx_lr_start_date    ON leave_requests (start_date);
CREATE INDEX idx_lr_end_date      ON leave_requests (end_date);


-- ─────────────────────────────────────────────────────────────
-- 12. SALARY COMPONENTS  (additions / deductions template)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_components (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id      INT UNSIGNED    NOT NULL,
    name            VARCHAR(100)    NOT NULL,
    name_ar         VARCHAR(100)    NOT NULL DEFAULT '',
    type            ENUM('ADDITION','DEDUCTION') NOT NULL,
    is_percentage   TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1=percent of base salary, 0=fixed amount',
    value           DECIMAL(10,4)   NOT NULL DEFAULT 0.0000 COMMENT 'Amount or percentage (e.g. 10.00 = 10%)',
    is_taxable      TINYINT(1)      NOT NULL DEFAULT 0,
    applies_to_all  TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '0 = assigned per employee',
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_sc_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_sc_company_id  ON salary_components (company_id);
CREATE INDEX idx_sc_type        ON salary_components (type);
CREATE INDEX idx_sc_is_active   ON salary_components (is_active);


-- ─────────────────────────────────────────────────────────────
-- 13. EMPLOYEE SALARY COMPONENTS
--     (overrides / custom assignments per employee)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_salary_components (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id      INT UNSIGNED    NOT NULL,
    employee_id     INT UNSIGNED    NOT NULL,
    component_id    INT UNSIGNED    NOT NULL,
    override_value  DECIMAL(10,4)   NULL COMMENT 'NULL = use component default value',
    effective_from  DATE            NOT NULL,
    effective_to    DATE            NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_esc_company   FOREIGN KEY (company_id)  REFERENCES companies         (id) ON DELETE CASCADE,
    CONSTRAINT fk_esc_employee  FOREIGN KEY (employee_id) REFERENCES employees         (id) ON DELETE CASCADE,
    CONSTRAINT fk_esc_component FOREIGN KEY (component_id) REFERENCES salary_components (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_esc_company_id   ON employee_salary_components (company_id);
CREATE INDEX idx_esc_employee_id  ON employee_salary_components (employee_id);
CREATE INDEX idx_esc_component_id ON employee_salary_components (component_id);


-- ─────────────────────────────────────────────────────────────
-- 14. PAYROLL RUNS  (one run per month per company)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
    id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id          INT UNSIGNED    NOT NULL,
    run_month           TINYINT         NOT NULL COMMENT '1-12',
    run_year            SMALLINT        NOT NULL,
    status              ENUM('DRAFT','PROCESSING','APPROVED','PAID','CANCELLED')
                                        NOT NULL DEFAULT 'DRAFT',
    total_employees     INT             NOT NULL DEFAULT 0,
    total_gross         DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    total_deductions    DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    total_net           DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    notes               TEXT            NULL,
    processed_by        INT UNSIGNED    NULL,
    processed_at        DATETIME        NULL,
    approved_by         INT UNSIGNED    NULL,
    approved_at         DATETIME        NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_pr_company   FOREIGN KEY (company_id)   REFERENCES companies (id) ON DELETE CASCADE,
    CONSTRAINT fk_pr_processor FOREIGN KEY (processed_by) REFERENCES users     (id) ON DELETE SET NULL,
    CONSTRAINT fk_pr_approver  FOREIGN KEY (approved_by)  REFERENCES users     (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE UNIQUE INDEX uq_payroll_runs ON payroll_runs (company_id, run_month, run_year);
CREATE INDEX idx_pr_company_id  ON payroll_runs (company_id);
CREATE INDEX idx_pr_status      ON payroll_runs (status);
CREATE INDEX idx_pr_year_month  ON payroll_runs (run_year, run_month);


-- ─────────────────────────────────────────────────────────────
-- 15. PAYROLL ITEMS  (one row per employee per payroll run)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_items (
    id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id          INT UNSIGNED    NOT NULL,
    payroll_run_id      INT UNSIGNED    NOT NULL,
    employee_id         INT UNSIGNED    NOT NULL,
    working_days        TINYINT         NOT NULL DEFAULT 30,
    actual_days         TINYINT         NOT NULL DEFAULT 30,
    absent_days         DECIMAL(5,1)    NOT NULL DEFAULT 0.0,
    leave_days          DECIMAL(5,1)    NOT NULL DEFAULT 0.0,
    base_salary         DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    total_additions     DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    total_deductions    DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    gross_salary        DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    tax_amount          DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    net_salary          DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    notes               TEXT            NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_pi_company      FOREIGN KEY (company_id)    REFERENCES companies    (id) ON DELETE CASCADE,
    CONSTRAINT fk_pi_payroll_run  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs (id) ON DELETE CASCADE,
    CONSTRAINT fk_pi_employee     FOREIGN KEY (employee_id)   REFERENCES employees    (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE UNIQUE INDEX uq_payroll_items ON payroll_items (company_id, payroll_run_id, employee_id);
CREATE INDEX idx_pi_company_id    ON payroll_items (company_id);
CREATE INDEX idx_pi_run_id        ON payroll_items (payroll_run_id);
CREATE INDEX idx_pi_employee_id   ON payroll_items (employee_id);


-- ─────────────────────────────────────────────────────────────
-- 16. PAYROLL ITEM COMPONENTS  (line-item breakdown per item)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_item_components (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id      INT UNSIGNED    NOT NULL,
    payroll_item_id INT UNSIGNED    NOT NULL,
    component_id    INT UNSIGNED    NOT NULL,
    component_name  VARCHAR(100)    NOT NULL COMMENT 'Snapshot of name at run time',
    type            ENUM('ADDITION','DEDUCTION') NOT NULL,
    amount          DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_pic_company    FOREIGN KEY (company_id)    REFERENCES companies         (id) ON DELETE CASCADE,
    CONSTRAINT fk_pic_pi         FOREIGN KEY (payroll_item_id) REFERENCES payroll_items   (id) ON DELETE CASCADE,
    CONSTRAINT fk_pic_component  FOREIGN KEY (component_id)  REFERENCES salary_components (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_pic_company_id      ON payroll_item_components (company_id);
CREATE INDEX idx_pic_payroll_item_id ON payroll_item_components (payroll_item_id);
CREATE INDEX idx_pic_component_id    ON payroll_item_components (component_id);


-- ─────────────────────────────────────────────────────────────
-- 17. ANNOUNCEMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id      INT UNSIGNED    NOT NULL,
    title           VARCHAR(200)    NOT NULL,
    title_ar        VARCHAR(200)    NOT NULL DEFAULT '',
    body            TEXT            NOT NULL,
    body_ar         TEXT            NOT NULL,
    target_role_id  INT UNSIGNED    NULL COMMENT 'NULL = all employees',
    published_by    INT UNSIGNED    NULL,
    published_at    DATETIME        NULL,
    expires_at      DATETIME        NULL,
    is_pinned       TINYINT(1)      NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_ann_company   FOREIGN KEY (company_id)   REFERENCES companies (id) ON DELETE CASCADE,
    CONSTRAINT fk_ann_publisher FOREIGN KEY (published_by) REFERENCES users     (id) ON DELETE SET NULL,
    CONSTRAINT fk_ann_role      FOREIGN KEY (target_role_id) REFERENCES roles   (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_ann_company_id   ON announcements (company_id);
CREATE INDEX idx_ann_published_at ON announcements (published_at);
CREATE INDEX idx_ann_expires_at   ON announcements (expires_at);


-- ─────────────────────────────────────────────────────────────
-- 18. AUDIT LOGS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id      INT UNSIGNED    NOT NULL,
    user_id         INT UNSIGNED    NULL,
    action          VARCHAR(50)     NOT NULL COMMENT 'CREATE | UPDATE | DELETE | LOGIN | LOGOUT',
    table_name      VARCHAR(80)     NOT NULL,
    record_id       INT UNSIGNED    NULL,
    old_values      JSON            NULL,
    new_values      JSON            NULL,
    ip_address      VARCHAR(45)     NULL,
    user_agent      VARCHAR(255)    NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_audit_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
    CONSTRAINT fk_audit_user    FOREIGN KEY (user_id)    REFERENCES users     (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_audit_company_id  ON audit_logs (company_id);
CREATE INDEX idx_audit_user_id     ON audit_logs (user_id);
CREATE INDEX idx_audit_table_name  ON audit_logs (table_name);
CREATE INDEX idx_audit_action      ON audit_logs (action);
CREATE INDEX idx_audit_created_at  ON audit_logs (created_at);


-- ─────────────────────────────────────────────────────────────
-- 19. DEVICES  (biometric / RFID / face readers)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
    id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    company_id       INT UNSIGNED    NOT NULL,
    department_id    INT UNSIGNED    NULL,

    name             VARCHAR(100)    NOT NULL,
    serial_number    VARCHAR(80)     NOT NULL,
    location         VARCHAR(150)    NULL,
    ip_address       VARCHAR(255)    NULL,
    firmware_version VARCHAR(30)     NULL,

    -- Hardware input method
    type ENUM('FINGERPRINT','CARD','FACE','PIN','HYBRID')
                                    NOT NULL DEFAULT 'FINGERPRINT',

    -- Operating mode:
    --   ATTENDANCE   = logs become attendance records
    --   VERIFY_ONLY  = identity verification only; logs stored but not processed
    mode ENUM('ATTENDANCE','VERIFY_ONLY')
                                    NOT NULL DEFAULT 'ATTENDANCE',

    status ENUM('ACTIVE','INACTIVE','OFFLINE')
                                    NOT NULL DEFAULT 'ACTIVE',

    -- Secret token used by the physical device to authenticate push requests.
    -- Stored in plaintext (rotate via API). 48-char hex string.
    api_key          VARCHAR(64)     NOT NULL,

    last_sync        DATETIME        NULL,
    created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_dev_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
    CONSTRAINT fk_devices_department FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE UNIQUE INDEX uq_devices_serial  ON devices (company_id, serial_number);
CREATE INDEX idx_devices_company_id    ON devices (company_id);
CREATE INDEX idx_devices_department_id ON devices (department_id);
CREATE INDEX idx_devices_status        ON devices (status);
CREATE INDEX idx_devices_mode          ON devices (mode);


-- ─────────────────────────────────────────────────────────────
-- 20. DEVICE_LOGS  (raw push log archive — one row per event)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_logs (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id      INT UNSIGNED    NOT NULL,
    device_id       INT UNSIGNED    NOT NULL,

    -- Resolved at push time; NULL if card_number not matched to a known employee
    employee_id     INT UNSIGNED    NULL,

    -- Raw identifier sent by the device (card UID, enrolment ID, finger ID, etc.)
    card_number     VARCHAR(80)     NOT NULL,

    event_type      ENUM('CHECK_IN','CHECK_OUT','VERIFY','ALARM','OTHER')
                                    NOT NULL DEFAULT 'CHECK_IN',

    -- Timestamp as reported by the device clock (may differ from server time)
    event_time      DATETIME        NOT NULL,

    -- Full JSON body received from the device, archived verbatim
    raw_payload     JSON            NULL,

    -- 1 = (device_id, card_number, event_type, event_time) already existed
    is_duplicate    TINYINT(1)      NOT NULL DEFAULT 0,

    -- 1 = originating device was in VERIFY_ONLY mode; never processed into
    --     attendance records
    is_verify_only  TINYINT(1)      NOT NULL DEFAULT 0,

    -- 1 = log has been forwarded to the attendance layer
    processed       TINYINT(1)      NOT NULL DEFAULT 0,

    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_dlog_company  FOREIGN KEY (company_id)  REFERENCES companies (id) ON DELETE CASCADE,
    CONSTRAINT fk_dlog_device   FOREIGN KEY (device_id)   REFERENCES devices   (id) ON DELETE CASCADE,
    CONSTRAINT fk_dlog_employee FOREIGN KEY (employee_id) REFERENCES employees  (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deduplication constraint: same physical event cannot be stored twice
CREATE UNIQUE INDEX uq_device_log_dedup  ON device_logs (device_id, card_number, event_type, event_time);

CREATE INDEX idx_dlog_company_id    ON device_logs (company_id);
CREATE INDEX idx_dlog_device_id     ON device_logs (device_id);
CREATE INDEX idx_dlog_employee_id   ON device_logs (employee_id);
CREATE INDEX idx_dlog_event_time    ON device_logs (event_time);
CREATE INDEX idx_dlog_event_type    ON device_logs (event_type);
CREATE INDEX idx_dlog_is_duplicate  ON device_logs (is_duplicate);
CREATE INDEX idx_dlog_is_verify     ON device_logs (is_verify_only);
CREATE INDEX idx_dlog_processed     ON device_logs (processed);

-- ─────────────────────────────────────────────────────────────────────────────
-- Table 21: work_shifts
-- Per-company shift definitions used by the Attendance Processing Engine.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE work_shifts (
  id           INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  company_id   INT UNSIGNED     NOT NULL,

  name         VARCHAR(80)      NOT NULL,
  name_ar      VARCHAR(80)      NOT NULL DEFAULT '',

  -- Expected clock-in / clock-out times (stored as TIME)
  shift_start  TIME             NOT NULL,
  shift_end    TIME             NOT NULL,

  -- Net hours the employee is expected to work (e.g. 8.00)
  standard_hours             DECIMAL(4,2)      NOT NULL DEFAULT 8.00,

  -- Grace period: late_minutes only accrues after this many minutes past shift_start
  grace_minutes              SMALLINT UNSIGNED NOT NULL DEFAULT 0,

  -- OT threshold: overtime_minutes only accrues after working this many minutes
  -- past standard_hours
  overtime_threshold_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,

  -- Exactly one shift per company should have is_default = 1
  is_default   TINYINT(1)       NOT NULL DEFAULT 0,
  is_active    TINYINT(1)       NOT NULL DEFAULT 1,

  created_at   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX  idx_ws_company         (company_id),
  INDEX  idx_ws_company_default (company_id, is_default),
  INDEX  idx_ws_active          (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- Additive schema changes for the Attendance Processing Engine
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add late_minutes to attendance (stores processor-calculated lateness)
ALTER TABLE attendance
  ADD COLUMN late_minutes SMALLINT NOT NULL DEFAULT 0
    COMMENT 'Minutes arrived after shift_start (after grace period)'
    AFTER overtime_minutes;

-- 2. Add shift_id to employees (optional per-employee shift override)
ALTER TABLE employees
  ADD COLUMN shift_id INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'Work shift assigned to this employee; NULL = use company default'
    AFTER manager_id,
  ADD INDEX  idx_emp_shift (shift_id);

-- 3. Foreign key: employees.shift_id → work_shifts.id
ALTER TABLE employees
  ADD CONSTRAINT fk_emp_shift
    FOREIGN KEY (shift_id) REFERENCES work_shifts (id)
    ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- Additive schema changes for the Payroll Engine
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.  payroll_items — snapshot columns for attendance/leave/overtime metrics
ALTER TABLE payroll_items
  MODIFY COLUMN actual_days      DECIMAL(5,1)  NOT NULL DEFAULT 0.0
    COMMENT 'Worked days (PRESENT=1, LATE=1, HALF_DAY=0.5)',
  ADD COLUMN paid_leave_days    DECIMAL(5,1)  NOT NULL DEFAULT 0.0
    COMMENT 'Approved paid-leave working days in the month'
    AFTER absent_days,
  ADD COLUMN unpaid_leave_days  DECIMAL(5,1)  NOT NULL DEFAULT 0.0
    COMMENT 'Approved unpaid-leave working days in the month'
    AFTER paid_leave_days,
  ADD COLUMN overtime_minutes   INT           NOT NULL DEFAULT 0
    COMMENT 'Total overtime minutes from attendance records'
    AFTER leave_days,
  ADD COLUMN late_minutes       INT           NOT NULL DEFAULT 0
    COMMENT 'Total late minutes from attendance records'
    AFTER overtime_minutes;

-- 2.  payroll_item_components
--     · component_id becomes nullable (AUTO items have no SalaryComponent row)
--     · source distinguishes engine-generated vs component-based line items
ALTER TABLE payroll_item_components
  DROP FOREIGN KEY fk_pic_component,
  MODIFY COLUMN component_id INT UNSIGNED NULL
    COMMENT 'NULL for AUTO items (overtime, absence, unpaid-leave)',
  ADD COLUMN source ENUM('COMPONENT','AUTO') NOT NULL DEFAULT 'COMPONENT'
    COMMENT 'COMPONENT = from SalaryComponent; AUTO = engine-calculated';

-- Re-add FK with nullable (ON DELETE SET NULL)
ALTER TABLE payroll_item_components
  ADD CONSTRAINT fk_pic_component
    FOREIGN KEY (component_id) REFERENCES salary_components (id)
    ON DELETE SET NULL;


SET FOREIGN_KEY_CHECKS = 1;

