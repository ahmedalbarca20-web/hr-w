'use strict';

/**
 * Reusable Zod schemas shared across modules.
 */

const { z } = require('zod');

// ── Primitives ───────────────────────────────────────────────────────────────

/** Positive integer id parameter (route :id) */
const zId = z.coerce.number().int().positive();

/** ISO 8601 date string YYYY-MM-DD */
const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format');

/** Query-string safe boolean — avoids z.coerce.boolean() treating the string "false" as true. */
const zQueryBool = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'boolean') return val;
  const s = String(val).toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}, z.boolean());

/** IBAN — up to 34 alphanumeric characters */
const zIBAN = z.string().regex(/^[A-Z0-9]{15,34}$/, 'Invalid IBAN format').nullable().optional();

// ── Employee schemas ─────────────────────────────────────────────────────────

const employeeCreateSchema = z.object({
  employee_number  : z.string()
    .trim()
    .min(1, 'Biometric number is required')
    .max(30, 'Biometric number must be at most 30 characters')
    .regex(/^[A-Z0-9_-]+$/i, 'Biometric number may contain letters, numbers, "-" and "_" only'),
  first_name       : z.string().min(1).max(80),
  last_name        : z.string().min(1).max(80),
  first_name_ar    : z.string().max(80).optional().default(''),
  last_name_ar     : z.string().max(80).optional().default(''),
  gender           : z.enum(['MALE', 'FEMALE', 'OTHER']).optional().default('MALE'),
  birth_date       : zDate.nullable().optional(),
  national_id      : z.string().max(30).nullable().optional(),
  nationality      : z.string().max(60).nullable().optional(),
  marital_status   : z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).nullable().optional(),
  phone            : z.string().max(30).nullable().optional(),
  email            : z.string().email().nullable().optional(),
  address          : z.string().nullable().optional(),
  hire_date        : zDate,
  termination_date : zDate.nullable().optional(),
  contract_type    : z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).optional().default('FULL_TIME'),
  status           : z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE']).optional().default('ACTIVE'),
  department_id    : z.number().int().positive().nullable().optional(),
  position_id      : z.number().int().positive().nullable().optional(),
  manager_id       : z.number().int().positive().nullable().optional(),
  shift_id         : z.number().int().positive().nullable().optional(),
  bank_name        : z.string().max(100).nullable().optional(),
  bank_account     : z.string().max(60).nullable().optional(),
  iban             : zIBAN,
  base_salary      : z.number().min(0).optional().default(0),
});

/** Partial update — all fields optional, at least one required. */
const employeeUpdateSchema = employeeCreateSchema.partial();

/** Separate status-change schema for a dedicated PATCH /status endpoint. */
const employeeStatusSchema = z.object({
  status           : z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE']),
  termination_date : zDate.nullable().optional(),
});

// ── Department schemas ───────────────────────────────────────────────────────

const departmentCreateSchema = z.object({
  name        : z.string().min(1).max(120),
  name_ar     : z.string().max(120).optional().default(''),
  parent_id   : z.number().int().positive().nullable().optional(),
  manager_id  : z.number().int().positive().nullable().optional(),
  is_active   : z.number().int().min(0).max(1).optional().default(1),
});

const departmentUpdateSchema = departmentCreateSchema.partial();

// ── List / filter schemas ────────────────────────────────────────────────────

const employeeListSchema = z.object({
  page          : z.coerce.number().int().positive().optional().default(1),
  limit         : z.coerce.number().int().min(1).optional().default(20),
  status        : z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE']).optional(),
  department_id : z.coerce.number().int().positive().optional(),
  search        : z.string().optional(),
  sort_by       : z.enum(['hire_date', 'first_name', 'last_name', 'employee_number', 'created_at'])
                    .optional().default('created_at'),
  sort_dir      : z.enum(['ASC', 'DESC']).optional().default('DESC'),
});

// ── Attendance schemas ───────────────────────────────────────────────────────

const attendanceCreateSchema = z.object({
  employee_id      : z.number().int().positive(),
  work_date        : zDate,
  check_in         : z.string().datetime({ offset: true }).nullable().optional(),
  check_out        : z.string().datetime({ offset: true }).nullable().optional(),
  total_minutes    : z.number().int().min(0).nullable().optional(),
  overtime_minutes : z.number().int().min(0).optional().default(0),
  status           : z.enum(['PRESENT','ABSENT','LATE','HALF_DAY','HOLIDAY','WEEKEND','ON_LEAVE'])
                       .optional().default('PRESENT'),
  source           : z.enum(['MANUAL','DEVICE','IMPORT']).optional().default('MANUAL'),
  notes            : z.string().nullable().optional(),
});

const attendanceUpdateSchema = attendanceCreateSchema
  .omit({ employee_id: true, work_date: true })
  .partial();

const attendanceListSchema = z.object({
  page        : z.coerce.number().int().positive().optional().default(1),
  limit       : z.coerce.number().int().min(1).optional().default(20),
  employee_id : z.coerce.number().int().positive().optional(),
  from        : zDate.optional(),
  to          : zDate.optional(),
  status      : z.enum(['PRESENT','ABSENT','LATE','HALF_DAY','HOLIDAY','WEEKEND','ON_LEAVE']).optional(),
});

const attendanceRequestCreateSchema = z.object({
  request_type: z.enum(['CHECK_IN', 'CHECK_OUT']),
  gps_latitude: z.coerce.number().min(-90).max(90),
  gps_longitude: z.coerce.number().min(-180).max(180),
  gps_accuracy_m: z.coerce.number().min(0).max(5000),
  note: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().max(1000).nullable().optional()),
});

const attendanceRequestListSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).optional().default(20),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  employee_id: z.coerce.number().int().positive().optional(),
  from: zDate.optional(),
  to: zDate.optional(),
});

const attendanceRequestReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejection_reason: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().max(1000).nullable().optional()),
});

// ── Leave schemas ────────────────────────────────────────────────────────────

const leaveTypeCreateSchema = z.object({
  name               : z.string().min(1).max(100),
  name_ar            : z.string().max(100).optional().default(''),
  max_days_per_year  : z.number().int().min(0).optional().default(0),
  is_paid            : z.number().int().min(0).max(1).optional().default(1),
  carry_forward      : z.number().int().min(0).max(1).optional().default(0),
  max_carry_days     : z.number().int().min(0).optional().default(0),
  requires_approval  : z.number().int().min(0).max(1).optional().default(1),
  gender_specific    : z.enum(['ALL','MALE','FEMALE']).optional().default('ALL'),
  is_active          : z.number().int().min(0).max(1).optional().default(1),
});
const leaveTypeUpdateSchema = leaveTypeCreateSchema.partial();

const leaveBalanceSchema = z.object({
  employee_id   : z.number().int().positive(),
  leave_type_id : z.number().int().positive(),
  year          : z.number().int().min(2000).max(2100),
  total_days    : z.number().min(0),
  used_days     : z.number().min(0).optional().default(0),
  pending_days  : z.number().min(0).optional().default(0),
});

const leaveRequestCreateSchema = z.object({
  leave_type_id : z.coerce.number().int().positive(),
  start_date    : zDate,
  end_date      : zDate,
  total_days    : z.coerce.number().positive().optional().default(1),
  reason        : z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().max(10000).nullable().optional(),
  ),
}).superRefine((d, ctx) => {
  if (d.end_date < d.start_date) {
    ctx.addIssue({
      code   : z.ZodIssueCode.custom,
      message: 'end_date must be on or after start_date',
      path   : ['end_date'],
    });
  }
});

const leaveRequestReviewSchema = z.object({
  status           : z.enum(['APPROVED','REJECTED']),
  rejection_reason : z.string().nullable().optional(),
});

const leaveListSchema = z.object({
  page          : z.coerce.number().int().positive().optional().default(1),
  limit         : z.coerce.number().int().min(1).optional().default(20),
  employee_id   : z.coerce.number().int().positive().optional(),
  leave_type_id : z.coerce.number().int().positive().optional(),
  status        : z.enum(['PENDING','APPROVED','REJECTED','CANCELLED']).optional(),
  year          : z.coerce.number().int().optional(),
});

// ── Payroll schemas ──────────────────────────────────────────────────────────

const salaryComponentSchema = z.object({
  name           : z.string().min(1).max(100),
  name_ar        : z.string().max(100).optional().default(''),
  type           : z.enum(['ADDITION','DEDUCTION']),
  is_percentage  : z.number().int().min(0).max(1).optional().default(0),
  value          : z.number().min(0),
  is_taxable     : z.number().int().min(0).max(1).optional().default(0),
  applies_to_all : z.number().int().min(0).max(1).optional().default(1),
  is_active      : z.number().int().min(0).max(1).optional().default(1),
});
const salaryComponentUpdateSchema = salaryComponentSchema.partial();

const empComponentSchema = z.object({
  employee_id     : z.number().int().positive(),
  component_id    : z.number().int().positive(),
  override_value  : z.number().nullable().optional(),
  effective_from  : zDate,
  effective_to    : zDate.nullable().optional(),
});

const payrollRunCreateSchema = z.object({
  run_month : z.coerce.number().int().min(1).max(12).optional(),
  run_year  : z.coerce.number().int().min(2000).max(2100).optional(),
  month     : z.coerce.number().int().min(1).max(12).optional(),
  year      : z.coerce.number().int().min(2000).max(2100).optional(),
  notes     : z.string().nullable().optional(),
}).transform((d) => ({
  run_month : d.run_month ?? d.month,
  run_year  : d.run_year  ?? d.year,
  notes     : d.notes,
})).refine((d) => !!d.run_month && !!d.run_year, { message: 'month and year are required' });

const payrollRunStatusSchema = z.object({
  status : z.enum(['APPROVED','PAID','CANCELLED']),
  notes  : z.string().nullable().optional(),
});

const payrollListSchema = z.object({
  page   : z.coerce.number().int().positive().optional().default(1),
  limit  : z.coerce.number().int().min(1).optional().default(20),
  status : z.enum(['DRAFT','PROCESSING','APPROVED','PAID','CANCELLED']).optional(),
  year   : z.coerce.number().int().optional(),
});

/** Optional engine tuning sent in the body of POST /payroll/runs/:id/process */
const payrollEngineConfigSchema = z.object({
  overtime_multiplier    : z.number().min(1).max(5).optional().default(1.5),
  standard_hours_per_day : z.number().min(1).max(24).optional().default(8),
}).optional().default({});

// ── User management schemas ──────────────────────────────────────────────────

const userCreateSchema = z.object({
  employee_id : z.coerce.number().int().positive().nullable().optional(),
  role_id     : z.coerce.number().int().positive(),
  email       : z.string().email().max(150),
  password    : z.string().min(8).max(100),
  is_active   : z.coerce.number().int().min(0).max(1).optional().default(1),
  auto_employee: z.object({
    employee_number: z.string().trim().min(1).max(30),
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
    hire_date: zDate.optional(),
    shift_id: z.coerce.number().int().positive().nullable().optional(),
    department_id: z.coerce.number().int().positive().nullable().optional(),
  }).optional(),
});

const userUpdateSchema = z.object({
  employee_id: z.coerce.number().int().positive().nullable().optional(),
  role_id   : z.coerce.number().int().positive().optional(),
  email     : z.string().email().max(150).optional(),
  is_active : z.coerce.number().int().min(0).max(1).optional(),
  password  : z.string().min(8).max(100).optional(),
});

const userListSchema = z.object({
  page      : z.coerce.number().int().positive().optional().default(1),
  limit     : z.coerce.number().int().min(1).optional().default(20),
  is_active : z.coerce.number().int().min(0).max(1).optional(),
  search    : z.string().optional(),
});

// ── Announcement schemas ─────────────────────────────────────────────────────

const announcementCreateSchema = z.object({
  title          : z.string().min(1).max(200),
  title_ar       : z.string().max(200).optional().default(''),
  body           : z.string().min(1),
  body_ar        : z.string().optional().default(''),
  target_role_id : z.coerce.number().int().positive().nullable().optional(),
  published_at   : z.preprocess((v) => {
    if (v === '' || v === undefined || v === null) return null;
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
    return s;
  }, z.string().datetime({ offset: true }).nullable().optional()),
  expires_at     : z.preprocess((v) => {
    if (v === '' || v === undefined || v === null) return null;
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T23:59:59.000Z`;
    return s;
  }, z.string().datetime({ offset: true }).nullable().optional()),
  is_pinned      : z.coerce.number().int().min(0).max(1).optional().default(0),
});
const announcementUpdateSchema = announcementCreateSchema.partial();

// ── Device schemas ——————————————————————————————————————————————

/** True if s is a non-empty IPv4/IPv6 or a simple hostname (FQDN / .local / single label). */
function isDeviceNetworkHost(s) {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (!t || t.length > 253) return false;
  if (z.string().ip().safeParse(t).success) return true;
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,251}[a-zA-Z0-9])?$/.test(t);
}

/** Stored in `ip_address` column — IPv4, IPv6, or DNS hostname (not URL). */
const deviceOptionalNetworkHost = z.preprocess(
  (v) => {
    if (v === '' || v === null || v === undefined) return null;
    return typeof v === 'string' ? v.trim() : v;
  },
  z.union([z.null(), z.string().max(253)]).refine((v) => v === null || isDeviceNetworkHost(v), {
    message: 'Invalid IP address or hostname',
  })
);

const deviceProbeNetworkHost = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() : v),
  z.string().min(1).max(253).refine(isDeviceNetworkHost, { message: 'Invalid IP address or hostname' })
);

const deviceCreateSchema = z.object({
  name            : z.string().min(1).max(100),
  serial_number   : z.string().min(1).max(80),
  location        : z.string().max(150).nullable().optional(),
  ip_address      : deviceOptionalNetworkHost.optional(),
  department_id: z
    .preprocess((v) => {
      if (v === '') return null;
      if (v === null) return null;
      if (v === undefined) return undefined;
      return v;
    }, z.union([z.null(), z.coerce.number().int().positive()]).optional()),
  firmware_version: z.string().max(30).nullable().optional(),
  type: z.enum(['FINGERPRINT', 'CARD', 'FACE', 'PIN', 'HYBRID'])
           .optional()
           .default('FINGERPRINT'),
  mode: z.enum(['ATTENDANCE', 'VERIFY_ONLY'])
          .optional()
          .default('ATTENDANCE'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'OFFLINE'])
             .optional()
             .default('ACTIVE'),
});

const deviceUpdateSchema = deviceCreateSchema
  .omit({ serial_number: true })   // serial_number cannot be changed via update
  .partial();

/** HR probes LAN device from server (IP + optional port + vendor hint). */
/** LAN ZK binary protocol (zkteco-js) — same host rules as HTTP probe. */
const deviceZkSocketProbeSchema = z.object({
  ip_address: deviceProbeNetworkHost,
  port: z.coerce.number().int().min(1).max(65535).optional().default(4370),
  /** Default lowered: zkteco-js may try TCP+UDP; unreachable hosts felt ~2× this before failing. */
  socket_timeout_ms: z.coerce.number().int().min(2000).max(60000).optional().default(4000),
  /** Omit to let the server pick a high random UDP port (avoids EADDRINUSE with fixed 5000). */
  udp_local_port: z.coerce.number().int().min(1024).max(65535).optional(),
  /** Only serial (+ optional getInfo if serial empty) — faster for «اختبار الاتصال» in the form. */
  minimal_probe: z.boolean().optional().default(false),
  include_users: z.boolean().optional().default(true),
  max_users: z.coerce.number().int().min(1).max(500).optional().default(80),
  /** Default false: many ZK firmwares break zkteco-js getAttendanceSize (buffer shorter than offset 40). */
  include_attendance_size: z.boolean().optional().default(false),
});

/** Local diagnostics: ZK + HTTP + optional DTR bridge snapshot (POST /api/devices/debug-zk-connection). */
const deviceDebugZkConnectionSchema = deviceZkSocketProbeSchema.extend({
  force_direct_zk: z.boolean().optional().default(false),
  include_users: z.boolean().optional().default(false),
  socket_timeout_ms: z.coerce.number().int().min(2000).max(60000).optional().default(14000),
});

/** Optional overrides when reading via registered device id (IP from DB). */
const deviceZkSocketByDeviceSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).optional(),
  socket_timeout_ms: z.coerce.number().int().min(2000).max(60000).optional(),
  udp_local_port: z.coerce.number().int().min(1024).max(65535).optional(),
  include_users: z.boolean().optional(),
  max_users: z.coerce.number().int().min(1).max(500).optional(),
  include_attendance_size: z.boolean().optional(),
});

const deviceProbeSchema = z.object({
  ip_address: deviceProbeNetworkHost,
  port: z
    .union([z.coerce.number().int().min(1).max(65535), z.literal(''), z.null(), z.undefined()])
    .optional()
    .transform((v) => (v === '' || v === null || v === undefined ? undefined : v)),
  vendor: z.enum(['ZKTECO', 'FINGERTIC', 'AUTO']).optional().default('AUTO'),
  /** فحص HTTP سريع (عدد قليل من الروابط + مهلة قصيرة) — افتراضي true لتفادي انتظار دقائق */
  quick: z.boolean().optional().default(true),
});

/**
 * devicePushSchema – the body pushed by hardware devices.
 * One push can contain many log entries (bulk).
 */
const devicePushSchema = z.object({
  logs: z
    .array(
      z.object({
        card_number : z.string().min(1).max(80),
        event_type  : z
          .enum(['CHECK_IN', 'CHECK_OUT', 'VERIFY', 'ALARM', 'OTHER'])
          .optional()
          .default('CHECK_IN'),
        event_time  : z.string().datetime({ offset: true }),
        raw         : z.record(z.unknown()).nullable().optional(),
      })
    )
    .min(1, 'logs array must have at least one entry'),
});

const deviceLogListSchema = z.object({
  page          : z.coerce.number().int().positive().optional().default(1),
  limit         : z.coerce.number().int().min(1).optional().default(50),
  device_id     : z.coerce.number().int().positive().optional(),
  employee_id   : z.coerce.number().int().positive().optional(),
  /** Partial match on biometric / card number (raw logs search). */
  card_number   : z.string().max(80).optional(),
  event_type    : z.enum(['CHECK_IN', 'CHECK_OUT', 'VERIFY', 'ALARM', 'OTHER']).optional(),
  from          : zDate.optional(),
  to            : zDate.optional(),
  is_duplicate  : z.coerce.number().int().min(0).max(1).optional(),
  is_verify_only: z.coerce.number().int().min(0).max(1).optional(),
  processed     : z.coerce.number().int().min(0).max(1).optional(),
});

/** HR simulates one log row through the same pipeline as hardware POST /push. */
const deviceTestIngestSchema = z.object({
  card_number: z.string().min(1).max(80).optional(),
  event_type  : z
    .enum(['CHECK_IN', 'CHECK_OUT', 'VERIFY', 'ALARM', 'OTHER'])
    .optional()
    .default('CHECK_IN'),
});

const deviceSyncUsersSchema = z.object({
  employee_ids: z.array(z.coerce.number().int().positive()).min(1, 'Select at least one employee'),
});

const deviceZkDeviceUsersQuerySchema = z.object({
  port              : z.coerce.number().int().min(1).max(65535).optional(),
  /** When true, request device keypad PIN — applied only if super admin or company feature `zk_device_pin`. */
  include_password  : zQueryBool.optional().default(false),
});

const deviceZkImportUsersSchema = z.object({
  uids              : z.array(z.coerce.number().int().min(0)).min(1, 'Select at least one device user').max(200),
  port              : z.coerce.number().int().min(1).max(65535).optional(),
  /** When true, include PIN in import results — only if super admin or company feature `zk_device_pin`. */
  include_password  : z.boolean().optional().default(false),
});

/** ZK terminal user privilege (setUser role: 0 normal, 14 admin — pyzk USER_ADMIN). */
const deviceZkSetUserPrivilegeSchema = z.object({
  uid                : z.coerce.number().int().min(1).max(65535),
  is_admin           : z.boolean(),
  port               : z.coerce.number().int().min(1).max(65535).optional(),
  socket_timeout_ms  : z.coerce.number().int().min(8000).max(120000).optional(),
});

const deviceZkUnlockBodySchema = z.object({
  port               : z.coerce.number().int().min(1).max(65535).optional(),
  socket_timeout_ms  : z.coerce.number().int().min(5000).max(120000).optional(),
});

/** Pull ZK attendance buffer → device_logs (+ optional attendance processBulk). */
const deviceZkImportAttendanceSchema = z.object({
  port                  : z.coerce.number().int().min(1).max(65535).optional(),
  date_from             : zDate.optional(),
  date_to               : zDate.optional(),
  max_records           : z.coerce.number().int().min(1).max(20000).optional().default(8000),
  auto_process          : z.boolean().optional().default(false),
  /** When auto_process: replace DEVICE attendance from logs; if true also overwrites same-day MANUAL rows */
  overwrite_attendance  : z.boolean().optional().default(true),
  socket_timeout_ms     : z.coerce.number().int().min(5000).max(180000).optional(),
});

// ── Work Shift schemas ───────────────────────────────────────────────────

/** TIME string HH:MM or HH:MM:SS */
const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Must be time in HH:MM or HH:MM:SS format');

const workShiftCreateSchema = z.object({
  name                      : z.string().min(1).max(80),
  name_ar                   : z.string().max(80).optional().default(''),
  shift_start               : zTime,
  shift_end                 : zTime,
  standard_hours            : z.number().min(0.5).max(24).optional().default(8),
  grace_minutes             : z.number().int().min(0).max(120).optional().default(0),
  overtime_threshold_minutes: z.number().int().min(0).max(120).optional().default(0),
  is_active                 : z.number().int().min(0).max(1).optional().default(1),
  break_start               : zTime.nullable().optional(),
  break_end                 : zTime.nullable().optional(),
  checkin_window_start      : zTime.nullable().optional(),
  checkin_window_end        : zTime.nullable().optional(),
  checkout_window_start     : zTime.nullable().optional(),
  checkout_window_end       : zTime.nullable().optional(),
  work_days                 : z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  week_starts_on            : z.number().int().min(0).max(6).optional(),
  holidays                  : z.array(zDate).optional(),
});

const workShiftUpdateSchema = workShiftCreateSchema.partial();

const workShiftListSchema = z.object({
  include_inactive: z.coerce.boolean().optional().default(false),
});

// ── Attendance Processor schemas ─────────────────────────────────────────────

const processBulkSchema = z.object({
  date_from: zDate,
  date_to  : zDate.optional(),
  overwrite: z.boolean().optional().default(false),
  dry_run  : z.boolean().optional().default(false),
}).transform(d => ({
  date_from: d.date_from,
  date_to  : d.date_to || d.date_from,
  overwrite: d.overwrite,
  dry_run  : d.dry_run,
}));

const processEmployeeSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  date_from  : zDate,
  date_to    : zDate.optional(),
  overwrite  : z.boolean().optional().default(false),
}).transform(d => ({
  employee_id: d.employee_id,
  date_from  : d.date_from,
  date_to    : d.date_to || d.date_from,
  overwrite  : d.overwrite,
}));

const reprocessSchema = z.object({
  date_from  : zDate,
  date_to    : zDate.optional(),
  employee_id: z.coerce.number().int().positive().optional(),
}).transform(d => ({
  date_from  : d.date_from,
  date_to    : d.date_to || d.date_from,
  employee_id: d.employee_id,
}));

const surpriseAttendanceActivateSchema = z.object({
  duration_minutes: z.coerce.number().int().min(1).max(240),
  title: z.string().max(150).optional(),
  message: z.string().max(2000).optional(),
});

const pushWebPushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(4096),
    keys: z.object({
      p256dh: z.string().min(20).max(200),
      auth: z.string().min(10).max(100),
    }),
  }),
  company_id: z.coerce.number().int().positive().nullable().optional(),
});

const pushWebPushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(4096),
});

module.exports = {
  zId,
  zDate,
  // Employee
  employeeCreateSchema,
  employeeUpdateSchema,
  employeeStatusSchema,
  // Department
  departmentCreateSchema,
  departmentUpdateSchema,
  // List helpers
  employeeListSchema,
  // Attendance
  attendanceCreateSchema,
  attendanceUpdateSchema,
  attendanceListSchema,
  attendanceRequestCreateSchema,
  attendanceRequestListSchema,
  attendanceRequestReviewSchema,
  // Leave
  leaveTypeCreateSchema,
  leaveTypeUpdateSchema,
  leaveBalanceSchema,
  leaveRequestCreateSchema,
  leaveRequestReviewSchema,
  leaveListSchema,
  // Payroll
  salaryComponentSchema,
  salaryComponentUpdateSchema,
  empComponentSchema,
  payrollRunCreateSchema,
  payrollRunStatusSchema,
  payrollListSchema,
  payrollEngineConfigSchema,
  // Users
  userCreateSchema,
  userUpdateSchema,
  userListSchema,
  // Announcements
  announcementCreateSchema,
  announcementUpdateSchema,
  // Devices
  deviceCreateSchema,
  deviceUpdateSchema,
  deviceProbeSchema,
  deviceZkSocketProbeSchema,
  deviceDebugZkConnectionSchema,
  deviceZkSocketByDeviceSchema,
  devicePushSchema,
  deviceLogListSchema,
  deviceTestIngestSchema,
  deviceSyncUsersSchema,
  deviceZkDeviceUsersQuerySchema,
  deviceZkImportUsersSchema,
  deviceZkSetUserPrivilegeSchema,
  deviceZkUnlockBodySchema,
  deviceZkImportAttendanceSchema,
  // Work Shifts
  workShiftCreateSchema,
  workShiftUpdateSchema,
  workShiftListSchema,
  // Attendance Processor
  processBulkSchema,
  processEmployeeSchema,
  reprocessSchema,
  surpriseAttendanceActivateSchema,
  pushWebPushSubscribeSchema,
  pushWebPushUnsubscribeSchema,
};

