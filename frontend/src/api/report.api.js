import api from './axios';

export const attendanceReport = (params) => api.get('/reports/attendance', { params });
export const leaveReport      = (params) => api.get('/reports/leaves',     { params });
export const payrollReport    = (params) => api.get('/reports/payroll',    { params });
export const headcountReport  = (params) => api.get('/reports/headcount',  { params });
