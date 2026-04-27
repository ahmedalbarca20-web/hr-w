import api from './axios';

export const processAll      = (data)   => api.post('/process', data);
export const processEmployee = (id, d)  => api.post(`/process/employee/${id}`, d);
export const reprocess       = (data)   => api.post('/process/reprocess', data);
