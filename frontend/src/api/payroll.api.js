import api from './axios';

export const listRuns       = (params) => api.get('/payroll/runs', { params });
export const getRun         = (id)     => api.get(`/payroll/runs/${id}`);
export const createRun      = (data)   => api.post('/payroll/runs', data);
export const processRun     = (id, cfg) => api.post(`/payroll/runs/${id}/process`, cfg);
export const updateRunStatus= (id, d)  => api.patch(`/payroll/runs/${id}/status`, d);
export const listComponents = ()       => api.get('/payroll/components');
export const createComponent= (data)   => api.post('/payroll/components', data);
export const listItems      = (run_id, params) => api.get(`/payroll/runs/${run_id}/items`, { params });
export const getItem        = (run_id, id)     => api.get(`/payroll/runs/${run_id}/items/${id}`);

