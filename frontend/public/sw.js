/* eslint-disable no-restricted-globals */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'HR', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'HR';
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const url = typeof data.url === 'string' && data.url ? data.url : '/';
  const tag = typeof data.tag === 'string' && data.tag ? data.tag : 'hr';
  const options = {
    body: payload.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag,
    renotify: true,
    data: { url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const c of clientList) {
        if (c.url && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
