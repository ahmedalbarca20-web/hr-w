'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * roles table
 * - company_id: tenant isolation (NULL for super-admin system roles)
 * - is_system:  1 = built-in role that cannot be deleted
 * - permissions: JSON array of string keys, e.g. ["employees:read", "payroll:write"]
 */
const Role = sequelize.define('Role', {
  id: {
    type          : DataTypes.INTEGER.UNSIGNED,
    primaryKey    : true,
    autoIncrement : true,
  },
  company_id: {
    type      : DataTypes.INTEGER.UNSIGNED,
    allowNull : true,   // NULL  super-admin system roles belong to no company
  },
  name: {
    type      : DataTypes.STRING(80),
    allowNull : false,
  },
  name_ar: {
    type         : DataTypes.STRING(80),
    allowNull    : false,
    defaultValue : '',
  },
  permissions: {
    type         : DataTypes.JSON,
    allowNull    : true,
    defaultValue : [],
    comment      : 'Array of permission strings e.g. ["employees:read"]',
  },
  is_system: {
    type         : DataTypes.TINYINT,
    allowNull    : false,
    defaultValue : 0,
    comment      : '1 = built-in role, cannot be deleted via API',
  },
}, {
  tableName : 'roles',
  indexes   : [
    { fields: ['company_id'] },
    { unique: true, fields: ['company_id', 'name'] },
  ],
});

module.exports = Role;
