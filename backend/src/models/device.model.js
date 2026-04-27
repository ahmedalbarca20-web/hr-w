'use strict';

/**
 * Two models in one file:
 *   Device     – registered biometric/RFID/face reader per company
 *   DeviceLog  – raw push log from a device (pre-processing)
 */

const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db').sequelize;

// ── Device ───────────────────────────────────────────────────────────────────

class Device extends Model {}

Device.init(
  {
    id:         { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

    /** Optional link to departments (فرع / قسم) within the same company. */
    department_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

    name            : { type: DataTypes.STRING(100), allowNull: false },
    serial_number   : { type: DataTypes.STRING(80),  allowNull: false },
    location        : { type: DataTypes.STRING(150), allowNull: true },
    /** IPv4, IPv6, or hostname — column name kept for compatibility. */
    ip_address      : { type: DataTypes.STRING(255), allowNull: true },
    firmware_version: { type: DataTypes.STRING(30),  allowNull: true },

    /**
     * type  – the hardware input method
     *   FINGERPRINT  – fingerprint reader
     *   CARD         – RFID / NFC card reader
     *   FACE         – face recognition
     *   PIN          – numeric PIN pad
     *   HYBRID       – combination (e.g. finger + card)
     */
    type: {
      type: DataTypes.ENUM('FINGERPRINT', 'CARD', 'FACE', 'PIN', 'HYBRID'),
      allowNull: false,
      defaultValue: 'FINGERPRINT',
    },

    /**
     * mode – operating mode
     *   ATTENDANCE   – logs create attendance records (normal mode)
     *   VERIFY_ONLY  – device only verifies identity; logs are stored
     *                  but NOT processed into attendance records
     */
    mode: {
      type: DataTypes.ENUM('ATTENDANCE', 'VERIFY_ONLY'),
      allowNull: false,
      defaultValue: 'ATTENDANCE',
    },

    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'OFFLINE'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },

    /**
     * api_key – secret token the device sends in X-Device-Key header.
     * Stored as a plain UUID; rotate via dedicated endpoint.
     */
    api_key: { type: DataTypes.STRING(64), allowNull: false },

    last_sync: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName  : 'Device',
    tableName  : 'devices',
    underscored: true,
    timestamps : true,
    createdAt  : 'created_at',
    updatedAt  : 'updated_at',
    indexes: [
      { unique: true, fields: ['company_id', 'serial_number'] },
      { fields: ['company_id'] },
      { fields: ['department_id'] },
      { fields: ['status'] },
      { fields: ['mode'] },
    ],
  }
);

// ── DeviceLog ────────────────────────────────────────────────────────────────

class DeviceLog extends Model {}

DeviceLog.init(
  {
    id:          { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    company_id:  { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    device_id:   { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

    /**
     * employee_id – resolved at push time if card_number maps to a known employee.
     * NULL means the card/finger was not matched in the system at push time.
     */
    employee_id : { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

    /**
     * card_number – raw identifier sent by the device (card UID, enrollment ID, etc.)
     * Always stored verbatim for audit trail regardless of resolution status.
     */
    card_number : { type: DataTypes.STRING(80), allowNull: false },

    event_type: {
      type: DataTypes.ENUM('CHECK_IN', 'CHECK_OUT', 'VERIFY', 'ALARM', 'OTHER'),
      allowNull: false,
      defaultValue: 'CHECK_IN',
    },

    /** event_time – timestamp reported by the device (may differ from server time) */
    event_time : { type: DataTypes.DATE, allowNull: false },

    /** raw_payload – full JSON body sent by the device, archived verbatim */
    raw_payload: { type: DataTypes.JSON, allowNull: true },

    /**
     * is_duplicate – 1 if (device_id, card_number, event_type, event_time)
     * already existed when this log was pushed.  Duplicate logs are stored
     * (for audit) but never re-processed.
     */
    is_duplicate: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },

    /**
     * is_verify_only – 1 when the originating device was in VERIFY_ONLY mode.
     * These logs are never used to create attendance records.
     */
    is_verify_only: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },

    /**
     * processed – 1 once the log has been forwarded to the attendance layer.
     * Only applies when is_duplicate=0 AND is_verify_only=0.
     */
    processed: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },
    is_surprise: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },
    surprise_event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  },
  {
    sequelize,
    modelName  : 'DeviceLog',
    tableName  : 'device_logs',
    underscored: true,
    timestamps : true,
    createdAt  : 'created_at',
    updatedAt  : false,
    indexes: [
      // Deduplication index — the unique constraint that powers dedup checks
      { unique: true, name: 'uq_device_log_dedup',
        fields: ['device_id', 'card_number', 'event_type', 'event_time'] },
      { fields: ['company_id'] },
      { fields: ['device_id'] },
      { fields: ['employee_id'] },
      { fields: ['event_time'] },
      { fields: ['event_type'] },
      { fields: ['is_duplicate'] },
      { fields: ['is_verify_only'] },
      { fields: ['processed'] },
      { fields: ['is_surprise'] },
      { fields: ['surprise_event_id'] },
    ],
  }
);

module.exports = { Device, DeviceLog };
