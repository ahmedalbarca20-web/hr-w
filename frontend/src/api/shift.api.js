import api from './axios';

export const listShifts   = (params) => api.get('/shifts', { params });
export const getShift     = (id)     => api.get(`/shifts/${id}`);
export const createShift  = (data)   => api.post('/shifts', data);
export const updateShift  = (id, d)  => api.put(`/shifts/${id}`, d);
export const deleteShift  = (id)     => api.delete(`/shifts/${id}`);
export const setDefault   = (id)     => api.post(`/shifts/${id}/set-default`);
