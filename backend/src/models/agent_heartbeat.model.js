'use strict';

const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db').sequelize;

class AgentHeartbeat extends Model {}

AgentHeartbeat.init(
  {
    agent_id: { type: DataTypes.STRING(64), primaryKey: true },
    company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    last_seen_at: { type: DataTypes.DATE, allowNull: false },
    agent_version: { type: DataTypes.STRING(64), allowNull: true },
    hostname: { type: DataTypes.STRING(128), allowNull: true },
    meta: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    tableName: 'agent_heartbeats',
    underscored: true,
    timestamps: false,
  },
);

module.exports = { AgentHeartbeat };
