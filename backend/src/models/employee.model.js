'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * employees table
 *
 * Key constraints enforced at DB level (via schema):
 *   UNIQUE (company_id, employee_number)
 *   UNIQUE (company_id, national_id)   where national_id IS NOT NULL
 *
 * Soft-delete: set deleted_at instead of hard deleting.
 * All list queries must include `WHERE deleted_at IS NULL`.
 */
const Employee = sequelize.define('Employee', {
  id: {
    type          : DataTypes.INTEGER.UNSIGNED,
    primaryKey    : true,
    autoIncrement : true,
  },
  company_id: {
    type      : DataTypes.INTEGER.UNSIGNED,
    allowNull : false,
  },
  employee_number: {
    type      : DataTypes.STRING(30),
    allowNull : false,
  },

  // ── Personal info ─────────────────────────────────────────
  first_name: {
    type      : DataTypes.STRING(80),
    allowNull : false,
  },
  last_name: {
    type      : DataTypes.STRING(80),
    allowNull : false,
  },
  first_name_ar: {
    type         : DataTypes.STRING(80),
    allowNull    : false,
    defaultValue : '',
  },
  last_name_ar: {
    type         : DataTypes.STRING(80),
    allowNull    : false,
    defaultValue : '',
  },
  gender: {
    type         : DataTypes.ENUM('MALE', 'FEMALE', 'OTHER'),
    allowNull    : false,
    defaultValue : 'MALE',
  },
  birth_date: {
    type      : DataTypes.DATEONLY,
    allowNull : true,
  },
  national_id: {
    type      : DataTypes.STRING(30),
    allowNull : true,
  },
  nationality: {
    type      : DataTypes.STRING(60),
    allowNull : true,
  },
  marital_status: {
    type      : DataTypes.ENUM('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'),
    allowNull : true,
  },
  phone: {
    type      : DataTypes.STRING(30),
    allowNull : true,
  },
  email: {
    type      : DataTypes.STRING(150),
    allowNull : true,
    validate  : { isEmail: true },
  },
  address: {
    type      : DataTypes.TEXT,
    allowNull : true,
  },
  photo: {
    type      : DataTypes.STRING(500),
    allowNull : true,
  },

  // ── Employment info ───────────────────────────────────────
  hire_date: {
    type      : DataTypes.DATEONLY,
    allowNull : false,
  },
  termination_date: {
    type      : DataTypes.DATEONLY,
    allowNull : true,
  },
  contract_type: {
    type         : DataTypes.ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'),
    allowNull    : false,
    defaultValue : 'FULL_TIME',
  },
  /**
   * Status lifecycle:
   *   ACTIVE → ON_LEAVE   (approved leave)
   *   ACTIVE → INACTIVE   (admin override)
   *   ACTIVE → TERMINATED (termination + termination_date set)
   */
  status: {
    type         : DataTypes.ENUM('ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE'),
    allowNull    : false,
    defaultValue : 'ACTIVE',
  },
  department_id: {
    type      : DataTypes.INTEGER.UNSIGNED,
    allowNull : true,
  },
  position_id: {
    type      : DataTypes.INTEGER.UNSIGNED,
    allowNull : true,
  },
  /** Direct manager (self-referencing). */
  manager_id: {
    type      : DataTypes.INTEGER.UNSIGNED,
    allowNull : true,
  },

  /**
   * Assigned work shift — used by the Attendance Processing Engine.
   * When null, the company's default work shift is used instead.
   */
  shift_id: {
    type      : DataTypes.INTEGER.UNSIGNED,
    allowNull : true,
  },

  // ── Banking ───────────────────────────────────────────────
  bank_name: {
    type      : DataTypes.STRING(100),
    allowNull : true,
  },
  bank_account: {
    type      : DataTypes.STRING(60),
    allowNull : true,
  },
  iban: {
    type      : DataTypes.STRING(34),
    allowNull : true,
  },

  // ── Salary snapshot ───────────────────────────────────────
  base_salary: {
    type         : DataTypes.DECIMAL(12, 2),
    allowNull    : false,
    defaultValue : 0.00,
  },

  // ── Soft delete ───────────────────────────────────────────
  deleted_at: {
    type      : DataTypes.DATE,
    allowNull : true,
  },
}, {
  tableName  : 'employees',
  paranoid   : false,   // manual soft-delete via deleted_at (not Sequelize paranoid)
  indexes    : [
    { unique: true, fields: ['company_id', 'employee_number'] },
    { fields: ['company_id'] },
    { fields: ['department_id'] },
    { fields: ['position_id'] },
    { fields: ['manager_id'] },
    { fields: ['status'] },
    { fields: ['hire_date'] },
    { fields: ['deleted_at'] },
  ],
  defaultScope: {
    where: { deleted_at: null },  // never return soft-deleted rows by default
  },
  scopes: {
    withDeleted: { where: {} },
  },
});

module.exports = Employee;

