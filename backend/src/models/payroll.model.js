'use strict';

/**
 * Five related models:
 *   SalaryComponent          – company-wide components
 *   EmployeeSalaryComponent  – per-employee overrides / assignments
 *   PayrollRun               – monthly run header
 *   PayrollItem              – one row per employee per run
 *   PayrollItemComponent     – line-item breakdown in a payslip
 */

const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db').sequelize;

// ── SalaryComponent ──────────────────────────────────────────

class SalaryComponent extends Model {}

SalaryComponent.init(
  {
    id:         { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    name:    { type: DataTypes.STRING(100), allowNull: false },
    name_ar: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    type: { type: DataTypes.ENUM('ADDITION','DEDUCTION'), allowNull: false },
    is_percentage:  { type: DataTypes.TINYINT(1),  allowNull: false, defaultValue: 0 },
    value:          { type: DataTypes.DECIMAL(10,4),allowNull: false, defaultValue: 0 },
    is_taxable:     { type: DataTypes.TINYINT(1),  allowNull: false, defaultValue: 0 },
    applies_to_all: { type: DataTypes.TINYINT(1),  allowNull: false, defaultValue: 1 },
    is_active:      { type: DataTypes.TINYINT(1),  allowNull: false, defaultValue: 1 },
  },
  {
    sequelize, modelName: 'SalaryComponent', tableName: 'salary_components',
    underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
    indexes: [{ fields: ['company_id'] }, { fields: ['type'] }, { fields: ['is_active'] }],
  }
);

// ── EmployeeSalaryComponent ──────────────────────────────────

class EmployeeSalaryComponent extends Model {}

EmployeeSalaryComponent.init(
  {
    id:             { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    company_id:     { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    employee_id:    { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    component_id:   { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    override_value: { type: DataTypes.DECIMAL(10,4),   allowNull: true },
    effective_from: { type: DataTypes.DATEONLY,         allowNull: false },
    effective_to:   { type: DataTypes.DATEONLY,         allowNull: true },
  },
  {
    sequelize, modelName: 'EmployeeSalaryComponent', tableName: 'employee_salary_components',
    underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false,
    indexes: [{ fields: ['company_id'] }, { fields: ['employee_id'] }, { fields: ['component_id'] }],
  }
);

// ── PayrollRun ───────────────────────────────────────────────

class PayrollRun extends Model {}

PayrollRun.init(
  {
    id:         { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    run_month:  { type: DataTypes.TINYINT,          allowNull: false },
    run_year:   { type: DataTypes.SMALLINT,          allowNull: false },
    status: {
      type: DataTypes.ENUM('DRAFT','PROCESSING','APPROVED','PAID','CANCELLED'),
      allowNull: false, defaultValue: 'DRAFT',
    },
    total_employees:  { type: DataTypes.INTEGER,       allowNull: false, defaultValue: 0 },
    total_gross:      { type: DataTypes.DECIMAL(15,2), allowNull: false, defaultValue: 0 },
    total_deductions: { type: DataTypes.DECIMAL(15,2), allowNull: false, defaultValue: 0 },
    total_net:        { type: DataTypes.DECIMAL(15,2), allowNull: false, defaultValue: 0 },
    notes:        { type: DataTypes.TEXT,              allowNull: true },
    processed_by: { type: DataTypes.INTEGER.UNSIGNED,  allowNull: true },
    processed_at: { type: DataTypes.DATE,              allowNull: true },
    approved_by:  { type: DataTypes.INTEGER.UNSIGNED,  allowNull: true },
    approved_at:  { type: DataTypes.DATE,              allowNull: true },
  },
  {
    sequelize, modelName: 'PayrollRun', tableName: 'payroll_runs',
    underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['company_id','run_month','run_year'] },
      { fields: ['company_id'] }, { fields: ['status'] }, { fields: ['run_year','run_month'] },
    ],
  }
);

// ── PayrollItem ──────────────────────────────────────────────

class PayrollItem extends Model {}

PayrollItem.init(
  {
    id:             { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    company_id:     { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    payroll_run_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    employee_id:    { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    working_days:       { type: DataTypes.TINYINT,          allowNull: false, defaultValue: 30 },
    actual_days:        { type: DataTypes.DECIMAL(5,1),      allowNull: false, defaultValue: 0 },
    absent_days:        { type: DataTypes.DECIMAL(5,1),      allowNull: false, defaultValue: 0 },
    paid_leave_days:    { type: DataTypes.DECIMAL(5,1),      allowNull: false, defaultValue: 0 },
    unpaid_leave_days:  { type: DataTypes.DECIMAL(5,1),      allowNull: false, defaultValue: 0 },
    overtime_minutes:   { type: DataTypes.INTEGER,           allowNull: false, defaultValue: 0 },
    late_minutes:       { type: DataTypes.INTEGER,           allowNull: false, defaultValue: 0 },
    // leave_days kept as total (paid + unpaid) for compatibility
    leave_days:         { type: DataTypes.DECIMAL(5,1),      allowNull: false, defaultValue: 0 },
    base_salary:        { type: DataTypes.DECIMAL(12,2),     allowNull: false, defaultValue: 0 },
    total_additions:  { type: DataTypes.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
    total_deductions: { type: DataTypes.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
    gross_salary:     { type: DataTypes.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
    tax_amount:       { type: DataTypes.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
    net_salary:       { type: DataTypes.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize, modelName: 'PayrollItem', tableName: 'payroll_items',
    underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['company_id','payroll_run_id','employee_id'] },
      { fields: ['company_id'] }, { fields: ['payroll_run_id'] }, { fields: ['employee_id'] },
    ],
  }
);

// ── PayrollItemComponent ─────────────────────────────────────

class PayrollItemComponent extends Model {}

PayrollItemComponent.init(
  {
    id:              { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    company_id:      { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    payroll_item_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    // NULL for auto-calculated items (overtime, absence deduction, etc.)
    component_id:    { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    component_name:  { type: DataTypes.STRING(100),      allowNull: false },
    type: { type: DataTypes.ENUM('ADDITION','DEDUCTION'), allowNull: false },
    amount: { type: DataTypes.DECIMAL(12,2), allowNull: false, defaultValue: 0 },
    // COMPONENT = from a SalaryComponent row; AUTO = engine-calculated
    source: {
      type        : DataTypes.ENUM('COMPONENT', 'AUTO'),
      allowNull   : false,
      defaultValue: 'COMPONENT',
    },
  },
  {
    sequelize, modelName: 'PayrollItemComponent', tableName: 'payroll_item_components',
    underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false,
    indexes: [
      { fields: ['company_id'] }, { fields: ['payroll_item_id'] }, { fields: ['component_id'] },
    ],
  }
);

module.exports = { SalaryComponent, EmployeeSalaryComponent, PayrollRun, PayrollItem, PayrollItemComponent };

