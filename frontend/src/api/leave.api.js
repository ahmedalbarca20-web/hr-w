import api from './axios';

export const listLeaveTypes    = ()       => api.get('/leaves/types');
export const createLeaveType   = (data)   => api.post('/leaves/types', data);
export const updateLeaveType   = (id, d)  => api.put(`/leaves/types/${id}`, d);
export const deactivateLeaveType = (id)   => api.delete(`/leaves/types/${id}`);
export const listLeaveBalances = (params) => api.get('/leaves/balances', { params });
/** HR/Admin: create or update annual entitlement (total_days) per employee & leave type */
export const setLeaveBalance = (data) => api.post('/leaves/balances', data);
export const listLeaveRequests = (params) => api.get('/leaves/requests', { params });
export const createLeaveRequest= (data)   => api.post('/leaves/requests', data);
export const reviewLeave       = (id, d)  => api.patch(`/leaves/requests/${id}/review`, d);
export const cancelLeave       = (id)     => api.patch(`/leaves/requests/${id}/cancel`);

