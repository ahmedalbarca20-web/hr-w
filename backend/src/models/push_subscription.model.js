'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Web Push subscriptions (one row per browser/device per user).
 */
const PushSubscription = sequelize.define('PushSubscription', {
  id: {
    type          : DataTypes.INTEGER.UNSIGNED,
    primaryKey    : true,
    autoIncrement : true,
  },
  user_id: {
    type      : DataTypes.INTEGER.UNSIGNED,
    allowNull : false,
  },
  company_id: {
    type      : DataTypes.INTEGER.UNSIGNED,
    allowNull : true,
  },
  endpoint_hash: {
    type      : DataTypes.STRING(64),
    allowNull : false,
  },
  endpoint: {
    type      : DataTypes.TEXT,
    allowNull : false,
  },
  p256dh: {
    type      : DataTypes.STRING(255),
    allowNull : false,
  },
  auth: {
    type      : DataTypes.STRING(255),
    allowNull : false,
  },
  user_agent: {
    type      : DataTypes.STRING(512),
    allowNull : true,
  },
}, {
  tableName : 'push_subscriptions',
  indexes   : [
    { fields: ['user_id'] },
    { fields: ['company_id'] },
    { unique: true, fields: ['user_id', 'endpoint_hash'] },
  ],
});

module.exports = PushSubscription;
