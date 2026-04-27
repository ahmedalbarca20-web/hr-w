'use strict';

/**
 * Three related models in one file:
 *   LeaveType     – leave-type catalogue per company
 *   LeaveBalance  – annual entitlement per employee/type/year
 *   LeaveRequest  – individual leave requests
 */

const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db').sequelize;

// ── LeaveType ────────────────────────────────────────────────

class LeaveType extends Model {}

LeaveType.init(
  {
    id:         { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

    name:    { type: DataTypes.STRING(100), allowNull: false },
    name_ar: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },

    max_days_per_year: { type: DataTypes.SMALLINT,   allowNull: false, defaultValue: 0 },
    is_paid:           { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 1 },
    carry_forward:     { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },
    max_carry_days:    { type: DataTypes.SMALLINT,   allowNull: false, defaultValue: 0 },
    requires_approval: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 1 },
    gender_specific: {
      type: DataTypes.ENUM('ALL','MALE','FEMALE'),
      allowNull: false,
      defaultValue: 'ALL',
    },
    is_active: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 1 },
  },
  {
    sequelize,
    modelName  : 'LeaveType',
    tableName  : 'leave_types',
    underscored: true,
    timestamps : true,
    createdAt  : 'created_at',
    updatedAt  : 'updated_at',
    indexes: [{ fields: ['company_id'] }, { fields: ['is_active'] }],
  }
);

// ── LeaveBalance ─────────────────────────────────────────────

class LeaveBalance extends Model {}

LeaveBalance.init(
  {
    id:            { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    company_id:    { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    employee_id:   { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    leave_type_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    year:          { type: DataTypes.SMALLINT,          allowNull: false },
    total_days:    { type: DataTypes.DECIMAL(6,1),      allowNull: false, defaultValue: 0.0 },
    used_days:     { type: DataTypes.DECIMAL(6,1),      allowNull: false, defaultValue: 0.0 },
    pending_days:  { type: DataTypes.DECIMAL(6,1),      allowNull: false, defaultValue: 0.0 },
    // remaining_days is a GENERATED column in MySQL — read-only in Sequelize
  },
  {
    sequelize,
    modelName  : 'LeaveBalance',
    tableName  : 'leave_balances',
    underscored: true,
    timestamps : true,
    createdAt  : false,
    updatedAt  : 'updated_at',
    indexes: [
      { unique: true, fields: ['company_id','employee_id','leave_type_id','year'] },
      { fields: ['company_id'] }, { fields: ['employee_id'] }, { fields: ['year'] },
    ],
  }
);

// ── LeaveRequest ─────────────────────────────────────────────

class LeaveRequest extends Model {}

LeaveRequest.init(
  {
    id:            { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    company_id:    { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    employee_id:   { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    leave_type_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

    start_date:  { type: DataTypes.DATEONLY,     allowNull: false },
    end_date:    { type: DataTypes.DATEONLY,     allowNull: false },
    total_days:  { type: DataTypes.DECIMAL(6,1), allowNull: false, defaultValue: 1.0 },
    reason:      { type: DataTypes.TEXT,         allowNull: true },

    status: {
      type: DataTypes.ENUM('PENDING','APPROVED','REJECTED','CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    approved_by:      { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    approved_at:      { type: DataTypes.DATE,              allowNull: true },
    rejection_reason: { type: DataTypes.TEXT,              allowNull: true },
  },
  {
    sequelize,
    modelName  : 'LeaveRequest',
    tableName  : 'leave_requests',
    underscored: true,
    timestamps : true,
    createdAt  : 'created_at',
    updatedAt  : 'updated_at',
    indexes: [
      { fields: ['company_id'] }, { fields: ['employee_id'] },
      { fields: ['leave_type_id'] }, { fields: ['status'] }, { fields: ['start_date'] },
    ],
  }
);

module.exports = { LeaveType, LeaveBalance, LeaveRequest };

