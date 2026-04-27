import api from './axios';

export const listAnnouncements  = (params) => api.get('/announcements', { params });
export const getAnnouncement    = (id)     => api.get(`/announcements/${id}`);
export const createAnnouncement = (data)   => api.post('/announcements', data);
export const updateAnnouncement = (id, d)  => api.put(`/announcements/${id}`, d);
export const deleteAnnouncement = (id)     => api.delete(`/announcements/${id}`);
