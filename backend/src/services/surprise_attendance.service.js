'use strict';

const { Op } = require('sequelize');
const SurpriseAttendanceEvent = require('../models/surprise_attendance.model');
const Announcement = require('../models/announcement.model');

async function expirePastEvents(company_id) {
  await SurpriseAttendanceEvent.update(
    { status: 'EXPIRED' },
    {
      where: {
        company_id,
        status: 'ACTIVE',
        ends_at: { [Op.lt]: new Date() },
      },
    }
  );
}

async function activate(company_id, created_by, { duration_minutes, title, message }) {
  await expirePastEvents(company_id);

  const now = new Date();
  const end = new Date(now.getTime() + Number(duration_minutes) * 60000);

  const event = await SurpriseAttendanceEvent.create({
    company_id,
    title: title || 'بصمة مفاجئة',
    message: message || 'يرجى البصمة خلال الوقت المحدد.',
    starts_at: now,
    ends_at: end,
    duration_minutes: Number(duration_minutes),
    status: 'ACTIVE',
    created_by,
  });

  // Notification for all staff via existing announcement channel.
  await Announcement.create({
    company_id,
    title: `بصمة مفاجئة (${duration_minutes} دقيقة)`,
    title_ar: `بصمة مفاجئة (${duration_minutes} دقيقة)`,
    body: message || `تم تفعيل بصمة مفاجئة. الرجاء البصمة خلال ${duration_minutes} دقيقة.`,
    body_ar: message || `تم تفعيل بصمة مفاجئة. الرجاء البصمة خلال ${duration_minutes} دقيقة.`,
    target_role_id: null,
    published_by: created_by || null,
    published_at: now,
    expires_at: end,
    is_pinned: 1,
  });

  return event;
}

async function getActive(company_id) {
  await expirePastEvents(company_id);
  return SurpriseAttendanceEvent.findOne({
    where: {
      company_id,
      status: 'ACTIVE',
      starts_at: { [Op.lte]: new Date() },
      ends_at: { [Op.gte]: new Date() },
    },
    order: [['id', 'DESC']],
  });
}

/** End surprise mode immediately: mark all still-ACTIVE events for this company as cancelled. */
async function cancelActive(company_id) {
  await expirePastEvents(company_id);
  const [affected] = await SurpriseAttendanceEvent.update(
    { status: 'CANCELLED' },
    {
      where: {
        company_id,
        status: 'ACTIVE',
      },
    },
  );
  return { cancelled_count: affected };
}

module.exports = { activate, getActive, cancelActive };
