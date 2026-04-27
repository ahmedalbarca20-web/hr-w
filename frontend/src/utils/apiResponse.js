'use strict';

/**
 * Normalise paginated API payloads from axios `response.data`:
 * `{ success, data: { data: rows[], meta } } }`
 * (some older code used `records`, `requests`, `announcements`, `runs`, etc.)
 */
export function listFromPageResponse(apiBody) {
  const inner = apiBody?.data;
  if (!inner) return { rows: [], totalPages: 1 };
  if (Array.isArray(inner)) return { rows: inner, totalPages: 1 };

  const rows =
    inner.data
    ?? inner.records
    ?? inner.rows
    ?? inner.requests
    ?? inner.announcements
    ?? inner.runs
    ?? [];

  const meta = inner.meta || {};
  const totalPages = meta.totalPages ?? meta.total_pages ?? 1;

  return { rows: Array.isArray(rows) ? rows : [], totalPages };
}
