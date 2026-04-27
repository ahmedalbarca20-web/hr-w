'use strict';

/**
 * zkteco-js decodes ZK user names with `.toString('ascii')`, which corrupts Arabic
 * and other UTF-8 names stored on the device. Patch the shared helper **before**
 * `require('zkteco-js')` loads ztcp (ztcp destructures decode* at load time, so this
 * file must be required first from zktecoSocket.service.js).
 */

function decodeNameField(buf, start, maxLen) {
  if (!buf || start >= buf.length) return '';
  const end = Math.min(buf.length, start + maxLen);
  const slice = buf.subarray(start, end);
  const z = slice.indexOf(0);
  const raw = z >= 0 ? slice.subarray(0, z) : slice;
  if (raw.length === 0) return '';

  let utf = raw.toString('utf8').replace(/\uFFFD/g, '').trim();
  if (utf && /[^\u0000-\u007F]/.test(utf)) return utf;

  const latin = raw.toString('latin1').trim();
  if (latin) {
    try {
      const recovered = Buffer.from(latin, 'latin1').toString('utf8').replace(/\uFFFD/g, '').trim();
      if (recovered && /[^\u0000-\u007F]/.test(recovered)) return recovered;
    } catch (_) { /* ignore */ }
    if (/[^\x00-\x7F]/.test(latin)) return latin;
  }

  return raw.toString('ascii').replace(/\0/g, '').trim();
}

/**
 * Byte at offset 2 = «permission token» (zk-protocol): bits 3–1 = P2P1P0 (0 common, 1 enroll, 3 admin, 7 super),
 * bit 0 = disabled. القيمة الخام 6 و 14 تعني مديراً وليس «مشرفاً» مقارنةً بثوابت pyzk القديمة.
 */
function enrichZkPermissionToken(userData, u) {
  try {
    if (!userData || userData.length < 3) return;
    const token = userData.readUInt8(2) & 0xff;
    u.zk_permission_level = (token >> 1) & 7;
    u.zk_user_disabled = (token & 1) === 1;
  } catch (_) { /* keep role from decoder */ }
}

/** ثمانية بايت PIN كما على الجهاز (لإعادة كتابة setUser دون فقدان بايتات غير ASCII). داخلي — يُزال من استجابة API. */
function enrichZkPin8B64(userData, u) {
  try {
    if (!userData || userData.length < 11) return;
    u.__zk_pin8_b64 = userData.subarray(3, 11).toString('base64');
  } catch (_) { /* ignore */ }
}

function applyPatch() {
  try {
    const utilsPath = require.resolve('zkteco-js/src/helper/utils.js');
    const utils = require(utilsPath);
    if (utils.__hrZkUserNamePatch) return;

    const orig72 = utils.decodeUserData72;
    utils.decodeUserData72 = function decodeUserData72Hr(userData) {
      const u = orig72(userData);
      enrichZkPermissionToken(userData, u);
      enrichZkPin8B64(userData, u);
      try {
        const n = decodeNameField(userData, 11, 48);
        if (n) u.name = n;
      } catch (_) { /* keep orig */ }
      return u;
    };

    const orig28 = utils.decodeUserData28;
    utils.decodeUserData28 = function decodeUserData28Hr(userData) {
      const u = orig28(userData);
      enrichZkPermissionToken(userData, u);
      try {
        const n = decodeNameField(userData, 8, 8);
        if (n) u.name = n;
      } catch (_) { /* keep orig */ }
      return u;
    };

    utils.__hrZkUserNamePatch = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[zkUserDecodePatch]', e.message || e);
  }
}

module.exports = { applyPatch, decodeNameField, enrichZkPermissionToken };
