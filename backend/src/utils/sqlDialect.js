'use strict';

/**
 * Provides tiny SQL fragments that differ by SQL dialect.
 * Usage: const { concat, sumIf, yearOf, daysAgo } = require('./sqlDialect');
 */

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const envDialect = String(process.env.DB_DIALECT || '').trim().toLowerCase();
const inferredDialect = /^postgres(ql)?:\/\//i.test(databaseUrl)
  ? 'postgres'
  : (envDialect === 'postgresql' ? 'postgres' : (envDialect || 'mysql'));

const isSQLite = inferredDialect === 'sqlite';
const isPostgres = inferredDialect === 'postgres';
const { ymdInTimeZone, DEFAULT_IANA, addCalendarDaysYmd } = require('./timezone');

/**
 * Concatenate two columns with a space separator.
 * MySQL:    CONCAT(a,' ',b)
 * SQLite:   (a || ' ' || b)
 * Postgres: (a || ' ' || b)
 */
const concat = (a, b) =>
  (isSQLite || isPostgres)
    ? `(COALESCE(${a},'') || ' ' || COALESCE(${b},''))`
    : `CONCAT(COALESCE(${a},''),' ',COALESCE(${b},''))`;

/**
 * Conditional SUM (count rows where condition is true).
 * MySQL:    SUM(col = 'VALUE')
 * SQLite:   SUM(CASE WHEN col = 'VALUE' THEN 1 ELSE 0 END)
 * Postgres: SUM(CASE WHEN col = 'VALUE' THEN 1 ELSE 0 END)
 */
const sumIf = (col, val) =>
  (isSQLite || isPostgres)
    ? `SUM(CASE WHEN ${col} = '${val}' THEN 1 ELSE 0 END)`
    : `SUM(${col} = '${val}')`;

/**
 * Extract year from a date column.
 * MySQL:    YEAR(col)
 * SQLite:   CAST(strftime('%Y', col) AS INTEGER)
 * Postgres: EXTRACT(YEAR FROM col)
 */
const yearOf = (col) =>
  isSQLite
    ? `CAST(strftime('%Y', ${col}) AS INTEGER)`
    : (isPostgres ? `EXTRACT(YEAR FROM ${col})` : `YEAR(${col})`);

/**
 * Returns an ISO date string for N days ago (safe cross-dialect parameter).
 */
const daysAgo = (n) => addCalendarDaysYmd(ymdInTimeZone(DEFAULT_IANA), -Number(n));

module.exports = { isSQLite, isPostgres, concat, sumIf, yearOf, daysAgo };
