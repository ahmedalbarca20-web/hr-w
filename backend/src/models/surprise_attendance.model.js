'use strict';

const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db').sequelize;

class SurpriseAttendanceEvent extends Model {}

SurpriseAttendanceEvent.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    title: { type: DataTypes.STRING(150), allowNull: false, defaultValue: 'Surprise attendance check' },
    message: { type: DataTypes.TEXT, allowNull: true },
    starts_at: { type: DataTypes.DATE, allowNull: false },
    ends_at: { type: DataTypes.DATE, allowNull: false },
    duration_minutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'EXPIRED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    created_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  },
  {
    sequelize,
    modelName: 'SurpriseAttendanceEvent',
    tableName: 'surprise_attendance_events',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['company_id'] },
      { fields: ['status'] },
      { fields: ['starts_at'] },
      { fields: ['ends_at'] },
    ],
  }
);

module.exports = SurpriseAttendanceEvent;
