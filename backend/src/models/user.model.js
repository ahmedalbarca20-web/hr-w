'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * users table — authentication accounts.
 *
 * One user per employee (or one super-admin without an employee row).
 * company_id = NULL → super-admin account; bypasses all company isolation.
 */
const User = sequelize.define('User', {
  id: {
    type          : DataTypes.INTEGER.UNSIGNED,
    primaryKey    : true,
    autoIncrement : true,
  },
  company_id: {
    type      : DataTypes.INTEGER.UNSIGNED,
    allowNull : true,   // NULL for super-admin accounts
  },
  employee_id: {
    type      : DataTypes.INTEGER.UNSIGNED,
    allowNull : true,   // NULL for super-admin accounts
  },
  role_id: {
    type      : DataTypes.INTEGER.UNSIGNED,
    allowNull : false,
  },
  email: {
    type         : DataTypes.STRING(150),
    allowNull    : false,
    validate     : { isEmail: true },
  },
  password_hash: {
    type      : DataTypes.STRING(255),
    allowNull : false,
  },
  is_active: {
    type         : DataTypes.TINYINT,
    allowNull    : false,
    defaultValue : 1,
  },
  last_login: {
    type      : DataTypes.DATE,
    allowNull : true,
  },
  /**
   * Refresh token is stored HASHED in the DB.
   * Comparing raw token (from cookie) against this hash
   * prevents token theft if the DB is compromised.
   */
  refresh_token: {
    type      : DataTypes.STRING(512),
    allowNull : true,
  },
}, {
  tableName : 'users',
  hooks: {
    beforeValidate(user) {
      if (user.email) user.email = user.email.trim().toLowerCase();
    },
  },
  indexes   : [
    { unique: true, fields: ['email'] },
    { fields: ['company_id'] },
    { fields: ['employee_id'] },
    { fields: ['role_id'] },
    { fields: ['is_active'] },
  ],
});

module.exports = User;

