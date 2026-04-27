import api from './axios';

export const listDepartments = (params) => api.get('/departments', { params });
export const getDepartment   = (id)     => api.get(`/departments/${id}`);
export const createDepartment= (data)   => api.post('/departments', data);
export const updateDepartment= (id, d)  => api.put(`/departments/${id}`, d);
export const deleteDepartment= (id)     => api.delete(`/departments/${id}`);

