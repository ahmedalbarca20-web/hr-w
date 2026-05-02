'use strict';

const http          = require('http');
const https         = require('https');
const net           = require('node:net');
const { URL }       = require('url');
const crypto        = require('crypto');
const { Op }        = require('sequelize');
const { Device, DeviceLog } = require('../models/device.model');
const Department    = require('../models/department.model');
const Employee      = require('../models/employee.model');
const Company       = require('../models/company.model');
const surpriseAttendanceSvc = require('./surprise_attendance.service');
const zktecoSocket = require('./zktecoSocket.service');
const dtrZkBridge = require('./dtrZktecoBridge.service');
const { paginate, paginateResult } = require('../utils/pagination');
const { DEFAULT_IANA } = require('../utils/timezone');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Base URL of [dtr.zkteco.api](https://github.com/itechxcellence/dtr.zkteco.api) on the LAN (or ngrok). When set, ZK reads use HTTP snapshot instead of TCP from this process. */
function dtrBridgeBaseUrl() {
  return String(process.env.DTR_ZKTECO_API_URL || '').trim().replace(/\/$/, '');
}

const notFound  = (id) => Object.assign(new Error(`Device ${id} not found`), { statusCode: 404, code: 'NOT_FOUND' });
const conflict  = (msg) => Object.assign(new Error(msg), { statusCode: 409, code: 'CONFLICT' });
const badReq    = (msg) => Object.assign(new Error(msg), { statusCode: 400, code: 'VALIDATION_ERROR' });

/** Normalize PIN / card / UID for ZK name map (same idea as pushLogs employee lookup). */
function normZkKey(v) {
  return String(v || '').trim().toUpperCase();
}

function zkPinLookupKeys(card_number) {
  const keys = new Set();
  const b = normZkKey(card_number);
  if (!b) return keys;
  keys.add(b);
  if (/^\d+$/.test(b)) {
    const n = parseInt(b, 10);
    if (Number.isFinite(n)) {
      keys.add(String(n));
      for (let w = 1; w <= 9; w += 1) {
        keys.add(String(n).padStart(w, '0'));
      }
    }
  }
  return keys;
}

function addZkUserKeysToNameMap(map, u) {
  const name = String(u.name || '').trim();
  if (!name) return;
  const ids = [];
  if (u.userId != null && String(u.userId).trim() !== '') ids.push(String(u.userId));
  const cardNum = u.cardno != null ? Number(u.cardno) : 0;
  if (cardNum > 0) ids.push(String(Math.trunc(cardNum)));
  if (u.uid != null) ids.push(String(u.uid));
  for (const id of ids) {
    for (const k of zkPinLookupKeys(id)) {
      map.set(k, name);
    }
  }
}

/** PIN / card / uid → display name as stored on ZK (UTF-8 after zkUserDecodePatch). */
function buildZkPinToDisplayName(users) {
  const m = new Map();
  for (const u of users || []) addZkUserKeysToNameMap(m, u);
  return m;
}

function lookupZkDisplayName(nameByPin, card_number) {
  if (!nameByPin || !card_number) return '';
  for (const k of zkPinLookupKeys(card_number)) {
    if (nameByPin.has(k)) return nameByPin.get(k);
  }
  return '';
}

/** Generate a cryptographically random 48-character hex API key. */
function generateApiKey() {
  return crypto.randomBytes(24).toString('hex');
}

async function assertDeviceDepartment(company_id, department_id) {
  if (department_id == null) return;
  const dept = await Department.findOne({ where: { id: department_id, company_id } });
  if (!dept) throw badReq('department_id does not belong to this company');
}

const departmentInclude = {
  model      : Department,
  as         : 'department',
  attributes : ['id', 'name', 'name_ar'],
  required   : false,
};

// ════════════════════════════════════════════════════════════════════════════
// DEVICE CRUD
// ════════════════════════════════════════════════════════════════════════════

async function listDevices(company_id, { status, mode, type, department_id } = {}) {
  const where = { company_id };
  if (status) where.status = status;
  if (mode)   where.mode   = mode;
  if (type)   where.type   = type;
  const dNum = Number(department_id);
  if (
    department_id !== undefined &&
    department_id !== null &&
    department_id !== '' &&
    Number.isFinite(dNum) &&
    dNum > 0
  ) {
    where.department_id = dNum;
  }
  return Device.findAll({
    where,
    include   : [departmentInclude],
    attributes: { exclude: ['api_key'] },   // never expose api_key in list
    order     : [['name', 'ASC']],
  });
}

async function getDevice(id, company_id) {
  const dev = await Device.findOne({
    where     : { id, company_id },
    include   : [departmentInclude],
    attributes: { exclude: ['api_key'] },
  });
  if (!dev) throw notFound(id);
  return dev;
}

/**
 * Create a device and return it including the api_key (only time it is
 * returned in plaintext — caller should display it to the admin once).
 */
async function createDevice(company_id, data) {
  const existing = await Device.findOne({ where: { company_id, serial_number: data.serial_number } });
  if (existing) throw conflict(`Serial number "${data.serial_number}" is already registered in this company`);

  await assertDeviceDepartment(company_id, data.department_id);

  const api_key = generateApiKey();
  const device  = await Device.create({ ...data, company_id, api_key });
  return device;   // includes api_key — shown once
}

async function updateDevice(id, company_id, data) {
  const dev = await Device.findOne({ where: { id, company_id } });
  if (!dev) throw notFound(id);

  if (Object.prototype.hasOwnProperty.call(data, 'department_id')) {
    await assertDeviceDepartment(company_id, data.department_id);
  }

  // Prevent serial collision
  if (data.serial_number && data.serial_number !== dev.serial_number) {
    const dup = await Device.findOne({ where: { company_id, serial_number: data.serial_number } });
    if (dup) throw conflict(`Serial number "${data.serial_number}" is already registered`);
  }

  await dev.update(data);
  const updated = await Device.findOne({
    where     : { id, company_id },
    include   : [departmentInclude],
    attributes: { exclude: ['api_key'] },
  });
  return updated;
}

async function deactivateDevice(id, company_id) {
  const dev = await Device.findOne({ where: { id, company_id } });
  if (!dev) throw notFound(id);
  await dev.update({ status: 'INACTIVE' });
}

/**
 * Rotate the device's API key. Returns the new key in plaintext — shown once.
 */
async function rotateApiKey(id, company_id) {
  const dev = await Device.findOne({ where: { id, company_id } });
  if (!dev) throw notFound(id);
  const api_key = generateApiKey();
  await dev.update({ api_key });
  return { id: dev.id, serial_number: dev.serial_number, api_key };
}

// ════════════════════════════════════════════════════════════════════════════
// PUSH  – receive raw logs from a hardware device
// ════════════════════════════════════════════════════════════════════════════

/**
 * pushLogs
 *
 * Called after the device has been authenticated by authenticateDevice
 * middleware.  `device` is the Sequelize Device instance from req.device.
 *
 * @param {object}  device           – authenticated Device record
 * @param {Array}   logs             – raw log entries from device payload
 * @param {object}  rawBody          – full original request body (archived)
 *
 * Each log entry:
 *   {
 *     card_number : string   // raw identifier from device
 *     event_type  : string   // CHECK_IN | CHECK_OUT | VERIFY | ALARM | OTHER
 *     event_time  : string   // ISO datetime from device clock
 *     raw         : object   // any extra device-specific fields (optional)
 *   }
 *
 * Returns:
 *   { total, accepted, duplicates, unresolved, errors }
 */
async function pushLogs(device, logs, rawBody) {
  const company_id   = device.company_id;
  const isVerifyOnly = device.mode === 'VERIFY_ONLY';
  const activeSurpriseEvent = await surpriseAttendanceSvc.getActive(company_id);

  const result = { total: logs.length, accepted: 0, duplicates: 0, unresolved: 0, errors: [] };
  const ALLOWED_EVENT_TYPES = new Set(['CHECK_IN', 'CHECK_OUT', 'VERIFY', 'ALARM', 'OTHER']);

  // Pre-build an employee lookup map: card_number → employee_id
  // Devices typically store an enrolment ID that matches employee_number.
  // We do a single bulk query for all card_numbers in this batch.
  const normalizeBioId = (v) => String(v || '').trim().toUpperCase();
  /** ZK often sends zero-padded numeric PINs; HR may store unpadded — expand for DB IN + lookup map. */
  const expandEmployeeNumberKeys = (employee_number) => {
    const keys = new Set();
    const b = normalizeBioId(employee_number);
    if (!b) return keys;
    keys.add(b);
    if (/^\d+$/.test(b)) {
      const n = parseInt(b, 10);
      if (Number.isFinite(n)) {
        keys.add(String(n));
        for (let w = 1; w <= 9; w += 1) {
          keys.add(String(n).padStart(w, '0'));
        }
      }
    }
    return keys;
  };
  const pinQuery = new Set();
  for (const l of logs) {
    for (const k of expandEmployeeNumberKeys(l.card_number)) pinQuery.add(k);
  }
  const cardNumbers = [...pinQuery].filter(Boolean);
  const employees = cardNumbers.length
    ? await Employee.findAll({
      where     : { company_id, employee_number: { [Op.in]: cardNumbers } },
      attributes: ['id', 'employee_number'],
    })
    : [];
  const empMap = {};
  for (const e of employees) {
    for (const k of expandEmployeeNumberKeys(e.employee_number)) {
      empMap[k] = e.id;
    }
  }

  for (const log of logs) {
    try {
      const card_number = normalizeBioId(log.card_number);
      const event_type_raw = String(log.event_type || '').trim().toUpperCase();
      if (!event_type_raw) {
        result.errors.push({ card_number, reason: 'Missing event_type (default values disabled)' });
        continue;
      }
      if (!ALLOWED_EVENT_TYPES.has(event_type_raw)) {
        result.errors.push({ card_number, reason: `Invalid event_type: ${event_type_raw}` });
        continue;
      }
      const event_type  = event_type_raw;
      const event_time  = new Date(log.event_time);

      if (isNaN(event_time.getTime())) {
        result.errors.push({ card_number, reason: 'Invalid event_time' });
        continue;
      }

      const employee_id  = empMap[card_number] ?? null;
      if (!employee_id) result.unresolved++;

      const raw_payload  = { ...log, _source: rawBody?._meta ?? {} };
      const isSurprise = Boolean(
        activeSurpriseEvent
        && event_time >= new Date(activeSurpriseEvent.starts_at)
        && event_time <= new Date(activeSurpriseEvent.ends_at)
      );
      if (isSurprise) {
        raw_payload.surprise_attendance = {
          is_surprise: true,
          event_id: activeSurpriseEvent.id,
          starts_at: activeSurpriseEvent.starts_at,
          ends_at: activeSurpriseEvent.ends_at,
        };
      }

      // ── Deduplication ─────────────────────────────────────────────────────
      // A log is a duplicate when the same (device, card, event_type, moment)
      // already exists.  We use findOrCreate with the unique index fields so
      // the DB itself is the final arbitrator (safe under concurrent pushes).
      const [, created] = await DeviceLog.findOrCreate({
        where: {
          device_id  : device.id,
          card_number,
          event_type,
          event_time,
        },
        defaults: {
          company_id,
          device_id     : device.id,
          employee_id,
          card_number,
          event_type,
          event_time,
          raw_payload,
          is_duplicate  : 0,
          is_verify_only: isVerifyOnly ? 1 : 0,
          processed     : 0,
          is_surprise   : isSurprise ? 1 : 0,
          surprise_event_id: isSurprise ? activeSurpriseEvent.id : null,
        },
      });

      if (created) {
        result.accepted++;
      } else {
        // Row already existed — update its is_duplicate flag for visibility
        await DeviceLog.update(
          { is_duplicate: 1 },
          { where: { device_id: device.id, card_number, event_type, event_time, is_duplicate: 0 } }
        );
        result.duplicates++;
      }
    } catch (err) {
      result.errors.push({ card_number: log.card_number, reason: err.message });
    }
  }

  // Update device last_sync timestamp
  await device.update({ last_sync: new Date(), status: 'ACTIVE' });

  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// HEARTBEAT  – device reports it is online
// ════════════════════════════════════════════════════════════════════════════

async function heartbeat(device, data) {
  const updates = { last_sync: new Date(), status: 'ACTIVE' };
  if (data?.firmware_version) updates.firmware_version = data.firmware_version;
  if (data?.ip_address)       updates.ip_address       = data.ip_address;
  await device.update(updates);
  return { id: device.id, status: 'ACTIVE', last_sync: updates.last_sync };
}

// ════════════════════════════════════════════════════════════════════════════
// RAW LOG QUERIES
// ════════════════════════════════════════════════════════════════════════════

async function listLogs(company_id, {
  page = 1, limit = 50, device_id, employee_id, event_type, card_number,
  from, to, is_duplicate, is_verify_only, processed,
} = {}) {
  const where = { company_id };
  if (device_id    !== undefined) where.device_id     = device_id;
  if (employee_id  !== undefined) where.employee_id   = employee_id;
  if (event_type)                 where.event_type    = event_type;
  const cardTrim = card_number != null ? String(card_number).trim() : '';
  if (cardTrim) where.card_number = { [Op.like]: `%${cardTrim}%` };
  if (is_duplicate !== undefined) where.is_duplicate  = is_duplicate;
  if (is_verify_only !== undefined) where.is_verify_only = is_verify_only;
  if (processed    !== undefined) where.processed     = processed;
  if (from || to) {
    where.event_time = {};
    if (from) where.event_time[Op.gte] = new Date(from);
    if (to)   where.event_time[Op.lte] = new Date(to);
  }

  const { rows, count } = await DeviceLog.findAndCountAll({
    where,
    include: [
      { model: Device,   as: 'device',   attributes: ['id', 'name', 'serial_number', 'mode'] },
      { model: Employee, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'employee_number'], required: false },
    ],
    order : [['event_time', 'DESC']],
    ...paginate(page, limit),
  });
  return paginateResult(rows, count, page, limit);
}

async function getLog(id, company_id) {
  const log = await DeviceLog.findOne({
    where  : { id, company_id },
    include: [
      { model: Device,   as: 'device' },
      { model: Employee, as: 'employee', required: false },
    ],
  });
  if (!log) throw Object.assign(new Error(`DeviceLog ${id} not found`), { statusCode: 404, code: 'NOT_FOUND' });
  return log;
}

/**
 * Mark a log (or batch of logs) as needing re-processing.
 * Resets: processed=0, is_duplicate=0 (so the attendance processor picks it up).
 */
async function markForReprocess(id, company_id) {
  const log = await DeviceLog.findOne({ where: { id, company_id } });
  if (!log) throw Object.assign(new Error(`DeviceLog ${id} not found`), { statusCode: 404, code: 'NOT_FOUND' });
  if (log.is_verify_only) throw badReq('Verify-only logs cannot be reprocessed into attendance');
  await log.update({ processed: 0, is_duplicate: 0 });
  return log.reload();
}

/**
 * Trigger targeted user sync for a specific device.
 * Currently records an audit-style summary and updates last_sync.
 */
/**
 * Minimal employee list for device user-picker (does not require `employees` API feature).
 */
async function listEmployeesForDevicePicker(company_id) {
  if (company_id == null || !Number.isFinite(Number(company_id)) || Number(company_id) < 1) {
    throw badReq('company_id is required');
  }
  const rows = await Employee.findAll({
    where     : { company_id: Number(company_id), status: 'ACTIVE' },
    attributes: ['id', 'employee_number', 'first_name', 'last_name', 'first_name_ar', 'last_name_ar'],
    order     : [['employee_number', 'ASC']],
    limit     : 2000,
  });
  return rows.map((e) => ({
    id              : e.id,
    employee_number : e.employee_number,
    first_name      : e.first_name,
    last_name       : e.last_name,
    first_name_ar   : e.first_name_ar,
    last_name_ar    : e.last_name_ar,
  }));
}

async function syncDeviceUsers(device_id, company_id, employee_ids = []) {
  const dev = await Device.findOne({ where: { id: device_id, company_id } });
  if (!dev) throw notFound(device_id);
  if (dev.status === 'OFFLINE') throw badReq('Cannot sync users: device is offline');

  const employees = await Employee.findAll({
    where: { company_id, id: { [Op.in]: employee_ids } },
    attributes: ['id', 'employee_number', 'first_name', 'last_name'],
  });
  if (employees.length === 0) throw badReq('No valid employees selected');

  const now = new Date();
  await dev.update({ last_sync: now });

  return {
    device: { id: dev.id, name: dev.name, serial_number: dev.serial_number },
    synced_count: employees.length,
    employees: employees.map((e) => ({
      id: e.id,
      employee_number: e.employee_number,
      name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
    })),
    synced_at: now,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PROBE CONNECTION (HTTP to device LAN — ZKTeco / similar web panels)
// ════════════════════════════════════════════════════════════════════════════

const PROBE_TIMEOUT_MS = 4500;
const PROBE_MAX_BODY   = 200 * 1024;

function httpGetText(targetUrl) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(targetUrl);
    } catch (e) {
      reject(e);
      return;
    }
    const lib  = u.protocol === 'https:' ? https : http;
    const port = u.port || (u.protocol === 'https:' ? 443 : 80);
    const req  = lib.request(
      {
        hostname : u.hostname,
        port,
        path     : u.pathname + u.search,
        method   : 'GET',
        timeout  : PROBE_TIMEOUT_MS,
        headers  : {
          'User-Agent': 'Mozilla/5.0 (compatible; HRPortal-DeviceProbe/1.0)',
          Accept       : 'text/html,application/xhtml+xml,text/plain,*/*',
        },
      },
      (res) => {
        const chunks = [];
        let len = 0;
        res.on('data', (c) => {
          len += c.length;
          if (len > PROBE_MAX_BODY) {
            req.destroy();
            reject(new Error('BODY_TOO_LARGE'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, body });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('TIMEOUT'));
    });
    req.end();
  });
}

function extractSerialFromBody(body) {
  if (!body || typeof body !== 'string') return null;
  const snTilde = body.match(/~SerialNumber=([^&\s~\r\n]+)/);
  if (snTilde && /^[A-Za-z0-9_.\-]{4,64}$/.test(snTilde[1])) return snTilde[1].slice(0, 80);

  const patterns = [
    /SerialNumber\s*=\s*([A-Za-z0-9_.\-]{4,64})/i,
    /Serial\s*Number\s*[:\s=]+\s*([A-Za-z0-9_.\-]{4,64})/i,
    /\bSN\s*[:\s=]+\s*([A-Za-z0-9_.\-]{4,64})/i,
    /device[_-]?serial["']?\s*[:=]\s*["']?([A-Za-z0-9_.\-]{4,64})/i,
    /<input[^>]+name=["']?SerialNumber["']?[^>]*value=["']([^"']{4,64})["']/i,
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (m && m[1]) {
      const val = m[1].trim();
      if (/^[A-Za-z0-9_.\-]+$/.test(val)) return val.slice(0, 80);
    }
  }

  const lines = body.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 1 && /^[A-Za-z0-9_.\-]{4,32}$/.test(lines[0])) return lines[0];

  const okLine = body.match(/^OK\s*,?\s*([A-Za-z0-9_.\-]{4,64})\s*$/im);
  if (okLine) return okLine[1].slice(0, 80);

  return null;
}

function extractFirmwareFromBody(body) {
  if (!body || typeof body !== 'string') return null;
  const m = body.match(/Firmware(?:Version)?\s*[=:]\s*([A-Za-z0-9_.\-]{2,30})/i);
  return m ? m[1] : null;
}

/** Host literal for URL authority (bracket IPv6). */
function networkHostForUrl(host) {
  const h = String(host).trim();
  if (net.isIPv6(h)) return `[${h}]`;
  return h;
}

/**
 * ZKTeco web UI is almost always HTTP on 80/8080. Port 4370 is machine protocol, not a browser page.
 * We avoid probing https:443 on LAN by default — it often returns ECONNREFUSED and masks the real hint.
 */
function buildProbeUrls(host, userPort) {
  const literal = networkHostForUrl(host);
  const pNum    = Number(userPort);
  const ports   = [];
  const add     = (p) => {
    if (!Number.isFinite(p) || p < 1 || p > 65535) return;
    if (!ports.includes(p)) ports.push(p);
  };

  [80, 8080, 8088, 9090, 81].forEach(add);
  if (Number.isFinite(pNum) && pNum > 0) add(pNum);
  if (pNum === 443) add(443);

  const paths = [
    '/cgi-bin/getoption.cgi?action=getoption&kind=SerialNumber',
    '/cgi-bin/getserverinfo.cgi',
    '/cgi-bin/getplatform.cgi',
    '/',
  ];

  const urls = [];
  for (const prt of ports) {
    const proto = prt === 443 ? 'https' : 'http';
    for (const path of paths) {
      urls.push(`${proto}://${literal}:${prt}${path}`);
    }
  }
  return urls;
}

/**
 * Try common ZKTeco-style HTTP endpoints from the app server toward the device.
 * Port 4370 is often machine protocol only — we also try 80/8080 automatically.
 */
async function probeDeviceConnection({ ip_address, port }) {
  const scanUrls = buildProbeUrls(ip_address, port);
  let lastErr     = null;
  let sawHttp     = false;
  const portTried  = new Set();

  for (const url of scanUrls) {
    try {
      const u = new URL(url);
      const pStr = u.port || (u.protocol === 'https:' ? '443' : '80');
      portTried.add(pStr);
      const { status, body } = await httpGetText(url);
      sawHttp = true;
      if (status >= 200 && status < 500) {
        const serial_number    = extractSerialFromBody(body);
        const firmware_version = extractFirmwareFromBody(body);
        if (serial_number) {
          return {
            ok             : true,
            serial_number,
            firmware_version,
            probed_url: url,
          };
        }
      }
    } catch (e) {
      lastErr = e.message;
    }
  }

  const portsSorted = [...portTried].map((p) => Number(p)).sort((a, b) => a - b);
  const portsLine   = portsSorted.join('، ');
  const lanHint =
    'يجب أن يعمل خادم الـ API (حاسبة Node) على **نفس شبكة** الجهاز (نفس الراوتر). إذا كان الـ API على الإنترنت أو جهاز آخر، لن يصل إلى 192.168.x.x.';

  return {
    ok             : false,
    serial_number  : null,
    firmware_version: null,
    hint           : lanHint,
    ports_tried    : portsSorted,
    message        : sawHttp
      ? 'الجهاز ردّ لكن تعذّر قراءة الرقم التسلسلي تلقائياً. أدخله يدوياً من ملصق الجهاز أو واجهة الويب.'
      : `تعذّر الاتصال بواجهة الويب للجهاز. جرّبنا المنافذ: ${portsLine}. آخر خطأ: ${lastErr || 'no response'}. `
        + 'واجهة ZKTeco غالباً على HTTP منفذ 80 أو 8080 (وليس 4370). '
        + 'تحقق من IP الجهاز وجدار الحماية على الحاسبة التي تشغّل البرنامج. '
        + lanHint,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PUSH CONFIG (for ZKTeco / ADMS — device must call OUR server, not the reverse)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Public base URL of this API as seen by hardware on the LAN.
 * Prefer PUBLIC_API_URL in .env (e.g. http://192.168.1.5:5000).
 */
function resolvePublicApiBase(req) {
  const fromEnv = process.env.PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const xfProto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host    = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  if (!host) return `http://127.0.0.1:${process.env.PORT || 5000}`;
  return `${xfProto}://${host}`.replace(/\/$/, '');
}

async function getPushConfig(device_id, company_id, req) {
  const dev = await getDevice(device_id, company_id);
  const base          = resolvePublicApiBase(req);
  const push_url      = `${base}/api/devices/push`;
  const heartbeat_url = `${base}/api/devices/heartbeat`;
  const iso           = new Date().toISOString();
  const curl_example =
    `curl -sS -X POST "${push_url}" \\\n`
    + `  -H "Content-Type: application/json" \\\n`
    + `  -H "X-Device-Serial: ${dev.serial_number}" \\\n`
    + `  -H "X-Device-Key: <ضع_مفتاح_API_هنا>" \\\n`
    + `  -d '{"logs":[{"card_number":"EMP001","event_type":"CHECK_IN","event_time":"${iso}"}]}'`;
  return {
    base_url       : base,
    push_url,
    heartbeat_url,
    serial_number  : dev.serial_number,
    device_name    : dev.name,
    curl_example,
    note_ar:
      'عنوان الحقل «عنوان الشبكة» في النظام هو IP الجهاز لمساعدتك فقط (قراءة الرقم التسلسلي). '
      + 'أما الجهاز نفسه فيجب أن يُضبط ليرسل الحضور إلى عنوان **هذا الخادم** (الكمبيوتر الذي يشغّل البرنامج)، وليس العكس.',
  };
}

/** Same ingestion path as POST /api/devices/push — for HR to verify DB + dedup without hardware. */
async function simulateTestIngest(device_id, company_id, { card_number = 'TEST-PING', event_type = 'CHECK_IN' } = {}) {
  const dev = await Device.findOne({ where: { id: device_id, company_id } });
  if (!dev) throw notFound(device_id);
  const rawBody = { _meta: { hr_simulated_ingest: true, at: new Date().toISOString() } };
  const logs = [{
    card_number,
    event_type,
    event_time: new Date().toISOString(),
  }];
  return pushLogs(dev, logs, rawBody);
}

/** zkteco-js TCP/UDP read — arbitrary IP (e.g. from device form before save). */
async function probeZkSocket(body) {
  const bridge = dtrBridgeBaseUrl();
  if (bridge) {
    return dtrZkBridge.probeSnapshotFromBridge(bridge, body);
  }
  return zktecoSocket.probeSnapshot({
    ip                       : body.ip_address,
    port                     : body.port,
    socket_timeout_ms        : body.socket_timeout_ms,
    udp_local_port           : body.udp_local_port,
    include_users            : body.include_users,
    max_users                : body.max_users,
    include_attendance_size  : body.include_attendance_size,
  });
}

/** One-shot diagnostics: env + ZK path + HTTP probe + optional DTR bio-sync (same body family as probe-zk-socket). */
async function debugZkConnection(body) {
  const started = Date.now();
  const hints = [];
  const hostStr = String(body.ip_address || '').trim();
  const privateLan = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(hostStr);
  if (privateLan && process.env.VERCEL === '1') {
    hints.push('الخادم على Vercel — لا يمكن عادةً الوصول إلى عنوان LAN (192.168.x) من هذه الدالة.');
  }
  const dtrBase = dtrBridgeBaseUrl();
  if (!dtrBase && privateLan && process.env.NODE_ENV === 'production' && process.env.VERCEL !== '1') {
    hints.push('تأكد أن Node الذي يشغّل الـ API على نفس LAN الجهاز (لا سيرفر عن بُعد بدون VPN).');
  }
  if (dtrBase && !body.force_direct_zk) {
    hints.push('ZK عبر DTR_ZKTECO_API_URL. أضف "force_direct_zk": true لمقارنة zkteco-js مباشرة إلى IP الجهاز من هذه العملية.');
  } else if (dtrBase && body.force_direct_zk) {
    hints.push('force_direct_zk نشط — يُتجاوز الجسر مؤقتاً ويُجرّب zkteco-js مباشرة.');
  }

  const zkLabel = dtrBase && !body.force_direct_zk ? 'dtr_bridge_probe' : 'zkteco_js_direct';
  const zkT0 = Date.now();
  let zk = { ok: false, errors: [{ message: 'not run' }] };
  try {
    if (dtrBase && !body.force_direct_zk) {
      zk = await dtrZkBridge.probeSnapshotFromBridge(dtrBase, body);
    } else {
      zk = await zktecoSocket.probeSnapshot({
        ip                       : body.ip_address,
        port                     : body.port,
        socket_timeout_ms        : body.socket_timeout_ms,
        udp_local_port           : body.udp_local_port,
        include_users            : body.include_users,
        max_users                : body.max_users,
        include_attendance_size  : body.include_attendance_size,
      });
    }
  } catch (e) {
    zk = { ok: false, errors: [{ message: e.message, code: e.code }] };
  }
  const zkMs = Date.now() - zkT0;

  const httpT0 = Date.now();
  let http = null;
  let httpErr = null;
  try {
    http = await probeDeviceConnection({ ip_address: body.ip_address, port: body.port });
  } catch (e) {
    httpErr = e.message;
    http = { ok: false, message: e.message };
  }
  const httpMs = Date.now() - httpT0;

  let dtr_bio_sync = null;
  if (dtrBase) {
    const t = Date.now();
    try {
      const payload = await dtrZkBridge.fetchBioSyncPayload(dtrBase);
      dtr_bio_sync = {
        ok: Boolean(payload),
        ms: Date.now() - t,
        logs: payload?.logs?.length ?? 0,
        users: payload?.users?.length ?? 0,
        has_device_details: Boolean(payload?.device_details),
      };
    } catch (e) {
      dtr_bio_sync = { ok: false, ms: Date.now() - t, error: e.message };
    }
  }

  const serialFromZk = zk?.serial_number != null && String(zk.serial_number).trim() !== '';
  const serialFromHttp = http?.ok && http?.serial_number;

  return {
    environment: {
      NODE_ENV: process.env.NODE_ENV || '(unset)',
      VERCEL: process.env.VERCEL === '1',
      DTR_ZKTECO_API_URL_SET: Boolean(dtrBase),
      ...(dtrBase
        ? { DTR_ZKTECO_API_URL_HOST: (() => { try { return new URL(dtrBase).hostname; } catch { return null; } })() }
        : {}),
    },
    at: new Date().toISOString(),
    total_ms: Date.now() - started,
    zk_path_used: zkLabel,
    zk_socket: {
      ms: zkMs,
      ok: Boolean(zk?.ok),
      serial_number: zk?.serial_number ?? null,
      firmware_version: zk?.firmware_version ?? null,
      connection_type: zk?.connection_type ?? null,
      user_count_on_device: zk?.user_count_on_device ?? null,
      errors: zk?.errors || [],
    },
    http_web_probe: {
      ms: httpMs,
      ok: Boolean(http?.ok),
      serial_number: http?.serial_number ?? null,
      probed_url: http?.probed_url ?? null,
      hint: http?.hint ?? null,
      message: http?.message ?? null,
      ports_tried: http?.ports_tried ?? null,
      fetch_error: httpErr,
    },
    dtr_bio_sync,
    analysis: {
      can_fill_serial_from_zk: serialFromZk,
      can_fill_serial_from_http: Boolean(serialFromHttp),
      recommendation_ar: serialFromZk
        ? 'بروتوكول ZK نجح — استخدم نفس الإعدادات في النموذج.'
        : serialFromHttp
          ? 'واجهة الويب تعمل — يمكن الاعتماد على اختبار HTTP أو إدخال السيريال يدوياً.'
          : zk?.ok
            ? 'ZK اتصل لكن بدون serial واضح — راجع errors أو جرّب force_direct_zk عكس الجسر.'
            : 'فشل ZK وواجهة الويب — تحقق من IP والمنفذ والشبكة وجدار الحماية.',
    },
    hints_ar: hints,
  };
}

/** zkteco-js read using `ip_address` stored on the device row. */
async function readZkFromRegisteredDevice(device_id, company_id, overrides = {}) {
  const dev = await Device.findOne({
    where     : { id: device_id, company_id },
    attributes: ['id', 'ip_address', 'name'],
  });
  if (!dev) throw notFound(device_id);
  const bridge = dtrBridgeBaseUrl();
  if (bridge) {
    return dtrZkBridge.probeSnapshotFromBridge(bridge, overrides);
  }
  const host = (dev.ip_address || '').trim();
  if (!host) throw badReq('Device has no network host — save ip_address on this device first.');
  return zktecoSocket.probeSnapshot({
    ip                       : host,
    port                     : overrides.port ?? 4370,
    socket_timeout_ms        : overrides.socket_timeout_ms ?? 8000,
    udp_local_port           : overrides.udp_local_port ?? 5000,
    include_users            : overrides.include_users !== false,
    max_users                : overrides.max_users ?? 80,
    /** Many firmwares return a short buffer for CMD_GET_FREE_SIZES — zkteco-js readUIntLE(40,4) throws. Opt-in only. */
    include_attendance_size  : overrides.include_attendance_size === true,
  });
}

/** Strip ZK keypad PIN from user rows unless explicitly requested (sensitive). يُزال دائماً __zk_pin8_b64 (داخلي للخادم فقط). */
function sanitizeZkUserRows(users, includePassword) {
  return (users || []).map((u) => {
    if (!u || typeof u !== 'object') return u;
    const { password, __zk_pin8_b64, ...rest } = u;
    if (includePassword) return { ...rest, ...(password != null && password !== '' ? { password } : {}) };
    return rest;
  });
}

/** Live user list from biometric (zkteco-js getUsers), for Sync Center picker. */
async function listZkUsersOnDevice(device_id, company_id, query = {}) {
  if (company_id == null || !Number.isFinite(Number(company_id)) || Number(company_id) < 1) {
    throw badReq('company_id is required');
  }
  const dev = await Device.findOne({
    where     : { id: device_id, company_id },
    attributes: ['id', 'ip_address', 'name', 'status', 'serial_number'],
  });
  if (!dev) throw notFound(device_id);

  const bridge = dtrBridgeBaseUrl();
  if (bridge) {
    const payload = await dtrZkBridge.fetchBioSyncPayload(bridge);
    if (!payload) {
      throw Object.assign(
        new Error('DTR bridge has no snapshot yet. Run dtr.zkteco.api on the LAN and wait for the first poll, or check DEVICE_IP in the bridge .env.'),
        { statusCode: 502, code: 'ZK_BRIDGE_EMPTY' },
      );
    }
    const rawUsers = dtrZkBridge.dtrUsersToZkUserSample(payload.users || []);
    const includePassword = query.include_password === true;
    return {
      device               : { id: dev.id, name: dev.name, serial_number: dev.serial_number },
      users                : sanitizeZkUserRows(rawUsers, includePassword),
      user_count_on_device : rawUsers.length,
      attendance_size      : payload.device_details?.attendanceSize ?? null,
      info                 : payload.device_details?.info ?? payload.device_details ?? null,
    };
  }

  if (dev.status === 'OFFLINE') throw badReq('Cannot read device users: device is offline');
  const host = (dev.ip_address || '').trim();
  if (!host) throw badReq('Device has no network host — save ip_address on this device first.');
  const port = query.port != null && Number.isFinite(Number(query.port)) && Number(query.port) > 0
    ? Number(query.port)
    : 4370;
  const envUdp = Number.parseInt(String(process.env.ZK_UDP_LOCAL_PORT || '').trim(), 10);
  const udp_local_port = Number.isFinite(Number(query.udp_local_port))
    ? Math.min(65535, Math.max(1024, Number(query.udp_local_port)))
    : (Number.isFinite(envUdp) && envUdp >= 1024 && envUdp <= 65535
      ? envUdp
      : 40000 + Math.floor(Math.random() * 20000));
  const snap = await zktecoSocket.probeSnapshot({
    ip                      : host,
    port,
    socket_timeout_ms       : 15000,
    udp_local_port,
    include_users           : true,
    max_users               : 500,
    include_attendance_size : false,
  });
  if (!snap.ok) {
    const msg = snap.errors?.[0]?.message || 'ZK read failed';
    throw Object.assign(new Error(msg), { statusCode: 502, code: 'ZK_ERROR' });
  }
  const includePassword = query.include_password === true;
  const rawUsers = snap.user_sample || [];
  return {
    device                 : { id: dev.id, name: dev.name, serial_number: dev.serial_number },
    users                  : sanitizeZkUserRows(rawUsers, includePassword),
    user_count_on_device   : snap.user_count_on_device ?? rawUsers.length,
    attendance_size        : null,
    info                   : snap.info,
  };
}

/** Import selected ZK device users into HR employees (create or update by employee_number). */
async function importZkUsersToEmployees(device_id, company_id, opts = {}) {
  if (company_id == null || !Number.isFinite(Number(company_id)) || Number(company_id) < 1) {
    throw badReq('company_id is required');
  }
  const employeeSvc = require('./employee.service');
  const uids = opts.uids;
  const port = opts.port;
  const includePassword = opts.include_password === true;
  const allowed = new Set((uids || []).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0));
  if (allowed.size === 0) throw badReq('Select at least one device user (uid)');

  const listData = await listZkUsersOnDevice(device_id, company_id, { port, include_password: includePassword });
  const picked = (listData.users || []).filter((u) => allowed.has(Number(u.uid)));
  if (picked.length === 0) throw badReq('No matching device users for the selected UID(s)');

  const results = [];
  for (const u of picked) {
    const row = await employeeSvc.upsertFromZkUser(company_id, u);
    if (includePassword) {
      const pin = u.password != null ? String(u.password).replace(/\0/g, '').trim() : '';
      results.push({ ...row, zk_device_password: pin || null });
    } else {
      results.push(row);
    }
  }

  const dev = await Device.findOne({ where: { id: device_id, company_id } });
  if (dev) await dev.update({ last_sync: new Date() });

  return {
    device   : { id: dev.id, name: dev.name },
    imported : results.length,
    results,
  };
}

/** ZKTeco privilege levels (pyzk const): USER_DEFAULT=0, USER_ADMIN=14 */
const ZK_PRIV_USER = 0;
const ZK_PRIV_ADMIN = 14;

/**
 * Grant or revoke terminal «admin» on the biometric device (ZK setUser, role 14 vs 0).
 * Reads full user list on the server to preserve name / card / PIN while changing privilege only.
 */
async function setZkDeviceUserPrivilege(device_id, company_id, body = {}) {
  if (company_id == null || !Number.isFinite(Number(company_id)) || Number(company_id) < 1) {
    throw badReq('company_id is required');
  }
  const uid = Number(body.uid);
  if (!Number.isInteger(uid) || uid < 1) throw badReq('Invalid uid');
  const isAdmin = body.is_admin === true;
  const port = body.port != null && Number.isFinite(Number(body.port)) && Number(body.port) > 0
    ? Number(body.port)
    : 4370;
  const socket_timeout_ms = body.socket_timeout_ms != null && Number.isFinite(Number(body.socket_timeout_ms))
    ? Math.min(120000, Math.max(8000, Number(body.socket_timeout_ms)))
    : 45000;

  const dev = await Device.findOne({
    where     : { id: device_id, company_id },
    attributes: ['id', 'ip_address', 'name', 'status', 'serial_number'],
  });
  if (!dev) throw notFound(device_id);
  if (dev.status === 'OFFLINE') throw badReq('Cannot modify device: device is offline');
  const host = (dev.ip_address || '').trim();
  if (!host) throw badReq('Device has no network host — save ip_address on this device first.');

  /** فك قفل الشاشة أولاً (بعد سحب بصمات أو جلسة سابقة قد تُبقي الجهاز في وضع الإيقاف). */
  await zktecoSocket.unlockZkDevice({
    ip                : host,
    port,
    socket_timeout_ms : Math.min(30000, socket_timeout_ms),
    udp_local_port    : 5000,
  });

  const listRes = await zktecoSocket.fetchZkUsersList({
    ip                : host,
    port,
    socket_timeout_ms,
    udp_local_port    : 5000,
  });
  if (!listRes.ok) {
    const msg = listRes.errors?.[0]?.message || 'ZK list users failed';
    throw Object.assign(new Error(msg), { statusCode: 502, code: 'ZK_ERROR' });
  }
  const u = (listRes.users || []).find((x) => Number(x.uid) === uid);
  if (!u) {
    throw badReq(`UID ${uid} not found on device`);
  }

  const previous_role = u.role != null && Number.isFinite(Number(u.role)) ? Number(u.role) : 0;
  const newRole = isAdmin ? ZK_PRIV_ADMIN : ZK_PRIV_USER;

  const writeRes = await zktecoSocket.setZkUserWrite({
    ip                : host,
    port,
    socket_timeout_ms,
    uid,
    userId            : u.userId,
    name              : u.name,
    password          : u.password,
    pin8_b64          : u.__zk_pin8_b64,
    role              : newRole,
    cardno            : u.cardno,
  });
  if (!writeRes.ok) {
    const msg = writeRes.errors?.[0]?.message || 'ZK setUser failed';
    const err = Object.assign(new Error(msg), { statusCode: 502, code: 'ZK_ERROR' });
    if (writeRes.hint_ar) err.hint_ar = writeRes.hint_ar;
    throw err;
  }

  await dev.update({ last_sync: new Date() });

  return {
    device          : { id: dev.id, name: dev.name, serial_number: dev.serial_number },
    uid,
    is_admin        : isAdmin,
    previous_role   : previous_role,
    applied_role    : newRole,
    connection_type : writeRes.connection_type,
  };
}

/** إرسال CMD_ENABLE_DEVICE للجهاز فقط (فك قفل الشاشة) دون تعديل مستخدمين. */
async function unlockDeviceZkSession(device_id, company_id, body = {}) {
  if (company_id == null || !Number.isFinite(Number(company_id)) || Number(company_id) < 1) {
    throw badReq('company_id is required');
  }
  const port = body.port != null && Number.isFinite(Number(body.port)) && Number(body.port) > 0
    ? Number(body.port)
    : 4370;
  const socket_timeout_ms = body.socket_timeout_ms != null && Number.isFinite(Number(body.socket_timeout_ms))
    ? Math.min(120000, Math.max(8000, Number(body.socket_timeout_ms)))
    : 50000;

  const dev = await Device.findOne({
    where     : { id: device_id, company_id },
    attributes: ['id', 'ip_address', 'name', 'status', 'serial_number'],
  });
  if (!dev) throw notFound(device_id);
  if (dev.status === 'OFFLINE') throw badReq('Cannot reach device: device is offline');
  const host = (dev.ip_address || '').trim();
  if (!host) throw badReq('Device has no network host — save ip_address on this device first.');

  const res = await zktecoSocket.unlockZkDevice({
    ip                : host,
    port,
    socket_timeout_ms,
    udp_local_port    : 5000,
  });
  if (!res.ok) {
    const msg = res.errors?.[0]?.message || 'ZK unlock failed';
    throw Object.assign(new Error(msg), { statusCode: 502, code: 'ZK_ERROR' });
  }

  return {
    device          : { id: dev.id, name: dev.name, serial_number: dev.serial_number },
    connection_type : res.connection_type,
  };
}

/**
 * ZK general log verify_state (zk-protocol data-record.md).
 * 0 check-in, 1 check-out, 2 break out, 3 break in, 4 OT in, 5 OT out.
 */
function mapZkVerifyStateToEventType(state) {
  const s = Number(state);
  if (!Number.isFinite(s)) return 'CHECK_IN';
  if (s === 0 || s === 3 || s === 4) return 'CHECK_IN';
  if (s === 1 || s === 2 || s === 5) return 'CHECK_OUT';
  return 'CHECK_IN';
}

/**
 * Some firmwares/libraries expose the verify/in-out state with different keys
 * (number or string). Return normalized numeric state when possible.
 */
function extractZkVerifyState(row) {
  if (!row || typeof row !== 'object') return null;
  const candidates = [
    row.state,
    row.verify_state,
    row.verifyState,
    row.in_out,
    row.inOut,
    row.punch,
    row.punch_state,
    row.status,
    row.type,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) continue;
    if (['in', 'check_in', 'checkin', 'clock in', 'clock-in'].includes(s)) return 0;
    if (['out', 'check_out', 'checkout', 'clock out', 'clock-out'].includes(s)) return 1;
  }
  return null;
}

function localDateKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD for an instant in a specific IANA zone (aligns UI «day» with company settings). */
function calendarDateKeyInZone(isoOrDate, timeZone) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  const tz = (timeZone && String(timeZone).trim()) || DEFAULT_IANA;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (!y || !m || !day) return localDateKey(d);
    return `${y}-${m}-${day}`;
  } catch {
    return localDateKey(d);
  }
}

/** One row from zkteco-js getAttendances → { card_number, event_type, event_time ISO, raw, zk_display_name? }. */
function zkAttendanceToPushLog(row, nameByPin = null) {
  if (row == null || typeof row !== 'object') return null;
  const raw = { zk_attendance: { ...row } };
  const u = row.user_id != null ? row.user_id : row.userId;
  let card_number = '';
  if (typeof u === 'string') card_number = String(u).trim();
  else if (typeof u === 'number' && Number.isFinite(u)) card_number = String(Math.trunc(u));
  if (!card_number) return null;

  const event_time = row.record_time instanceof Date ? row.record_time : new Date(row.record_time);
  if (Number.isNaN(event_time.getTime())) return null;

  const state = extractZkVerifyState(row);
  const hasState = Number.isFinite(state);
  if (!hasState) return null;
  const event_type = mapZkVerifyStateToEventType(state);

  const out = {
    card_number,
    event_type,
    event_time: event_time.toISOString(),
    raw,
  };
  const dn = lookupZkDisplayName(nameByPin, card_number);
  if (dn) out.zk_display_name = dn;
  return out;
}

/**
 * Read attendance buffer from ZK over LAN and insert into device_logs via the same path as POST /push.
 * Optional date filter + cap. If auto_process, runs attendance processBulk per affected calendar day.
 */
async function importZkAttendancesToDeviceLogs(device_id, company_id, options = {}) {
  if (company_id == null || !Number.isFinite(Number(company_id)) || Number(company_id) < 1) {
    throw badReq('company_id is required');
  }
  const {
    port = 4370,
    date_from = null,
    date_to = null,
    max_records = 8000,
    auto_process = false,
    overwrite_attendance = true,
    socket_timeout_ms = 90000,
  } = options;

  const dev = await Device.findOne({
    where     : { id: device_id, company_id },
    attributes: ['id', 'ip_address', 'name', 'status', 'mode', 'company_id', 'serial_number'],
  });
  if (!dev) throw notFound(device_id);

  const bridge = dtrBridgeBaseUrl();
  const host = (dev.ip_address || '').trim();

  if (!bridge) {
    if (dev.status === 'OFFLINE') throw badReq('Cannot pull attendance: device is marked offline');
    if (!host) throw badReq('Device has no network host — save ip_address on this device first.');
  }

  const co = await Company.findByPk(company_id, { attributes: ['timezone'] }).catch(() => null);
  const companyTz = (co && co.timezone) ? String(co.timezone).trim() : 'Asia/Baghdad';

  let zkPull;
  if (bridge) {
    const payload = await dtrZkBridge.fetchBioSyncPayload(bridge);
    if (!payload) {
      throw Object.assign(
        new Error('DTR bridge has no attendance snapshot yet. Ensure dtr.zkteco.api is running on the LAN and the device is connected.'),
        { statusCode: 502, code: 'ZK_BRIDGE_EMPTY' },
      );
    }
    const records = dtrZkBridge.dtrLogsToZkAttendanceRecords(payload.logs || []);
    const device_users = dtrZkBridge.dtrUsersToZkUserSample(payload.users || []);
    zkPull = {
      ok: true,
      connection_type: 'dtr_bridge',
      attendance_size: payload.device_details?.attendanceSize ?? null,
      records,
      device_users,
      errors: [],
      attendance_retry_without_disable: false,
    };
  } else {
    zkPull = await zktecoSocket.fetchAttendanceLogs({
      ip                : host,
      port              : port != null && Number.isFinite(Number(port)) && Number(port) > 0 ? Number(port) : 4370,
      socket_timeout_ms,
    });
  }

  const zkNameByPin = buildZkPinToDisplayName(zkPull.device_users || []);

  if (!zkPull.ok && (!zkPull.records || zkPull.records.length === 0)) {
    const msg = zkPull.errors?.[0]?.message || 'ZK attendance read failed';
    throw Object.assign(new Error(msg), { statusCode: 502, code: 'ZK_ERROR' });
  }

  let mapped = [];
  let decoded_rows = 0;
  let rejected_bad_decode = 0;
  let rejected_by_date = 0;
  const sample_dates_outside_range = [];

  for (const row of zkPull.records || []) {
    const log = zkAttendanceToPushLog(row, zkNameByPin);
    if (!log) {
      rejected_bad_decode += 1;
      continue;
    }
    decoded_rows += 1;
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
    company_timezone           : companyTz,
    date_from,
    date_to,
    records_raw                : (zkPull.records || []).length,
    decoded_rows,
    rejected_bad_decode,
    rejected_by_date,
    sample_dates_outside_range : [...new Set(sample_dates_outside_range)],
    attendance_retry_no_disable: Boolean(zkPull.attendance_retry_without_disable),
    zk_errors                  : zkPull.errors || [],
  };

  const seenPunch = new Set();
  mapped = mapped.filter((log) => {
    const card = String(log.card_number || '').trim().toUpperCase();
    const k = `${card}|${log.event_type}|${log.event_time}`;
    if (seenPunch.has(k)) return false;
    seenPunch.add(k);
    return true;
  });

  const beforeCapCount = mapped.length;
  mapped.sort((a, b) => new Date(b.event_time) - new Date(a.event_time));
  const cap = Math.min(20000, Math.max(1, Number(max_records) || 8000));
  if (mapped.length > cap) {
    mapped = mapped.slice(0, cap);
  }
  mapped.sort((a, b) => new Date(a.event_time) - new Date(b.event_time));

  const datesSet = new Set();
  for (const log of mapped) {
    const dk = calendarDateKeyInZone(log.event_time, companyTz);
    if (dk) datesSet.add(dk);
  }

  const rawBody = {
    _meta: {
      source   : bridge ? 'dtr_zkteco_bridge' : 'zk_attendance_pull',
      device_id: dev.id,
      at       : new Date().toISOString(),
      zk       : {
        connection_type : zkPull.connection_type,
        attendance_size : zkPull.attendance_size,
        record_count    : (zkPull.records || []).length,
        imported_rows   : mapped.length,
        device_users    : (zkPull.device_users || []).length,
        errors          : zkPull.errors,
        pull_diagnostics,
        dtr_bridge_url  : bridge || undefined,
      },
    },
  };

  const ingest = mapped.length ? await pushLogs(dev, mapped, rawBody) : {
    total: 0, accepted: 0, duplicates: 0, unresolved: 0, errors: [],
  };

  if (mapped.length === 0) {
    await dev.reload();
    await dev.update({ last_sync: new Date() });
  }

  let attendance_processing = null;
  if (auto_process && datesSet.size > 0) {
    const attendanceProcessor = require('./attendance_processor.service');
    let dates = [...datesSet].sort();
    const maxDays = 21;
    let truncated = false;
    if (dates.length > maxDays) {
      dates = dates.slice(-maxDays);
      truncated = true;
    }
    attendance_processing = { dates, results: [], truncated, overwrite: Boolean(overwrite_attendance) };
    const ow = Boolean(overwrite_attendance);
    for (const work_date of dates) {
      try {
        const bulk = await attendanceProcessor.processBulk(company_id, work_date, {
          overwrite: ow,
          dry_run  : false,
        });
        attendance_processing.results.push({ work_date, summary: bulk.summary });
      } catch (e) {
        attendance_processing.results.push({ work_date, error: e.message });
      }
    }
  }

  return {
    device: { id: dev.id, name: dev.name, serial_number: dev.serial_number },
    zk    : {
      ok               : zkPull.ok,
      connection_type  : zkPull.connection_type,
      attendance_size  : zkPull.attendance_size,
      record_count     : (zkPull.records || []).length,
      capped_to        : beforeCapCount > cap ? cap : null,
      errors           : zkPull.errors,
      pull_diagnostics,
    },
    ingest,
    attendance_processing,
  };
}

/**
 * Scans unresolved device_logs (employee_id IS NULL) and tries to match them to employees.
 * This is useful if logs were pushed BEFORE the employee was imported/created.
 */
async function reResolveUnresolvedLogs(company_id) {
  const logs = await DeviceLog.findAll({
    where: { company_id, employee_id: null },
    attributes: ['id', 'card_number'],
  });

  if (logs.length === 0) return { total: 0, resolved: 0 };

  const pinQuery = new Set();
  const normalizeBioId = (v) => String(v || '').trim().toUpperCase();
  const expand = (b) => {
    const keys = new Set();
    if (!b) return keys;
    keys.add(b);
    if (/^\d+$/.test(b)) {
      const n = parseInt(b, 10);
      keys.add(String(n));
      for (let w = 1; w <= 9; w += 1) keys.add(String(n).padStart(w, '0'));
    }
    return keys;
  };

  for (const l of logs) {
    for (const k of expand(normalizeBioId(l.card_number))) pinQuery.add(k);
  }

  const employees = await Employee.findAll({
    where: { company_id, employee_number: { [Op.in]: [...pinQuery].filter(Boolean) } },
    attributes: ['id', 'employee_number'],
  });

  const empMap = {};
  for (const e of employees) {
    for (const k of expand(normalizeBioId(e.employee_number))) empMap[k] = e.id;
  }

  let resolved = 0;
  for (const log of logs) {
    const card = normalizeBioId(log.card_number);
    const eid = empMap[card];
    if (eid) {
      await DeviceLog.update({ employee_id: eid }, { where: { id: log.id } });
      resolved++;
    }
  }

  return { total: logs.length, resolved };
}

// ── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  // Device CRUD
  listDevices, getDevice, createDevice, updateDevice, deactivateDevice, rotateApiKey,
  // Push + heartbeat
  pushLogs, heartbeat,
  // Log queries
  listLogs, getLog, markForReprocess,
  syncDeviceUsers,
  listEmployeesForDevicePicker,
  probeDeviceConnection,
  probeZkSocket,
  debugZkConnection,
  readZkFromRegisteredDevice,
  listZkUsersOnDevice,
  importZkUsersToEmployees,
  setZkDeviceUserPrivilege,
  unlockDeviceZkSession,
  importZkAttendancesToDeviceLogs,
  getPushConfig,
  simulateTestIngest,
  reResolveUnresolvedLogs,
};
