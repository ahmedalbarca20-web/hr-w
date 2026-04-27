'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * companies table — top-level tenant for multi-company isolation.
 */
const Company = sequelize.define('Company', {
  id: {
    type          : DataTypes.INTEGER,
    primaryKey    : true,
    autoIncrement : true,
  },
  name: {
    type      : DataTypes.STRING(200),
    allowNull : false,
  },
  name_ar: {
    type         : DataTypes.STRING(200),
    allowNull    : false,
    defaultValue : '',
  },
  logo: {
    type      : DataTypes.STRING(500),
    allowNull : true,
  },
  phone: {
    type      : DataTypes.STRING(30),
    allowNull : true,
  },
  email: {
    type      : DataTypes.STRING(150),
    allowNull : true,
  },
  address: {
    type      : DataTypes.TEXT,
    allowNull : true,
  },
  tax_id: {
    type      : DataTypes.STRING(50),
    allowNull : true,
  },
  currency: {
    type         : DataTypes.STRING(10),
    allowNull    : false,
    defaultValue : 'IQD',
  },
  timezone: {
    type         : DataTypes.STRING(50),
    allowNull    : false,
    defaultValue : 'Asia/Baghdad',
  },
  is_active: {
    type         : DataTypes.TINYINT,
    allowNull    : false,
    defaultValue : 1,
  },
  contract_start: {
    type      : DataTypes.DATEONLY,
    allowNull : true,
    comment   : 'Start date of the subscription/contract',
  },
  contract_end: {
    type      : DataTypes.DATEONLY,
    allowNull : true,
    comment   : 'Expiry date of the subscription/contract',
  },
  contract_doc: {
    type      : DataTypes.STRING(500),
    allowNull : true,
    comment   : 'Path to the uploaded contract document',
  },
}, {
  tableName  : 'companies',
  indexes    : [{ fields: ['is_active'] }],
});

module.exports = Company;
