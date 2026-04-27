'use strict';

const { Op }          = require('sequelize');
const Announcement    = require('../models/announcement.model');
const { paginate, paginateResult } = require('../utils/pagination');

// ── Helpers ──────────────────────────────────────────────────────────────────

const notFound = (id) => Object.assign(new Error(`Announcement ${id} not found`), { statusCode: 404, code: 'NOT_FOUND' });

// ── List ─────────────────────────────────────────────────────────────────────

async function list(company_id, user, { page = 1, limit = 20 } = {}) {
  const where = {
    company_id,
    [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: new Date() } }],
  };

  // Employees see only announcements for their role or all-staff (target_role_id = null)
  const isAdminOrHR = ['ADMIN','HR','SUPER_ADMIN'].includes(user.role || '');
  if (!isAdminOrHR) {
    where[Op.and] = [{
      [Op.or]: [{ target_role_id: null }, { target_role_id: user.role_id }],
    }];
  }

  const { rows, count } = await Announcement.findAndCountAll({
    where,
    order: [['is_pinned','DESC'],['published_at','DESC'],['created_at','DESC']],
    ...paginate(page, limit),
  });
  return paginateResult(rows, count, page, limit);
}

// ── Get one ──────────────────────────────────────────────────────────────────

async function getById(id, company_id) {
  const ann = await Announcement.findOne({ where: { id, company_id } });
  if (!ann) throw notFound(id);
  return ann;
}

// ── Create ───────────────────────────────────────────────────────────────────

async function create(company_id, data, published_by) {
  return Announcement.create({
    ...data,
    company_id,
    published_by,
    published_at: data.published_at || new Date(),
  });
}

// ── Update ───────────────────────────────────────────────────────────────────

async function update(id, company_id, data) {
  const ann = await Announcement.findOne({ where: { id, company_id } });
  if (!ann) throw notFound(id);
  return ann.update(data);
}

// ── Delete ───────────────────────────────────────────────────────────────────

async function remove(id, company_id) {
  const ann = await Announcement.findOne({ where: { id, company_id } });
  if (!ann) throw notFound(id);
  await ann.destroy();
}

module.exports = { list, getById, create, update, remove };
