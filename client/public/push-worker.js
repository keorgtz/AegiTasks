/* Push data contains identifiers only; authorization is checked before displaying any notice. */
let notificationQueue = Promise.resolve();
self.addEventListener('push', (event) => {
  notificationQueue = notificationQueue.then(async () => {
    try {
      const data = event.data?.json();
      const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const chat = guid.test(data?.chatNotificationId);
      if (
        !guid.test(data?.deviceId) ||
        (!chat && !guid.test(data?.notificationId)) ||
        (chat && data.notificationId)
      )
        return;
      const response = await fetch(
        chat
          ? `/api/chat/notifications/${data.chatNotificationId}/push?device=${data.deviceId}`
          : `/api/notifications/${data.notificationId}/push?device=${data.deviceId}`,
        { credentials: 'same-origin', cache: 'no-store' },
      );
      if (!response.ok) return;
      const notice = await response.json();
      let renotify = chat;
      if (chat && self.registration.getNotifications) {
        const previous = await self.registration.getNotifications({ tag: notice.tag });
        if (
          previous.some(
            (n) =>
              n.data?.sequence > notice.sequence ||
              (n.data?.sequence === notice.sequence && n.data?.count === notice.count),
          )
        )
          return;
        renotify = !previous.length || previous.every((n) => n.data?.sequence < notice.sequence);
      }
      await self.registration.showNotification(notice.title, {
        body: notice.body,
        // Android may generate an origin monogram when icon is omitted.
        icon: '/aegitasks-icon-192.png',
        badge: '/aegitasks-notification-badge.png',
        tag: notice.tag,
        ...(chat ? { renotify } : {}),
        data: {
          url: notice.url,
          ...(chat
            ? {
                userId: notice.userId,
                roomId: notice.roomId,
                sequence: notice.sequence,
                count: notice.count,
              }
            : {}),
        },
      });
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients)
        client.postMessage({
          type: chat ? 'AEGITASKS_CHAT_NOTIFICATIONS' : 'AEGITASKS_NOTIFICATIONS',
        });
    } catch {
      /* Expired session or unavailable API: the authenticated history remains available. */
    }
  });
  event.waitUntil(notificationQueue);
});
// Reading or muting a conversation closes its already displayed grouped notice on this device.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data?.type !== 'AEGITASKS_CHAT_CLEAR' || !self.registration.getNotifications) return;
  event.waitUntil(
    (async () => {
      for (const notice of await self.registration.getNotifications()) {
        if (
          notice.data?.userId === data.userId &&
          (!data.roomId || notice.data?.roomId === data.roomId) &&
          (data.sequence == null || notice.data.sequence <= data.sequence)
        )
          notice.close();
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
