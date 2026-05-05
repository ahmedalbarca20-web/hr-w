'use strict';

const util = require('util');
require('../utils/zkUserDecodePatch').applyPatch();
const ZktecoJs = require('zkteco-js');
require('../utils/zktecoJsUdpFallbackPatch').applyPatch();
const { COMMANDS: ZK_COMMANDS } = require('zkteco-js/src/helper/command');

/**
 * zkteco-js throws custom `ZkError` objects: `{ err, command, ip }` — often no useful `.message` on the wrapper.
 * `e.err` may wrap another layer; the real Node `systemError` is usually at `e.err.err`.
 * @see https://coding-libs.github.io/zkteco-js/ — upstream warns it is not production-ready.
 * Pull sequence follows common ZK practice (e.g. https://github.com/fananimi/pyzk ): connect, optional
 * buffer clear (`free_data` / CMD_FREE_DATA), disable during bulk read, then enable and disconnect.
 * zkteco-js also calls `freeData` inside `getAttendances`; we still run `freeData` once after connect so
 * `getAttendanceSize` runs against a clean buffer when the last session ended mid-transfer.
 */
function digNodeSystemError(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 8) return null;
  if (obj.name === 'AggregateError' && Array.isArray(obj.errors)) {
    for (const sub of obj.errors) {
      const inner = digNodeSystemError(sub, depth + 1);
      if (inner) return inner;
    }
  }
  if (obj.code && (obj.syscall || obj.address != null || obj.port != null)) return obj;
  if (obj.err) return digNodeSystemError(obj.err, depth + 1);
  return null;
}

function formatProbeError(e) {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (typeof e.message === 'string' && e.message && e.err === undefined) {
    return e.code ? `${e.message} (${e.code})` : e.message;
  }

  const sys = digNodeSystemError(e);
  if (sys) {
    const where = [sys.address, sys.port].filter((x) => x != null).join(':');
    const tail = where ? ` (${where})` : '';
    const base = sys.message || `${sys.syscall || 'socket'}${tail}`;
    return sys.code ? `${sys.code}: ${base}` : base;
  }

  if (e.err && typeof e.err === 'object') {
    const innerMsg = e.err.message != null ? String(e.err.message) : '';
    const innerCode = e.err.code != null ? String(e.err.code) : '';
    const trace = [innerMsg, innerCode && `code=${innerCode}`].filter(Boolean).join(' ');
    const meta = [e.command != null && String(e.command), e.ip != null && String(e.ip)]
      .filter(Boolean)
      .join(' @ ');
    const combined = [trace, meta].filter(Boolean).join(' — ');
    return combined || util.inspect(e, { depth: 6 });
  }
  try {
    return JSON.stringify(e, Object.getOwnPropertyNames(e));
  } catch {
    return util.inspect(e, { depth: 6 });
  }
}

function errorCodeFromException(e) {
  const sys = digNodeSystemError(e);
  if (sys && sys.code) return sys.code;
  if (e && typeof e === 'object' && e.name === 'AggregateError' && Array.isArray(e.errors)) {
    for (const sub of e.errors) {
      const c = errorCodeFromException(sub);
      if (c) return c;
    }
  }
  if (e && e.err && e.err.code && typeof e.err.code === 'string') return e.err.code;
  if (e && e.code) return e.code;
  return null;
}

/** TCP returns `{ data: users[] }`; UDP may return `{ data, err }`. */
function normalizeGetUsersResult(raw) {
  if (raw == null) return { users: [], partialErr: null };
  if (Array.isArray(raw)) return { users: raw, partialErr: null };
  if (typeof raw === 'object' && Array.isArray(raw.data)) {
    return { users: raw.data, partialErr: raw.err || null };
  }
  return { users: [], partialErr: null };
}

/** ZK CMD_ENABLE_DEVICE — يفك وضع «إيقاف/قفل الشاشة» بعد سحب بصمات أو جلسة منقطعة. */
async function zkSafeEnableDevice(zk) {
  try {
    if (zk.connectionType === 'tcp' || zk.connectionType === 'udp') {
      await zk.enableDevice();
    }
  } catch (_) { /* ignore */ }
}

/**
 * تسلسل أقوى لفتح الجهاز: تكرار enable مع مهلة قصيرة ثم freeData + enable مرة أخرى.
 * بعض واجهات ZK تبقى «مقفولة» بعد setUser أو سحب بصمات حتى يُكرّر أمر التفعيل.
 */
async function zkFullUnlockSequence(zk, opts = {}) {
  const passes = Number.isFinite(Number(opts.passes)) ? Math.min(10, Math.max(1, Number(opts.passes))) : 4;
  const delayMs = Number.isFinite(Number(opts.delayMs)) ? Math.min(400, Math.max(0, Number(opts.delayMs))) : 130;
  const useFreeData = opts.useFreeData !== false;
  for (let i = 0; i < passes; i += 1) {
    await zkSafeEnableDevice(zk);
    if (i < passes - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  if (useFreeData) {
    try {
      await zk.freeData();
    } catch (_) { /* ignore */ }
    await zkSafeEnableDevice(zk);
  }
}

/** ثمانية بايت PIN كما على الجهاز، أو من السلسلة النصية (ASCII/أرقام). */
function zkResolvePin8(pin8_b64, passwordStr) {
  if (pin8_b64 != null && String(pin8_b64).length > 0) {
    try {
      const b = Buffer.from(String(pin8_b64), 'base64');
      if (b.length === 8) return Buffer.from(b);
    } catch (_) { /* use string */ }
  }
  const out = Buffer.alloc(8, 0);
  const s = String(passwordStr != null ? passwordStr : '').replace(/\0/g, '').slice(0, 8);
  Buffer.from(s, 'latin1').copy(out, 0, 0, Math.min(8, s.length));
  return out;
}

/**
 * حزمة CMD_USER_WRQ 72 بايت — متوافقة مع decodeUserData72: صلاحية بايت واحد عند 2، PIN عند 3–10.
 * مكتبة zkteco-js تكتب UInt16 للدور عند 2؛ القراءة تستخدم بايتاً واحداً عند 2.
 */
function zkBuildSetUserPayload72({ uid, role, pin8, name, cardno, userId }) {
  const buf = Buffer.alloc(72, 0);
  const uidn = Math.max(1, Math.min(3000, Number(uid)));
  buf.writeUInt16LE(uidn, 0);
  buf.writeUInt8(Number.isFinite(Number(role)) ? Number(role) & 0xff : 0, 2);
  const pin = Buffer.alloc(8, 0);
  if (Buffer.isBuffer(pin8) && pin8.length) pin8.copy(pin, 0, 0, Math.min(8, pin8.length));
  pin.copy(buf, 3, 0, 8);
  let nameStr = String(name != null ? name : '').trim();
  if (!nameStr) nameStr = `U${uidn}`;
  if (nameStr.length > 24) nameStr = nameStr.slice(0, 24);
  buf.write(nameStr.padEnd(24, '\0'), 11, 24, 'utf8');
  const c = Number.isFinite(Number(cardno)) && Number(cardno) > 0 ? Number(cardno) : 0;
  buf.writeUInt16LE(Math.trunc(c) & 0xffff, 35);
  buf.writeUInt32LE(0, 40);
  const uidStr = String(userId != null ? userId : '').trim().slice(0, 9);
  buf.write(uidStr.padEnd(9, '\0'), 48, 9, 'latin1');
  return buf;
}

/**
 * @param {object} opts
 * @param {string} opts.ip
 * @param {number} [opts.port=4370]
 * @param {number} [opts.socket_timeout_ms=8000]
 * @param {number} [opts.udp_local_port=5000]
 * @param {boolean} [opts.include_users=true]
 * @param {number} [opts.max_users=80]
 * @param {boolean} [opts.include_attendance_size=true]
 * @param {boolean} [opts.minimal_probe=false] — skip version/time/extra calls; only serial (+ getInfo if serial missing)
 */
async function probeSnapshot(opts) {
  const ip = typeof opts.ip === 'string' ? opts.ip.trim() : '';
  const port = Number.isFinite(Number(opts.port)) && Number(opts.port) > 0 ? Number(opts.port) : 4370;
  const socket_timeout_ms = Number.isFinite(Number(opts.socket_timeout_ms))
    ? Math.min(60000, Math.max(2000, Number(opts.socket_timeout_ms)))
    : 8000;
  const envUdp = Number.parseInt(String(process.env.ZK_UDP_LOCAL_PORT || '').trim(), 10);
  const udp_local_port = Number.isFinite(Number(opts.udp_local_port))
    ? Math.min(65535, Math.max(1024, Number(opts.udp_local_port)))
    : (Number.isFinite(envUdp) && envUdp >= 1024 && envUdp <= 65535
      ? envUdp
      : 40000 + Math.floor(Math.random() * 20000));
  const minimal_probe = opts.minimal_probe === true;
  const include_users = !minimal_probe && opts.include_users !== false;
  const max_users = Math.min(500, Math.max(1, Number(opts.max_users) || 80));
  const include_attendance_size = !minimal_probe && opts.include_attendance_size !== false;

  const zk = new ZktecoJs(ip, port, socket_timeout_ms, udp_local_port);
  const result = {
    ok                 : false,
    connection_type    : null,
    library            : 'zkteco-js',
    library_note       : 'Third-party library; authors do not recommend production use.',
    errors             : [],
    serial_number      : null,
    firmware_version   : null,
    device_time        : null,
    info               : null,
    user_sample        : null,
    user_count_on_device: null,
    attendance_size    : null,
  };

  const safe = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      const code = errorCodeFromException(e);
      result.errors.push({
        step   : label,
        message: formatProbeError(e),
        ...(code ? { code } : {}),
      });
      return null;
    }
  };

  try {
    await zk.createSocket();
    result.ok = true;
    result.connection_type = zk.connectionType;

    result.serial_number = await safe('getSerialNumber', () => zk.getSerialNumber());
    const serialFilled = result.serial_number != null && String(result.serial_number).trim() !== '';

    if (minimal_probe) {
      if (!serialFilled) {
        result.info = await safe('getInfo', () => zk.getInfo());
      }
    } else {
      result.firmware_version = await safe('getDeviceVersion', () => zk.getDeviceVersion());
      result.device_time = await safe('getTime', () => zk.getTime());
      result.info = await safe('getInfo', () => zk.getInfo());
    }

    if (include_users) {
      const rawUsers = await safe('getUsers', () => zk.getUsers());
      if (rawUsers !== null) {
        const { users, partialErr } = normalizeGetUsersResult(rawUsers);
        if (partialErr) {
          result.errors.push({
            step   : 'getUsers',
            message: formatProbeError(partialErr) || 'getUsers returned err',
            ...(errorCodeFromException(partialErr) ? { code: errorCodeFromException(partialErr) } : {}),
          });
        }
        result.user_count_on_device = users.length;
        result.user_sample = users.slice(0, max_users);
      }
    }

    if (include_attendance_size) {
      const sz = await safe('getAttendanceSize', () => zk.getAttendanceSize());
      if (sz != null) result.attendance_size = sz;
    }
  } catch (e) {
    result.ok = false;
    const code = errorCodeFromException(e);
    const message = formatProbeError(e);
    result.errors.unshift({
      step   : 'createSocket',
      message,
      ...(code ? { code } : {}),
    });
    if (code === 'ECONNREFUSED' || /ECONNREFUSED|refused/i.test(message)) {
      const vercel = String(process.env.VERCEL || '').trim() === '1';
      result.hint_ar = vercel
        ? 'رفض الاتصال: خادم Vercel لا يصل لعناوين الشبكة الداخلية (192.168.x). شغّل الـ API على جهاز بنفس LAN الجهاز أو استخدم جسر DTR_ZKTECO_API_URL.'
        : 'رفض الاتصال على منفذ ZK (غالباً 4370): تأكد أن الجهاز على الشبكة، والمنفذ مفتوح، وأن عملية Node التي تشغّل الـ API على نفس LAN (جرّب من جهازك: npm run dev:all من مجلد المشروع).';
    } else if (code === 'ETIMEDOUT' || /time.?out/i.test(message)) {
      result.hint_ar =
        'انتهت مهلة الاتصال (TCP/UDP): غالباً الجهاز غير reachable من هذه الحاسبة. تحقق: (1) من شاشة الجهاز أو الراوتر أن IP الجهاز فعلاً هذا العنوان، (2) حاسبة الـ API على نفس نطاق الشبكة (مثلاً 192.168.0.x مع 192.168.0.47)، (3) ping من نفس الجهاز، (4) جدار Windows أو «عزل عملاء» WiFi لا يمنع المنفذ 4370، (5) إن كان الـ API على سحابة استخدم جسر LAN.';
    } else if (code === 'EHOSTUNREACH' || /host.*unreach/i.test(message)) {
      result.hint_ar = 'العنوان غير reachable من جهاز الخادم — لا يمكن الوصول للجهاز من شبكة الخادم.';
    }
  } finally {
    try {
      if (zk.connectionType === 'tcp' || zk.connectionType === 'udp') {
        await zk.disconnect();
      }
    } catch (_) { /* ignore */ }
  }

  return result;
}

/**
 * Pull full attendance log buffer from the device (same protocol as zkteco-js README).
 * TCP yields 40-byte records (in/out state); UDP may yield 16-byte records without state.
 *
 * @param {object} opts
 * @param {string} opts.ip
 * @param {number} [opts.port=4370]
 * @param {number} [opts.socket_timeout_ms=90000] — attendance download can be slow
 * @param {number} [opts.udp_local_port] — random high port if omitted (avoids EADDRINUSE with parallel pulls)
 */
function extractAttendanceRecords(raw) {
  if (raw == null) return { records: [], partialErr: null };
  if (Array.isArray(raw)) return { records: raw, partialErr: null };
  if (typeof raw === 'object') {
    const rec = Array.isArray(raw.data) ? raw.data : [];
    return { records: rec, partialErr: raw.err || null };
  }
  return { records: [], partialErr: null };
}

/**
 * One connection attempt: optional disable → size → attendances → enable → disconnect.
 * @param {boolean} withDisable
 * @returns {Promise<{ ok: boolean, connection_type: string|null, attendance_size: any, records: any[], errors: any[] }>}
 */
async function fetchAttendanceLogsOnce(opts, withDisable) {
  const ip = typeof opts.ip === 'string' ? opts.ip.trim() : '';
  const port = Number.isFinite(Number(opts.port)) && Number(opts.port) > 0 ? Number(opts.port) : 4370;
  const socket_timeout_ms = Number.isFinite(Number(opts.socket_timeout_ms))
    ? Math.min(180000, Math.max(5000, Number(opts.socket_timeout_ms)))
    : 90000;
  const udp_local_port = Number.isFinite(Number(opts.udp_local_port))
    ? Math.min(65535, Math.max(1024, Number(opts.udp_local_port)))
    : 40000 + Math.floor(Math.random() * 20000);

  const zk = new ZktecoJs(ip, port, socket_timeout_ms, udp_local_port);
  const result = {
    ok                 : false,
    connection_type    : null,
    attendance_size    : null,
    records            : [],
    errors             : [],
    with_disable       : withDisable,
  };

  const safe = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      const code = errorCodeFromException(e);
      result.errors.push({
        step   : label,
        message: formatProbeError(e),
        ...(code ? { code } : {}),
      });
      return null;
    }
  };

  try {
    await zk.createSocket();
    result.ok = true;
    result.connection_type = zk.connectionType;

    await safe('freeData', () => zk.freeData());

    if (withDisable) {
      await safe('disableDevice', () => zk.disableDevice());
    }

    const sz = await safe('getAttendanceSize', () => zk.getAttendanceSize());
    if (sz != null) result.attendance_size = sz;

    const raw = await safe('getAttendances', () => zk.getAttendances(() => {}));
    if (raw != null) {
      const { records, partialErr } = extractAttendanceRecords(raw);
      result.records = records;
      if (partialErr) {
        result.errors.push({
          step   : 'getAttendances',
          message: formatProbeError(partialErr) || 'getAttendances returned err',
          ...(errorCodeFromException(partialErr) ? { code: errorCodeFromException(partialErr) } : {}),
        });
      }
    }

    /** Names as on device (UTF-8) for enriching attendance rows — same TCP session. */
    const rawUsers = await safe('getUsers', () => zk.getUsers());
    if (rawUsers != null) {
      const { users, partialErr } = normalizeGetUsersResult(rawUsers);
      result.device_users = users;
      if (partialErr) {
        result.errors.push({
          step   : 'getUsers_after_attendance',
          message: formatProbeError(partialErr) || 'getUsers returned err',
          ...(errorCodeFromException(partialErr) ? { code: errorCodeFromException(partialErr) } : {}),
        });
      }
    }
  } catch (e) {
    result.ok = false;
    const code = errorCodeFromException(e);
    result.errors.unshift({
      step   : 'createSocket',
      message: formatProbeError(e),
      ...(code ? { code } : {}),
    });
  } finally {
    try {
      if (zk.connectionType === 'tcp' || zk.connectionType === 'udp') {
        try {
          await zk.enableDevice();
        } catch (_) { /* ignore */ }
        await zk.disconnect();
      }
    } catch (_) { /* ignore */ }
  }

  return result;
}

async function fetchAttendanceLogs(opts) {
  const first = await fetchAttendanceLogsOnce(opts, true);
  const n = (first.records || []).length;
  const sz = first.attendance_size;
  const szNum = Number(sz);
  const hasSize = sz != null && Number.isFinite(szNum) && szNum > 0;
  if (first.ok && n === 0 && hasSize) {
    const second = await fetchAttendanceLogsOnce(opts, false);
    second.attendance_retry_without_disable = true;
    if (!second.device_users?.length && first.device_users?.length) {
      second.device_users = first.device_users;
    }
    if ((second.records || []).length > n) {
      return second;
    }
    first.attendance_retry_without_disable = true;
    first.errors.push({
      step   : 'getAttendances',
      message: 'Retry without disableDevice also returned 0 rows while device reports attendance records — check firmware, timeout, or LAN.',
    });
  }
  return first;
}

/**
 * Full user list from device (getUsers) — one session; use before setZkUserWrite when UID may be beyond probe sample cap.
 * @param {object} opts — ip, port?, socket_timeout_ms?, udp_local_port?
 * @returns {{ ok: boolean, users: object[], errors: object[], connection_type: string|null }}
 */
async function fetchZkUsersList(opts) {
  const ip = typeof opts.ip === 'string' ? opts.ip.trim() : '';
  const port = Number.isFinite(Number(opts.port)) && Number(opts.port) > 0 ? Number(opts.port) : 4370;
  const socket_timeout_ms = Number.isFinite(Number(opts.socket_timeout_ms))
    ? Math.min(120000, Math.max(8000, Number(opts.socket_timeout_ms)))
    : 45000;
  const udp_local_port = Number.isFinite(Number(opts.udp_local_port))
    ? Math.min(65535, Math.max(1024, Number(opts.udp_local_port)))
    : 5000;

  const zk = new ZktecoJs(ip, port, socket_timeout_ms, udp_local_port);
  const result = {
    ok                 : false,
    users              : [],
    errors             : [],
    connection_type    : null,
  };

  try {
    await zk.createSocket();
    result.ok = true;
    result.connection_type = zk.connectionType;
    const rawUsers = await zk.getUsers();
    const { users, partialErr } = normalizeGetUsersResult(rawUsers);
    result.users = users || [];
    if (partialErr) {
      result.errors.push({
        step   : 'getUsers',
        message: formatProbeError(partialErr) || 'getUsers returned err',
        ...(errorCodeFromException(partialErr) ? { code: errorCodeFromException(partialErr) } : {}),
      });
    }
  } catch (e) {
    result.ok = false;
    const code = errorCodeFromException(e);
    result.errors.push({
      step   : 'createSocket_or_getUsers',
      message: formatProbeError(e),
      ...(code ? { code } : {}),
    });
  } finally {
    try {
      if (zk.connectionType === 'tcp' || zk.connectionType === 'udp') {
        await zkFullUnlockSequence(zk, { passes: 3, delayMs: 80, useFreeData: true });
        await zk.disconnect();
      }
    } catch (_) { /* ignore */ }
  }

  return result;
}

/**
 * جلسة قصيرة: اتصال + تفعيل الجهاز (فك القفل) ثم قطع الاتصال — قبل تعديل المستخدمين أو عند بقاء الشاشة مقفولة.
 * @param {object} opts — ip, port?, socket_timeout_ms?, udp_local_port?
 */
async function unlockZkDevice(opts) {
  const ip = typeof opts.ip === 'string' ? opts.ip.trim() : '';
  const port = Number.isFinite(Number(opts.port)) && Number(opts.port) > 0 ? Number(opts.port) : 4370;
  const socket_timeout_ms = Number.isFinite(Number(opts.socket_timeout_ms))
    ? Math.min(120000, Math.max(8000, Number(opts.socket_timeout_ms)))
    : 45000;
  const udp_local_port = Number.isFinite(Number(opts.udp_local_port))
    ? Math.min(65535, Math.max(1024, Number(opts.udp_local_port)))
    : 5000;

  const zk = new ZktecoJs(ip, port, socket_timeout_ms, udp_local_port);
  const result = {
    ok                 : false,
    errors             : [],
    connection_type    : null,
  };

  try {
    await zk.createSocket();
    result.connection_type = zk.connectionType;
    try {
      await zk.freeData();
    } catch (_) { /* ignore */ }
    await zkFullUnlockSequence(zk, { passes: 6, delayMs: 160, useFreeData: true });
    result.ok = true;
  } catch (e) {
    const code = errorCodeFromException(e);
    result.errors.push({
      step   : 'unlockZkDevice',
      message: formatProbeError(e),
      ...(code ? { code } : {}),
    });
  } finally {
    try {
      if (zk.connectionType === 'tcp' || zk.connectionType === 'udp') {
        await zkFullUnlockSequence(zk, { passes: 4, delayMs: 120, useFreeData: true });
        await zk.disconnect();
      }
    } catch (_) { /* ignore */ }
  }

  return result;
}

/**
 * Write one user row to the device (ZK TCP setUser). Role: 0 = normal (pyzk USER_DEFAULT), 14 = device admin (USER_ADMIN).
 * @param {object} opts
 */
async function setZkUserWrite(opts) {
  const ip = typeof opts.ip === 'string' ? opts.ip.trim() : '';
  const port = Number.isFinite(Number(opts.port)) && Number(opts.port) > 0 ? Number(opts.port) : 4370;
  const socket_timeout_ms = Number.isFinite(Number(opts.socket_timeout_ms))
    ? Math.min(120000, Math.max(12000, Number(opts.socket_timeout_ms)))
    : 55000;
  const udp_local_port = Number.isFinite(Number(opts.udp_local_port))
    ? Math.min(65535, Math.max(1024, Number(opts.udp_local_port)))
    : 5000;

  const uid = Number(opts.uid);
  if (!Number.isInteger(uid) || uid < 1 || uid > 3000) {
    return { ok: false, errors: [{ step: 'validate', message: 'uid must be an integer 1–3000' }], connection_type: null };
  }

  let userid = String(opts.userId != null ? opts.userId : opts.userid != null ? opts.userid : '').trim();
  if (userid.length > 9) userid = userid.slice(0, 9);

  let name = String(opts.name != null ? opts.name : '').trim();
  if (name.length > 24) name = name.slice(0, 24);
  if (!name) name = `U${uid}`.slice(0, 24);

  let password = String(opts.password != null ? opts.password : '');
  password = password.replace(/\0/g, '');
  if (password.length > 8) password = password.slice(0, 8);

  const role = Number.isFinite(Number(opts.role)) ? Number(opts.role) : 0;
  const cardno = Number.isFinite(Number(opts.cardno)) && Number(opts.cardno) > 0 ? Number(opts.cardno) : 0;

  const zk = new ZktecoJs(ip, port, socket_timeout_ms, udp_local_port);
  const result = {
    ok                 : false,
    errors             : [],
    connection_type    : null,
  };

  try {
    await zk.createSocket();
    result.connection_type = zk.connectionType;
    await zkSafeEnableDevice(zk);
    const pin8Buf = zkResolvePin8(opts.pin8_b64, password);
    if (zk.connectionType === 'tcp') {
      const packet = zkBuildSetUserPayload72({
        uid,
        role,
        pin8    : pin8Buf,
        name,
        cardno,
        userId  : userid,
      });
      await zk.ztcp.executeCmd(ZK_COMMANDS.CMD_USER_WRQ, packet);
    } else {
      const passStr = pin8Buf.toString('latin1').replace(/\0/g, '');
      await zk.setUser(uid, userid, name, passStr.length > 8 ? passStr.slice(0, 8) : passStr, role, cardno);
    }
    result.ok = true;
    await zkFullUnlockSequence(zk, { passes: 6, delayMs: 140, useFreeData: true });
  } catch (e) {
    const code = errorCodeFromException(e);
    result.errors.push({
      step   : 'setUser',
      message: formatProbeError(e),
      ...(code ? { code } : {}),
    });
    result.hint_ar = 'تعديل المستخدم يتطلّب غالباً اتصال TCP بمنفذ الجهاز؛ بعض الأجهزة لا تدعم setUser عبر UDP.';
  } finally {
    try {
      if (zk.connectionType === 'tcp' || zk.connectionType === 'udp') {
        await zkFullUnlockSequence(zk, { passes: 5, delayMs: 130, useFreeData: true });
        await zk.disconnect();
      }
    } catch (_) { /* ignore */ }
  }

  return result;
}

module.exports = { probeSnapshot, fetchAttendanceLogs, fetchZkUsersList, setZkUserWrite, unlockZkDevice };
