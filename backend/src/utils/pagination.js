'use strict';

/**
 * Pagination helpers.
 *
 * Usage:
 *   const { offset, limit } = paginate(page, limitParam);
 *   const { data, meta }    = paginateResult(rows, count, page, limit);
 */

/**
 * Convert page + limit to Sequelize offset/limit.
 * @param {number} page  1-based page number
 * @param {number} limit Rows per page
 * @returns {{ offset: number, limit: number }}
 */
/**
 * @param {number} page  1-based page number
 * @param {number} limit Rows per page (no artificial cap — callers validate via Zod if needed)
 */
const paginate = (page = 1, limit = 20) => {
  const p = Math.max(1, Number(page) || 1);
  let lim = Number(limit);
  if (!Number.isFinite(lim) || lim < 1) lim = 20;
  return {
    offset: (p - 1) * lim,
    limit: lim,
  };
};

/**
 * Wrap Sequelize findAndCountAll result into a paginated response shape.
 *
 * @param {object[]} rows
 * @param {number}   count   Total rows matching the query (without limit)
 * @param {number}   page
 * @param {number}   limit
 * @returns {{ data: object[], meta: object }}
 */
const paginateResult = (rows, count, page, limit) => ({
  data: rows,
  meta: {
    total      : count,
    page       : page,
    limit      : limit,
    totalPages : Math.ceil(count / limit),
    hasNext    : page < Math.ceil(count / limit),
    hasPrev    : page > 1,
  },
});

module.exports = { paginate, paginateResult };

