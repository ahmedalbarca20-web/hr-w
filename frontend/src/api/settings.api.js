import api from './axios';

export const getCompanySettings = ()       => api.get('/settings/company');
export const updateCompanySettings = (data) => api.patch('/settings/company', data);
