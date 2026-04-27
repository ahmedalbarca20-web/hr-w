'use strict';

/**
 * Provides tiny SQL fragments that differ between MySQL and SQLite.
 * Usage:  const { concat, sumIf, yearOf, sevenDaysAgo } = require('./sqlDialect');
 */

const isSQLite = (process.env.DB_DIALECT || 'mysql') === 'sqlite';
const { ymdInTimeZone, DEFAULT_IANA, addCalendarDaysYmd } = require('./timezone');

/**
 * Concatenate two columns with a space separator.
 * MySQL:   CONCAT(a,' ',b)
 * SQLite:  (a || ' ' || b)
 */
const concat = (a, b) =>
  isSQLite 
    ? `(COALESCE(${a},'') || ' ' || COALESCE(${b},''))` 
    : `CONCAT(COALESCE(${a},''),' ',COALESCE(${b},''))`;

/**
 * Conditional SUM (count rows where condition is true).
 * MySQL:   SUM(col = 'VALUE')       — returns 1 for true, 0 for false
 * SQLite:  SUM(CASE WHEN col = 'VALUE' THEN 1 ELSE 0 END)
 */
const sumIf = (col, val) =>
  isSQLite
    ? `SUM(CASE WHEN ${col} = '${val}' THEN 1 ELSE 0 END)`
    : `SUM(${col} = '${val}')`;

/**
 * Extract year from a date column.
 * MySQL:   YEAR(col)
 * SQLite:  CAST(strftime('%Y', col) AS INTEGER)
 */
const yearOf = (col) =>
  isSQLite ? `CAST(strftime('%Y', ${col}) AS INTEGER)` : `YEAR(${col})`;

/**
 * Returns an ISO date string for N days ago (safe cross-dialect parameter).
 * Instead of relying on database date functions, compute in JS.
 */
const daysAgo = (n) => addCalendarDaysYmd(ymdInTimeZone(DEFAULT_IANA), -Number(n));

module.exports = { isSQLite, concat, sumIf, yearOf, daysAgo };
