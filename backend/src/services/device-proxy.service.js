const { badReq, notFound } = require('../utils/errors');
const { Device, Company } = require('../models');
const { calendarDateKeyInZone } = require('../utils/timezone');
const { pushLogs } = require('./device.service');
const {
  zkAttendanceToPushLog,
  buildZkPinToDisplayName,
  applyAlternatingInOutForInferredLogs,
} = require('../utils/zkAttendanceMapper');

async function importZkUsersToEmployeesDirect(device_id, company_id, opts = {}) {
  if (company_id == null || !Number.isFinite(Number(company_id)) || Number(company_id) < 1) {
    throw badReq('company_id is required');
  }

  const employeeSvc = require('./employee.service');
  const users = Array.isArray(opts.users) ? opts.users : [];
  if (users.length === 0) throw badReq('No valid device users provided');

  const results = [];
  for (const u of users) {
    const row = await employeeSvc.upsertFromZkUser(company_id, u);
    const pin = u.password != null ? String(u.password).replace(/\0/g, '').trim() : '';
    results.push(pin ? { ...row, zk_device_password: pin } : row);
  }

  const dev = await Device.findOne({ where: { id: device_id, company_id } });
  if (dev) await dev.update({ last_sync: new Date() });

  return { device: dev ? { id: dev.id, name: dev.name } : null, imported: results.length, results };
}

async function importZkAttendancesDirectToDeviceLogs(device_id, company_id, payload = {}) {
  if (company_id == null || !Number.isFinite(Number(company_id)) || Number(company_id) < 1) {
    throw badReq('company_id is required');
  }

  const options = payload.options || {};
  const date_from = options.date_from ?? null;
  const date_to = options.date_to ?? null;
  const max_records = options.max_records ?? 8000;
  const auto_process = Boolean(options.auto_process);
  const overwrite_attendance = options.overwrite_attendance !== false;

  const dev = await Device.findOne({ where: { id: device_id, company_id } });
  if (!dev) throw notFound(device_id);

  const co = await Company.findByPk(company_id, { attributes: ['timezone'] }).catch(() => null);
  const companyTz = co?.timezone || 'Asia/Baghdad';

  const zkPull = {
    ok: true,
    connection_type: 'local_agent_direct_frontend',
    attendance_size: payload.attendance_size ?? (Array.isArray(payload.records) ? payload.records.length : null),
    records: Array.isArray(payload.records) ? payload.records : [],
    device_users: Array.isArray(payload.device_users) ? payload.device_users : [],
    errors: Array.isArray(payload.errors) ? payload.errors : [],
    attendance_retry_without_disable: Boolean(payload.attendance_retry_without_disable),
  };

  const zkNameByPin = buildZkPinToDisplayName(zkPull.device_users);
  let mapped = [];
  let decoded_rows = 0;
  let rejected_bad_decode = 0;
  let rejected_by_date = 0;
  const sample_dates_outside_range = [];

  const staging = [];
  for (const row of zkPull.records) {
    const log = zkAttendanceToPushLog(row, zkNameByPin);
    if (!log) {
      rejected_bad_decode += 1;
      continue;
    }
    decoded_rows += 1;
    staging.push(log);
  }

  applyAlternatingInOutForInferredLogs(staging, companyTz, dev.mode);

  for (const log of staging) {
    const dk = calendarDateKeyInZone(log.event_time, companyTz);
    if (!dk) continue;
    if (date_from && dk < date_from) {
      rejected_by_date += 1;
      if (sample_dates_outside_range.length < 8) sample_dates_outside_range.push(dk);
      continue;
    }
    if (date_to && dk > date_to) {
      rejected_by_date += 1;
      if (sample_dates_outside_range.length < 8) sample_dates_outside_range.push(dk);
      continue;
    }
    mapped.push(log);
  }

  const pull_diagnostics = {
    company_timezone: companyTz,
    date_from,
    date_to,
    records_raw: zkPull.records.length,
    decoded_rows,
    rejected_bad_decode,
    rejected_by_date,
    sample_dates_outside_range: [...new Set(sample_dates_outside_range)],
    zk_errors: zkPull.errors,
  };

  const seenPunch = new Set();
  mapped = mapped.filter((log) => {
    const card = String(log.card_number || '').trim().toUpperCase();
    const k = `${card}|${log.event_type}|${log.event_time}`;
    if (seenPunch.has(k)) return false;
    seenPunch.add(k);
    return true;
  });

  const cap = Math.min(20000, Math.max(1, Number(max_records) || 8000));
  mapped.sort((a, b) => new Date(b.event_time) - new Date(a.event_time));
  if (mapped.length > cap) mapped = mapped.slice(0, cap);
  mapped.sort((a, b) => new Date(a.event_time) - new Date(b.event_time));

  const datesSet = new Set();
  for (const log of mapped) {
    const dk = calendarDateKeyInZone(log.event_time, companyTz);
    if (dk) datesSet.add(dk);
  }

  const rawBody = {
    _meta: {
      source: 'zk_attendance_pull_frontend_proxy',
      device_id: dev.id,
      at: new Date().toISOString(),
      zk: {
        connection_type: zkPull.connection_type,
        attendance_size: zkPull.attendance_size,
        record_count: zkPull.records.length,
        imported_rows: mapped.length,
        device_users: zkPull.device_users.length,
        errors: zkPull.errors,
        pull_diagnostics,
      },
    },
  };

  const ingest_summary = mapped.length
    ? await pushLogs(dev, mapped, rawBody)
    : { total: 0, accepted: 0, duplicates: 0, unresolved: 0, errors: [] };

  if (mapped.length === 0) {
    await dev.update({ last_sync: new Date() });
  }

  let attendance_processing = null;
  if (auto_process && datesSet.size > 0) {
    const attendanceProcessor = require('./attendance_processor.service');
    let dates = [...datesSet].sort();
    const truncated = dates.length > 21;
    if (truncated) dates = dates.slice(-21);
    attendance_processing = { dates, results: [], truncated, overwrite: Boolean(overwrite_attendance) };
    for (const work_date of dates) {
      try {
        const bulk = await attendanceProcessor.processBulk(company_id, work_date, {
          overwrite: Boolean(overwrite_attendance),
          dry_run: false,
        });
        attendance_processing.results.push({ work_date, summary: bulk.summary });
      } catch (e) {
        attendance_processing.results.push({ work_date, error: e.message });
      }
    }
  }

  return {
    ingest_summary,
    records_pulled_raw: zkPull.records.length,
    imported_to_logs: mapped.length,
    attendance_processing,
    pull_diagnostics,
  };
}

module.exports = {
  importZkUsersToEmployeesDirect,
  importZkAttendancesDirectToDeviceLogs,
};
