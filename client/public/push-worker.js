/* Push contains identifiers and an expiring capability, never private notification content. */
let notificationQueue = Promise.resolve();
let pushSequence = 0;
const clearRules = new Map();
async function preparePush(event) {
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
    const background = typeof data.backgroundToken === 'string';
    if (
      background &&
      (data.backgroundToken.length === 0 ||
        data.backgroundToken.length > 2000 ||
        !Number.isFinite(Date.parse(data.expiresAt)) ||
        Date.parse(data.expiresAt) <= Date.now())
    )
      return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    let notice;
    try {
      const response = await fetch(
        background
          ? `/api/push/${chat ? 'chat' : 'task'}/${chat ? data.chatNotificationId : data.notificationId}`
          : chat
            ? `/api/chat/notifications/${data.chatNotificationId}/push?device=${data.deviceId}`
            : `/api/notifications/${data.notificationId}/push?device=${data.deviceId}`,
        {
          credentials: background ? 'omit' : 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
          ...(background ? { headers: { 'X-AegiTasks-Push': data.backgroundToken } } : {}),
        },
      );
      // Explicit revocation, reading and silence always suppress the notice.
      if ([401, 403, 404, 410].includes(response.status)) return;
      if (!response.ok) throw new Error('Preview unavailable');
      notice = await response.json();
    } catch {
      // A delivered push must not disappear when a second network request fails.
      // Reveal no sender, title, message or workspace until the server authorizes the preview.
      if (!background) return;
      if (
        chat &&
        (!guid.test(data.userId) ||
          !guid.test(data.roomId) ||
          !Number.isSafeInteger(data.sequence) ||
          data.sequence < 1 ||
          !Number.isSafeInteger(data.count) ||
          data.count < 1)
      )
        return;
      notice = {
        title: 'AegiTasks',
        body: chat
          ? 'Tienes mensajes nuevos. Abre el chat para ver los detalles.'
          : 'Tienes una nueva notificación. Revisa tu bandeja para ver los detalles.',
        url: chat ? '/#chat' : '/#inbox',
        tag: chat
          ? `aegitasks-chat-${data.userId.replaceAll('-', '')}-${data.roomId.replaceAll('-', '')}`
          : data.notificationId,
        ...(chat
          ? { userId: data.userId, roomId: data.roomId, sequence: data.sequence, count: data.count }
          : {}),
      };
    } finally {
      clearTimeout(timeout);
    }
    return { notice, chat };
  } catch {
    /* Malformed push data is ignored. */
  }
}
self.addEventListener('push', (event) => {
  // Fetch concurrently; serialize only display/grouping so a slow request cannot block every push.
  const prepared = preparePush(event);
  const received = ++pushSequence;
  notificationQueue = notificationQueue
    .catch(() => {})
    .then(async () => {
      try {
        const result = await prepared;
        if (!result) return;
        const { notice, chat } = result;
        if (
          chat &&
          [...clearRules.values()].some(
            (rule) =>
              rule.userId === notice.userId &&
              (!rule.roomId || rule.roomId === notice.roomId) &&
              (received <= rule.before ||
                (rule.sequence != null && notice.sequence <= rule.sequence)),
          )
        )
          return;
        let renotify = chat;
        if (chat && self.registration.getNotifications) {
          const previous = await self.registration
            .getNotifications({ tag: notice.tag })
            .catch(() => []);
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
  const key = `${data.userId}:${data.roomId || '*'}`;
  const previous = clearRules.get(key);
  clearRules.set(key, {
    userId: data.userId,
    roomId: data.roomId,
    before: data.sequence == null ? pushSequence : (previous?.before ?? 0),
    sequence:
      data.sequence == null ? previous?.sequence : Math.max(previous?.sequence ?? 0, data.sequence),
  });
  // Only in-flight/recent receipts need cancellation state; retain no message contents.
  if (clearRules.size > 100) clearRules.delete(clearRules.keys().next().value);
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
