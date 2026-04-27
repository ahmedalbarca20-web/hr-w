'use strict';

const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db').sequelize;

class Announcement extends Model {}

Announcement.init(
  {
    id:         { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

    title:    { type: DataTypes.STRING(200), allowNull: false },
    title_ar: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
    body:     { type: DataTypes.TEXT,        allowNull: false },
    body_ar:  { type: DataTypes.TEXT,        allowNull: false, defaultValue: '' },

    target_role_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    published_by:   { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    published_at:   { type: DataTypes.DATE,              allowNull: true },
    expires_at:     { type: DataTypes.DATE,              allowNull: true },
    is_pinned:      { type: DataTypes.TINYINT(1),        allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    modelName  : 'Announcement',
    tableName  : 'announcements',
    underscored: true,
    timestamps : true,
    createdAt  : 'created_at',
    updatedAt  : 'updated_at',
    indexes: [
      { fields: ['company_id'] },
      { fields: ['published_at'] },
      { fields: ['expires_at'] },
    ],
  }
);

module.exports = Announcement;
