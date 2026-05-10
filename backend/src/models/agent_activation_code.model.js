'use strict';

const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db').sequelize;

/**
 * One-time or reusable office installer codes. POST /api/agent/activate exchanges code for agent config.
 */
class AgentActivationCode extends Model {}

AgentActivationCode.init(
  {
    id: { type: DataTypes.STRING(32), primaryKey: true },
    code: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    agent_id: { type: DataTypes.STRING(64), allowNull: false },
    /** If set, returned to installer instead of global AGENT_SHARED_TOKEN (per-office secret). */
    agent_token: { type: DataTypes.STRING(512), allowNull: true },
    poll_interval_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3000 },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    last_used_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'agent_activation_codes',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

module.exports = { AgentActivationCode };
