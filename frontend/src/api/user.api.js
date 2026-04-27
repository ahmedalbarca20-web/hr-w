import api from './axios';

// For super-admin calls, be sure to include { company_id } in params/body as needed.
export const listUsers      = (params)    => api.get('/users', { params });
export const getUser        = (id, params)=> api.get(`/users/${id}`, { params });
export const createUser     = (data)      => api.post('/users', data);
export const updateUser     = (id, d)     => api.put(`/users/${id}`, d);
export const deactivateUser = (id, params)=> api.delete(`/users/${id}`, { params });
export const permanentlyDeleteUser = (id, params) => api.delete(`/users/${id}/permanent`, { params });
