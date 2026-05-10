'use strict';

const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db').sequelize;

class AgentJob extends Model {}

AgentJob.init(
  {
    id: { type: DataTypes.STRING(32), primaryKey: true },
    agent_id: { type: DataTypes.STRING(64), allowNull: false },
    action: { type: DataTypes.STRING(40), allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    error: { type: DataTypes.JSON, allowNull: true },
    result: { type: DataTypes.JSON, allowNull: true },
    timeout_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 800 },
    started_at: { type: DataTypes.DATE, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'agent_jobs',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

module.exports = { AgentJob };
