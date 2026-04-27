'use strict';

const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db').sequelize;

class AttendanceRequest extends Model {}

AttendanceRequest.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    employee_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    request_type: {
      type: DataTypes.ENUM('CHECK_IN', 'CHECK_OUT'),
      allowNull: false,
    },
    request_time: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    work_date: { type: DataTypes.DATEONLY, allowNull: false },
    gps_latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    gps_longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    gps_accuracy_m: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    photo_path: { type: DataTypes.STRING(255), allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    reviewed_by: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    rejection_reason: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'AttendanceRequest',
    tableName: 'attendance_requests',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['company_id'] },
      { fields: ['employee_id'] },
      { fields: ['status'] },
      { fields: ['work_date'] },
      { fields: ['request_type'] },
    ],
  },
);

module.exports = AttendanceRequest;
