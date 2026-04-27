import api from './axios';

export const listAttendance  = (params) => api.get('/attendance', { params });
export const getAttendance   = (id)     => api.get(`/attendance/${id}`);
export const createAttendance= (data)   => api.post('/attendance', data);
export const updateAttendance= (id, d)  => api.put(`/attendance/${id}`, d);
export const deleteAttendance= (id)     => api.delete(`/attendance/${id}`);
export const getSummary      = (params) => api.get('/attendance/summary', { params });
export const checkin         = (data)   => api.post('/attendance/checkin', data);
export const checkout        = (data)   => api.post('/attendance/checkout', data);
export const getActiveSurpriseAttendance = () => api.get('/attendance/surprise-attendance/active');
export const activateSurpriseAttendance = (data) => api.post('/process/surprise-attendance/activate', data);
export const cancelSurpriseAttendance = () => api.post('/process/surprise-attendance/cancel');
export const createAttendanceRequest = (data) => api.post('/attendance-requests', data, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
export const listAttendanceRequests = (params) => api.get('/attendance-requests', { params });
export const reviewAttendanceRequest = (id, data) => api.patch(`/attendance-requests/${id}/review`, data);

