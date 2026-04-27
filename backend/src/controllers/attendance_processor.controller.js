'use strict';

/**
 * Attendance Processor Controller
 *
 * Handles HTTP for:
 *   POST /api/process                            – bulk  (all employees for a date range)
 *   POST /api/process/employee/:employee_id      – single employee, date range
 *   POST /api/process/reprocess                  – reprocess (reset + re-run), date range
 */

const asyncHandler   = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const {
  processBulkSchema,
  processEmployeeSchema,
  reprocessSchema,
  surpriseAttendanceActivateSchema,
} = require('../utils/validators');
const svc = require('../services/attendance_processor.service');
const surpriseSvc = require('../services/surprise_attendance.service');
const { dateRangeInclusiveYmd } = require('../utils/timezone');

const resolveCompanyId = (req, res) => {
  if (req.user.company_id !== null && req.user.company_id !== undefined) return req.user.company_id;

  const raw = req.query.company_id ?? req.body?.company_id ?? null;
  const companyId = Number(raw);
  if (!Number.isInteger(companyId) || companyId < 1) {
    sendError(res, 'company_id is required for super admin', 422, 'VALIDATION_ERROR');
    return null;
  }

  return companyId;
};

/** Build an array of "YYYY-MM-DD" strings from date_from to date_to (inclusive). */
function dateRange(date_from, date_to) {
  return dateRangeInclusiveYmd(date_from, date_to);
}

// ── POST /api/process ─────────────────────────────────────────────────────────
exports.processBulk = asyncHandler(async (req, res) => {
  const parsed = processBulkSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');

  const { date_from, date_to, overwrite = false, dry_run = false } = parsed.data;
  const company_id = resolveCompanyId(req, res); if (!company_id) return;
  const dates = dateRange(date_from, date_to);

  const allProcessed = [];
  const allSkipped   = [];
  const allErrors    = [];

  for (const date of dates) {
    const result = await svc.processBulk(company_id, date, { overwrite, dry_run });
    if (dry_run) {
      // For dry-run just collect employee ids per date
      allProcessed.push({ date, employees_to_process: result.employees_to_process, employee_ids: result.employee_ids });
    } else {
      if (result.processed) allProcessed.push(...result.processed);
      if (result.skipped)   allSkipped.push(...result.skipped);
      if (result.errors)    allErrors.push(...result.errors);
    }
  }

  const responseData = dry_run
    ? { dry_run: true, date_from, date_to, dates: allProcessed }
    : {
        processed: allProcessed,
        skipped  : allSkipped,
        errors   : allErrors,
        summary  : {
          date_from, date_to, dates: dates.length,
          total    : allProcessed.length + allSkipped.length + allErrors.length,
          processed: allProcessed.length,
          skipped  : allSkipped.length,
          errors   : allErrors.length,
        },
      };

  sendSuccess(res, responseData, dry_run ? 'Dry run completed' : 'Bulk processing completed');
});

// ── POST /api/process/employee/:employee_id ───────────────────────────────────
exports.processEmployee = asyncHandler(async (req, res) => {
  const parsed = processEmployeeSchema.safeParse({
    ...req.body,
    employee_id: req.params.employee_id,
  });
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');

  const { date_from, date_to, overwrite = false, employee_id } = parsed.data;
  const company_id = resolveCompanyId(req, res); if (!company_id) return;
  const dates = dateRange(date_from, date_to);

  const results = [];
  for (const date of dates) {
    const result = await svc.processEmployeeDate(company_id, employee_id, date, { overwrite });
    results.push(result);
  }

  // Return single object when one date, array otherwise
  sendSuccess(res, dates.length === 1 ? results[0] : { processed: results }, 'Employee attendance processed');
});

// ── POST /api/process/reprocess ──────────────────────────────────────────────
exports.reprocess = asyncHandler(async (req, res) => {
  const parsed = reprocessSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');

  const { date_from, date_to, employee_id } = parsed.data;
  const company_id = resolveCompanyId(req, res); if (!company_id) return;
  const dates = dateRange(date_from, date_to);

  const allProcessed = [];
  const allSkipped   = [];
  const allErrors    = [];

  for (const date of dates) {
    const result = await svc.reprocess(company_id, date, employee_id ?? null);
    if (result.processed) allProcessed.push(...result.processed);
    else if (result.skipped) allSkipped.push({ date, ...result });
    else allProcessed.push({ date, ...result });
  }

  sendSuccess(res, {
    processed: allProcessed,
    skipped  : allSkipped,
    errors   : allErrors,
    summary  : { date_from, date_to, total: allProcessed.length + allSkipped.length },
  }, 'Reprocessing completed');
});

exports.activateSurpriseAttendance = asyncHandler(async (req, res) => {
  const parsed = surpriseAttendanceActivateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 422, 'VALIDATION_ERROR');
  const company_id = resolveCompanyId(req, res); if (!company_id) return;
  const event = await surpriseSvc.activate(company_id, req.user.sub, parsed.data);
  sendSuccess(res, event, 'Surprise attendance activated', 201);
});

exports.cancelSurpriseAttendance = asyncHandler(async (req, res) => {
  const company_id = resolveCompanyId(req, res); if (!company_id) return;
  const result = await surpriseSvc.cancelActive(company_id);
  sendSuccess(res, result, 'Surprise attendance cancelled');
});
