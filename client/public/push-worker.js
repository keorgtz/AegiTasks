/* Push data contains identifiers only; authorization is checked before displaying any notice. */
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const data = event.data?.json();
        const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!guid.test(data?.notificationId) || !guid.test(data?.deviceId)) return;
        const response = await fetch(
          `/api/notifications/${data.notificationId}/push?device=${data.deviceId}`,
          { credentials: 'same-origin', cache: 'no-store' },
        );
        if (!response.ok) return;
        const notice = await response.json();
        await self.registration.showNotification(notice.title, {
          body: notice.body,
          icon: '/aegitasks-icon-192.png',
          tag: notice.tag,
          data: { url: notice.url },
        });
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) client.postMessage({ type: 'AEGITASKS_NOTIFICATIONS' });
      } catch {
        /* Expired session or unavailable API: the authenticated history remains available. */
      }
    })(),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const target = new URL(event.notification.data?.url || '/', self.location.origin);
      if (target.origin !== self.location.origin || target.pathname !== '/') return;
      // Let the OS open the app without explicitly navigating an existing editor window.
      await self.clients.openWindow(target.href);
    })(),
  );
});
