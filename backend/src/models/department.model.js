'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * departments table
 * Supports a self-referencing tree via parent_id (unlimited depth).
 * manager_id is a deferred FK to employees; wired in models/index.js.
 */
const Department = sequelize.define('Department', {
  id: {
    type          : DataTypes.INTEGER.UNSIGNED,
    primaryKey    : true,
    autoIncrement : true,
  },
  company_id: {
    type      : DataTypes.INTEGER.UNSIGNED,
    allowNull : false,
  },
  name: {
    type      : DataTypes.STRING(120),
    allowNull : false,
  },
  name_ar: {
    type         : DataTypes.STRING(120),
    allowNull    : false,
    defaultValue : '',
  },
  /**
   * Self-referencing parent — NULL means this is a root department.
   */
  parent_id: {
    type      : DataTypes.INTEGER.UNSIGNED,
    allowNull : true,
  },
  /**
   * FK to employees.id — set after Employee model is loaded.
   * Nullable because a department can exist without a manager.
   */
  manager_id: {
    type      : DataTypes.INTEGER.UNSIGNED,
    allowNull : true,
  },
  is_active: {
    type         : DataTypes.TINYINT,
    allowNull    : false,
    defaultValue : 1,
  },
}, {
  tableName : 'departments',
  indexes   : [
    { fields: ['company_id'] },
    { fields: ['parent_id'] },
    { fields: ['manager_id'] },
  ],
});

module.exports = Department;

