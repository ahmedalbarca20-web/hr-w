import api from './axios';

export const login  = (data) => api.post('/auth/login', data);
export const employeeLogin = (data) => api.post('/auth/employee-login', data);
export const logout = ()     => api.post('/auth/logout');
export const me     = ()     => api.get('/auth/me');
export const refresh = ()    => api.post('/auth/refresh');
export const requestPasswordReset = (email) => api.post('/auth/request-reset', { email });
export const resetPassword = (token, newPassword) => api.post('/auth/reset-password', { token, new_password: newPassword });


