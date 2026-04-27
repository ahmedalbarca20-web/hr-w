'use strict';

/**
 * WorkShift
 *
 * Defines the expected daily schedule used by the Attendance Processing Engine.
 * One company can have multiple shifts; exactly one can be flagged is_default = 1.
 *
 * Columns
 * ───────
 *  shift_start                – expected start time  (TIME, e.g. "08:00:00")
 *  shift_end                  – expected end  time   (TIME, e.g. "17:00:00")
 *  standard_hours             – net work hours the employee should log per day
 *  grace_minutes              – tolerated lateness before late_minutes > 0
 *  overtime_threshold_minutes – extra minutes past standard_hours before OT counts
 */

const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db').sequelize;

class WorkShift extends Model {}

WorkShift.init(
  {
    id:         { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

    name   : { type: DataTypes.STRING(80), allowNull: false },
    name_ar: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },

    // Times stored as MySQL TIME — "HH:MM:SS"
    shift_start: { type: DataTypes.TIME, allowNull: false },
    shift_end  : { type: DataTypes.TIME, allowNull: false },

    // Net hours expected (e.g. 8.00 for a standard 8-hour day)
    standard_hours: {
      type        : DataTypes.DECIMAL(4, 2),
      allowNull   : false,
      defaultValue: 8.00,
    },

    // Minutes of leniency before arrival is marked late (default: no grace)
    grace_minutes: {
      type        : DataTypes.SMALLINT.UNSIGNED,
      allowNull   : false,
      defaultValue: 0,
    },

    // Minutes worked past standard_hours before overtime starts accumulating
    overtime_threshold_minutes: {
      type        : DataTypes.SMALLINT.UNSIGNED,
      allowNull   : false,
      defaultValue: 0,
    },

    // Only one shift per company should have is_default = 1
    is_default: {
      type        : DataTypes.TINYINT(1),
      allowNull   : false,
      defaultValue: 0,
    },

    is_active: {
      type        : DataTypes.TINYINT(1),
      allowNull   : false,
      defaultValue: 1,
    },

    /** Optional break window (same calendar day as shift) */
    break_start: { type: DataTypes.TIME, allowNull: true },
    break_end  : { type: DataTypes.TIME, allowNull: true },

    /** Optional check-in acceptance window (outside window punches are ignored for attendance calc). */
    checkin_window_start: { type: DataTypes.TIME, allowNull: true },
    checkin_window_end  : { type: DataTypes.TIME, allowNull: true },

    /** Optional check-out acceptance window (outside window punches are ignored for attendance calc). */
    checkout_window_start: { type: DataTypes.TIME, allowNull: true },
    checkout_window_end  : { type: DataTypes.TIME, allowNull: true },

    /**
     * Work weekdays as JS day numbers: 0 = Sunday … 6 = Saturday.
     * Example default Mon–Fri: [1,2,3,4,5]
     */
    work_days: {
      type         : DataTypes.JSON,
      allowNull    : true,
      defaultValue : [1, 2, 3, 4, 5],
    },

    /** First day of the work week for display / rules (0–6, same as work_days). */
    week_starts_on: {
      type         : DataTypes.SMALLINT,
      allowNull    : false,
      defaultValue : 6,
    },

    /** Company-specific holidays for this shift pattern (YYYY-MM-DD strings). */
    holidays: {
      type         : DataTypes.JSON,
      allowNull    : true,
      defaultValue : [],
    },
  },
  {
    sequelize,
    modelName  : 'WorkShift',
    tableName  : 'work_shifts',
    underscored: true,
    timestamps : true,
    createdAt  : 'created_at',
    updatedAt  : 'updated_at',
    indexes: [
      { fields: ['company_id'] },
      { fields: ['company_id', 'is_default'] },
      { fields: ['is_active'] },
    ],
  }
);

module.exports = WorkShift;
