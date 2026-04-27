'use strict';

/**
 * Names and conventions from classic ZK / Att-style SQL schemas (e.g. sqlserver.sql
 * under AttMid-east). Used for migration hints or CSV/SQL exports — not live DB tables here.
 *
 * @see backend/reference/zk-attclassic-sqlserver-schema.sql
 */

/** Primary punch table in classic ZK SQL exports */
const TABLE_CHECKINOUT = 'CHECKINOUT';

/** Employee / device user master in classic schema */
const TABLE_USERINFO = 'USERINFO';

/** CHECKTYPE single-char as stored by many ZK SQL adapters */
const CHECKTYPE_IN = 'I';
const CHECKTYPE_OUT = 'O';

/** Column names on CHECKINOUT (SQL Server style) */
const CHECKINOUT_COLS = Object.freeze({
  userId      : 'USERID',
  checkTime   : 'CHECKTIME',
  checkType   : 'CHECKTYPE',
  verifyCode  : 'VERIFYCODE',
  sensorId    : 'SENSORID',
});

/** Column names on USERINFO */
const USERINFO_COLS = Object.freeze({
  userId       : 'USERID',
  badgeNumber  : 'BADGENUMBER',
  name         : 'NAME',
  password     : 'PASSWORD',
  defaultDeptId: 'DEFAULTDEPTID',
});

/**
 * Map classic CHECKTYPE to our device_log-style event_type (uppercase).
 * @param {string|null|undefined} checkType
 * @returns {'CHECK_IN'|'CHECK_OUT'|'OTHER'}
 */
function mapClassicCheckTypeToEventType(checkType) {
  const c = String(checkType || '').trim().toUpperCase();
  if (c === 'I' || c === '0') return 'CHECK_IN';
  if (c === 'O' || c === '1') return 'CHECK_OUT';
  return 'OTHER';
}

module.exports = {
  TABLE_CHECKINOUT,
  TABLE_USERINFO,
  CHECKTYPE_IN,
  CHECKTYPE_OUT,
  CHECKINOUT_COLS,
  USERINFO_COLS,
  mapClassicCheckTypeToEventType,
};
