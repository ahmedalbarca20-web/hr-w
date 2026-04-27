'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CompanyFeature = sequelize.define('CompanyFeature', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  company_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  feature_key: {
    type: DataTypes.STRING(60),
    allowNull: false,
  },
  is_enabled: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1,
  },
}, {
  tableName: 'company_features',
  indexes: [
    { fields: ['company_id'] },
    { unique: true, fields: ['company_id', 'feature_key'] },
  ],
});

module.exports = CompanyFeature;
