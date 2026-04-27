import api from './axios';

export const listEmployees   = (params)        => api.get('/employees', { params });
/** Current user's employee row (works without `employees` company feature). */
export const getMyEmployee   = ()              => api.get('/employees/me');
export const getEmployee     = (id, params)    => api.get(`/employees/${id}`, { params });
export const createEmployee  = (data)          => api.post('/employees', data);
export const updateEmployee  = (id, data)      => api.put(`/employees/${id}`, data);
export const deleteEmployee  = (id, params)    => api.delete(`/employees/${id}`, { params });
export const setStatus       = (id, data) => api.patch(`/employees/${id}/status`, data);

export const listDepts       = ()       => api.get('/departments');
export const createDept      = (data)   => api.post('/departments', data);
export const updateDept      = (id, d)  => api.put(`/departments/${id}`, d);
export const deleteDept      = (id)     => api.delete(`/departments/${id}`);

