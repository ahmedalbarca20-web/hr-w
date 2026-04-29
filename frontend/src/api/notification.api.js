import api from './axios';

export const getWebPushPublicKey = () => api.get('/notifications/web-push-public-key');

export const subscribeWebPush = (body) => api.post('/notifications/web-push/subscribe', body);

export const unsubscribeWebPush = (body) => api.post('/notifications/web-push/unsubscribe', body);
