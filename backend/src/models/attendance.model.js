'use strict';

const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db').sequelize;

class Attendance extends Model {}

Attendance.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },

    company_id:  { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    employee_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

    work_date:  { type: DataTypes.DATEONLY, allowNull: false },
    check_in:   { type: DataTypes.DATE,    allowNull: true },
    check_out:  { type: DataTypes.DATE,    allowNull: true },

    total_minutes:    { type: DataTypes.SMALLINT, allowNull: true },
    overtime_minutes: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    late_minutes:     { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },

    // Virtual: total_hours derived from total_minutes — included in all query results
    total_hours: {
      type: DataTypes.VIRTUAL,
      get() {
        const m = this.getDataValue('total_minutes');
        return m !== null && m !== undefined ? +(m / 60).toFixed(2) : null;
      },
    },

    status: {
      type: DataTypes.ENUM('PRESENT','ABSENT','LATE','HALF_DAY','HOLIDAY','WEEKEND','ON_LEAVE'),
      allowNull: false,
      defaultValue: 'PRESENT',
    },
    is_surprise: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },
    surprise_event_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    surprise_punch_time: { type: DataTypes.DATE, allowNull: true },
    source: {
      type: DataTypes.ENUM('MANUAL','DEVICE','IMPORT'),
      allowNull: false,
      defaultValue: 'MANUAL',
    },
    notes:      { type: DataTypes.TEXT,              allowNull: true },
    created_by: { type: DataTypes.INTEGER.UNSIGNED,  allowNull: true },
  },
  {
    sequelize,
    modelName  : 'Attendance',
    tableName  : 'attendance',
    underscored: true,
    timestamps : true,
    updatedAt  : 'updated_at',
    createdAt  : 'created_at',
    indexes: [
      { unique: true, fields: ['company_id', 'employee_id', 'work_date'] },
      { fields: ['company_id'] },
      { fields: ['employee_id'] },
      { fields: ['work_date'] },
      { fields: ['status'] },
      { fields: ['is_surprise'] },
      { fields: ['surprise_event_id'] },
      { fields: ['surprise_punch_time'] },
    ],
  }
);

module.exports = Attendance;

