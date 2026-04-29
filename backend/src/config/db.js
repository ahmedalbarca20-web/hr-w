'use strict';

const path      = require('path');
const { Sequelize, DataTypes } = require('sequelize');
const pg = require('pg');

const databaseUrl = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '').trim();
const inferredDialect = /^postgres(ql)?:\/\//i.test(databaseUrl) ? 'postgres' : '';
const dialectRaw = String(process.env.DB_DIALECT || inferredDialect || 'mysql').toLowerCase();
/** Sequelize uses 'postgres' not 'postgresql'. */
const dialect = dialectRaw === 'postgresql' ? 'postgres' : dialectRaw;
const isProd = process.env.NODE_ENV === 'production';

const readDbSecret = (name, fallback = '') => {
  const value = String(process.env[name] || '').trim();
  if (value) {
    if (isProd && value.toLowerCase() === 'password') {
      throw new Error(`[SECURITY] Weak value for env var: ${name}`);
    }
    return value;
  }
  if (isProd) {
    throw new Error(`[SECURITY] Missing required env var: ${name}`);
  }
  return fallback;
};

const sharedDefine = {
  underscored    : true,
  freezeTableName: true,
  timestamps     : true,
  createdAt      : 'created_at',
  updatedAt      : 'updated_at',
};

const devLogging = process.env.NODE_ENV === 'development'
  ? (sql) => console.log('[SQL]', sql)
  : false;

const readIntEnv = (name, fallback) => {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};

/**
 * Default PG pool is intentionally small for serverless + Supabase session limits.
 * Can be overridden by env vars: DB_POOL_MAX / DB_POOL_MIN / DB_POOL_ACQUIRE_MS / DB_POOL_IDLE_MS.
 */
const defaultPoolMax = dialect === 'postgres'
  ? (isProd ? 2 : 5)
  : 10;
const pool = {
  max: readIntEnv('DB_POOL_MAX', defaultPoolMax),
  min: readIntEnv('DB_POOL_MIN', 0),
  acquire: readIntEnv('DB_POOL_ACQUIRE_MS', 30000),
  idle: readIntEnv('DB_POOL_IDLE_MS', dialect === 'postgres' ? 5000 : 10000),
};

let sequelize;

if (dialect === 'sqlite') {
  const storagePath = process.env.DB_STORAGE
    ? path.resolve(process.cwd(), process.env.DB_STORAGE)
    : path.join(__dirname, '..', '..', 'database', 'hr_dev.sqlite');

  sequelize = new Sequelize({
    dialect : 'sqlite',
    storage : storagePath,
    logging : devLogging,
    define  : sharedDefine,
  });
} else if (dialect === 'postgres') {
  const useSsl = String(process.env.DB_SSL || 'true').toLowerCase() !== 'false';
  const pgCommon = {
    dialect         : 'postgres',
    dialectModule   : pg,
    logging         : devLogging,
    pool,
    define          : sharedDefine,
    dialectOptions  : useSsl
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : {},
  };

  if (databaseUrl) {
    sequelize = new Sequelize(databaseUrl, pgCommon);
  } else {
    sequelize = new Sequelize(
      process.env.DB_NAME || 'postgres',
      process.env.DB_USER || 'postgres',
      process.env.DB_PASS || '',
      {
        host   : process.env.DB_HOST || 'localhost',
        port   : parseInt(process.env.DB_PORT || '5432', 10),
        ...pgCommon,
      },
    );
  }
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'hr_db',
    process.env.DB_USER || 'hr_user',
    readDbSecret('DB_PASS'),
    {
      host    : process.env.DB_HOST    || 'localhost',
      port    : parseInt(process.env.DB_PORT || '3306', 10),
      dialect : 'mysql',
      /** Session time_zone — aligns DATE()/CURDATE() with Iraq (UTC+3, no DST). */
      timezone: process.env.DB_TIMEZONE || '+03:00',
      logging : devLogging,
      pool,
      define  : sharedDefine,
    }
  );
}

const connectDB = async () => {
  await sequelize.authenticate();
  const qi = sequelize.getQueryInterface();
  const ensureSurpriseAttendanceTable = async () => {
    try {
      await qi.describeTable('surprise_attendance_events');
    } catch {
      await qi.createTable('surprise_attendance_events', {
        id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, autoIncrement: true, primaryKey: true },
        company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        title: { type: DataTypes.STRING(150), allowNull: false, defaultValue: 'Surprise attendance check' },
        message: { type: DataTypes.TEXT, allowNull: true },
        starts_at: { type: DataTypes.DATE, allowNull: false },
        ends_at: { type: DataTypes.DATE, allowNull: false },
        duration_minutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
        created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
      });
    }
  };

  const ensureDeviceLogSurpriseColumns = async () => {
    let cols;
    try {
      cols = await qi.describeTable('device_logs');
    } catch {
      return;
    }
    if (!cols.is_surprise) {
      await qi.addColumn('device_logs', 'is_surprise', { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 });
    }
    if (!cols.surprise_event_id) {
      await qi.addColumn('device_logs', 'surprise_event_id', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true });
    }
  };
  const ensureAttendanceSurpriseColumns = async () => {
    let cols;
    try {
      cols = await qi.describeTable('attendance');
    } catch {
      return;
    }
    if (!cols.is_surprise) {
      await qi.addColumn('attendance', 'is_surprise', { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 });
    }
    if (!cols.surprise_event_id) {
      await qi.addColumn('attendance', 'surprise_event_id', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true });
    }
    if (!cols.surprise_punch_time) {
      await qi.addColumn('attendance', 'surprise_punch_time', { type: DataTypes.DATE, allowNull: true });
    }
  };
  const ensureAttendanceRequestsTable = async () => {
    const blobType = dialect === 'postgres' ? DataTypes.BLOB : DataTypes.BLOB('long');
    try {
      let cols = await qi.describeTable('attendance_requests');
      if (!cols.photo_binary) {
        await qi.addColumn('attendance_requests', 'photo_binary', { type: blobType, allowNull: true });
      }
      if (!cols.photo_mime) {
        await qi.addColumn('attendance_requests', 'photo_mime', { type: DataTypes.STRING(64), allowNull: true });
      }
      cols = await qi.describeTable('attendance_requests');
      const pp = cols.photo_path;
      if (pp) {
        const allowNull = pp.allowNull === true || pp.allowNull === 'YES' || pp.nullable === true;
        if (!allowNull) {
          try {
            await qi.changeColumn('attendance_requests', 'photo_path', { type: DataTypes.STRING(255), allowNull: true });
          } catch (e) {
            console.warn('[DB] attendance_requests.photo_path nullable:', e?.message || e);
          }
        }
      }
    } catch {
      await qi.createTable('attendance_requests', {
        id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, autoIncrement: true, primaryKey: true },
        company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        employee_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        request_type: { type: DataTypes.STRING(20), allowNull: false },
        request_time: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
        work_date: { type: DataTypes.DATEONLY, allowNull: false },
        gps_latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
        gps_longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
        gps_accuracy_m: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
        photo_path: { type: DataTypes.STRING(255), allowNull: true },
        photo_binary: { type: blobType, allowNull: true },
        photo_mime: { type: DataTypes.STRING(64), allowNull: true },
        note: { type: DataTypes.TEXT, allowNull: true },
        status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING' },
        reviewed_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        reviewed_at: { type: DataTypes.DATE, allowNull: true },
        rejection_reason: { type: DataTypes.TEXT, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal('CURRENT_TIMESTAMP') },
      });
      await qi.addIndex('attendance_requests', ['company_id']);
      await qi.addIndex('attendance_requests', ['employee_id']);
      await qi.addIndex('attendance_requests', ['status']);
      await qi.addIndex('attendance_requests', ['work_date']);
    }
  };

  /** Legacy DBs: devices model gained department_id + longer ip_address before sync/indexes run. */
  const ensureDevicesDepartmentAndHost = async () => {
    let cols;
    try {
      cols = await qi.describeTable('devices');
    } catch {
      return;
    }
    if (!cols.department_id) {
      await qi.addColumn('devices', 'department_id', {
        type: dialect === 'sqlite' ? DataTypes.INTEGER : DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      });
    }
    if ((dialect === 'mysql' || dialect === 'postgres') && cols.ip_address) {
      try {
        await qi.changeColumn('devices', 'ip_address', { type: DataTypes.STRING(255), allowNull: true });
      } catch {
        /* ignore if dialect cannot alter */
      }
    }
  };
  const ensureWorkShiftColumns = async () => {
    let cols;
    try {
      cols = await qi.describeTable('work_shifts');
    } catch {
      return;
    }
    const addIfMissing = async (name, spec) => {
      if (!cols[name]) {
        await qi.addColumn('work_shifts', name, spec);
      }
    };

    // Legacy DB compatibility for old work_shifts schema.
    await addIfMissing('break_start', { type: DataTypes.TIME, allowNull: true });
    await addIfMissing('break_end', { type: DataTypes.TIME, allowNull: true });
    await addIfMissing('work_days', { type: DataTypes.JSON, allowNull: true, defaultValue: [1, 2, 3, 4, 5] });
    await addIfMissing('week_starts_on', { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 6 });
    await addIfMissing('holidays', { type: DataTypes.JSON, allowNull: true, defaultValue: [] });

    // New attendance window columns.
    await addIfMissing('checkin_window_start', { type: DataTypes.TIME, allowNull: true });
    await addIfMissing('checkin_window_end', { type: DataTypes.TIME, allowNull: true });
    await addIfMissing('checkout_window_start', { type: DataTypes.TIME, allowNull: true });
    await addIfMissing('checkout_window_end', { type: DataTypes.TIME, allowNull: true });
  };

  if (dialect === 'sqlite') {
    // Load all models so Sequelize knows the table definitions
    require('../models/index');
    await ensureDevicesDepartmentAndHost();
    // Legacy columns must exist BEFORE sync — otherwise sync tries to create indexes on missing columns.
    await ensureWorkShiftColumns();
    await ensureSurpriseAttendanceTable();
    await ensureDeviceLogSurpriseColumns();
    await ensureAttendanceSurpriseColumns();
    await ensureAttendanceRequestsTable();
    // Sync with force:false — creates only missing tables, never drops
    await sequelize.sync({ force: false });
    console.log('[DB] SQLite database synced and ready.');
  } else {
    require('../models/index');
    await ensureDevicesDepartmentAndHost();
    await ensureWorkShiftColumns();
    await ensureSurpriseAttendanceTable();
    await ensureDeviceLogSurpriseColumns();
    await ensureAttendanceSurpriseColumns();
    await ensureAttendanceRequestsTable();
    if (dialect === 'postgres') {
      console.log('[DB] Connected to PostgreSQL (Supabase / PG).');
    } else {
      console.log('[DB] Connected to MySQL/MariaDB successfully.');
    }
  }
};

module.exports = { sequelize, connectDB, dialect };
