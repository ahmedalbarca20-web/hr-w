'use strict';

/**
 * Password hashing and comparison helpers using bcryptjs.
 * bcryptjs is a pure-JS implementation — no native bindings required.
 */

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

/**
 * Hash a plain-text password.
 * @param {string} password
 * @returns {Promise<string>} bcrypt hash
 */
const hashPassword = (password) => bcrypt.hash(password, SALT_ROUNDS);

/**
 * Compare a plain-text password against a stored bcrypt hash.
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
const comparePassword = (password, hash) => bcrypt.compare(password, hash);

module.exports = { hashPassword, comparePassword };
