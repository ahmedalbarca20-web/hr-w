import api from './axios';

export const getSetupStatus = () => api.get('/setup/status');
export const postSetupStart = () => api.post('/setup/start', {});
export const postSetupWorkHours = (body) => api.post('/setup/work-hours', body);
export const postSetupTestDevice = (body) => api.post('/setup/test-device', body);
export const postSetupDevice = (body) => api.post('/setup/device', body);
export const postSetupImportList = (body) => api.post('/setup/import-employees', { phase: 'list', ...body });
export const postSetupImportRun = (body) => api.post('/setup/import-employees', body);
export const postSetupComplete = () => api.post('/setup/complete', {});
