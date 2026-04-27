'use strict';

/**
 * Payroll routes
 *
 * GET  /api/payroll/components             – list salary components (AUTH)
 * POST /api/payroll/components             – create component (ADMIN)
 * PUT  /api/payroll/components/:id         – update (ADMIN)
 *
 * GET  /api/payroll/employee-components/:employee_id  – list emp components (HR|ADMIN)
 * POST /api/payroll/employee-components    – assign component (HR|ADMIN)
 * DELETE /api/payroll/employee-components/:id         – remove (HR|ADMIN)
 *
 * GET  /api/payroll/runs                  – list runs (HR|ADMIN)
 * POST /api/payroll/runs                  – create run (ADMIN)
 * GET  /api/payroll/runs/:id              – get run (HR|ADMIN)
 * POST /api/payroll/runs/:id/process      – process run (ADMIN)
 * PATCH /api/payroll/runs/:id/status      – approve/cancel run (ADMIN)
 * DELETE /api/payroll/runs/:id            – delete DRAFT (ADMIN)
 *
 * GET  /api/payroll/runs/:run_id/items    – list payslips (HR|ADMIN)
 * GET  /api/payroll/runs/:run_id/items/:id – get payslip (HR|ADMIN)
 */

const { Router } = require('express');
const ctrl = require('../controllers/payroll.controller');
const { authenticate }  = require('../middleware/auth.middleware');
const { requireRole, requireFeature } = require('../middleware/role.middleware');

const r = Router();
const HR_ADMIN = ['ADMIN','HR'];

r.use(authenticate);
r.use(requireFeature('payroll'));

// Salary components
r.get   ('/components',                         ctrl.listComponents);
r.post  ('/components',                         requireRole('ADMIN'), ctrl.createComponent);
r.put   ('/components/:id',                     requireRole('ADMIN'), ctrl.updateComponent);

// Per-employee components
r.get   ('/employee-components/:employee_id',   requireRole(...HR_ADMIN), ctrl.listEmpComponents);
r.post  ('/employee-components',                requireRole(...HR_ADMIN), ctrl.assignEmpComponent);
r.delete('/employee-components/:id',            requireRole(...HR_ADMIN), ctrl.removeEmpComponent);

// Payroll runs
r.get   ('/runs',                               requireRole(...HR_ADMIN), ctrl.listRuns);
r.post  ('/runs',                               requireRole('ADMIN'),     ctrl.createRun);
r.get   ('/runs/:id',                           requireRole(...HR_ADMIN), ctrl.getRun);
r.post  ('/runs/:id/process',                   requireRole('ADMIN'),     ctrl.processRun);
r.patch ('/runs/:id/status',                    requireRole('ADMIN'),     ctrl.updateRunStatus);
r.delete('/runs/:id',                           requireRole('ADMIN'),     ctrl.deleteRun);

// Payslips
r.get   ('/runs/:run_id/items',                 requireRole(...HR_ADMIN), ctrl.listItems);
r.get   ('/runs/:run_id/items/:id',             requireRole(...HR_ADMIN), ctrl.getItem);

module.exports = r;

