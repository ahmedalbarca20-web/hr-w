import api from './axios';

export const listCompanies   = (params) => api.get('/companies', { params });
export const getCompany      = (id)     => api.get(`/companies/${id}`);
export const createCompany   = (data)   => api.post('/companies', data);
export const updateCompany   = (id, d)  => api.put(`/companies/${id}`, d);
export const toggleStatus    = (id, v)  => api.patch(`/companies/${id}/status`, { is_active: v });
export const deleteCompany   = (id)     => api.delete(`/companies/${id}`);
export const getCompanyFeatures = (id)  => api.get(`/companies/${id}/features`);
export const updateCompanyFeatures = (id, enabled_features) =>
  api.put(`/companies/${id}/features`, { enabled_features });

export const uploadContractDoc = (id, file) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post(`/companies/${id}/contract-doc`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
