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

function resolveNotificationTargetUrl(raw) {
  try {
    return new URL(raw || '/', self.location.origin).href;
  } catch {
    return new URL('/', self.location.origin).href;
  }
}

function sameOriginAsSw(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data && typeof event.notification.data.url === 'string'
    ? event.notification.data.url
    : '/';
  const targetUrl = resolveNotificationTargetUrl(raw);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const client = clientList.find((c) => c.url && sameOriginAsSw(c.url) && 'focus' in c);

      if (client) {
        return client.focus().then((focused) => {
          if (!focused) {
            return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
          }
          if (typeof focused.navigate === 'function') {
            return focused.navigate(targetUrl).catch(() => {
              focused.postMessage({ type: 'HR_PUSH_NAVIGATE', url: targetUrl });
            });
          }
          focused.postMessage({ type: 'HR_PUSH_NAVIGATE', url: targetUrl });
          return undefined;
        });
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
