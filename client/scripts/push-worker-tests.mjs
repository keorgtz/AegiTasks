import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../public/push-worker.js', import.meta.url), 'utf8');
const handlers = new Map();
const displays = [];
const opened = [];
const messages = [];
let status = 200;
let reads = 0;
const current = new Map();
let chatNotice = null;
let fetchMode = 'normal';
let noWindows = false;
let rejectDeferred;
const self = {
  location: { origin: 'https://task.example.com' },
  addEventListener: (name, callback) => handlers.set(name, callback),
  registration: {
    showNotification: async (title, options) => {
      displays.push({ title, options });
      current.set(options.tag, {
        title,
        body: options.body,
        tag: options.tag,
        data: options.data,
        close: () => current.delete(options.tag),
      });
    },
    getNotifications: async (options) =>
      [...current.values()].filter((n) => !options?.tag || n.tag === options.tag),
  },
  clients: {
    matchAll: async () => (noWindows ? [] : [{ postMessage: (message) => messages.push(message) }]),
    openWindow: async (url) => opened.push(url),
  },
};
vm.runInNewContext(source, {
  self,
  URL,
  AbortController,
  setTimeout: (callback, milliseconds) =>
    setTimeout(callback, milliseconds === 4000 ? 20 : milliseconds),
  clearTimeout,
  fetch: async (url, options) => {
    reads++;
    assert.ok(
      url.startsWith('/api/notifications/') ||
        url.startsWith('/api/chat/notifications/') ||
        url.startsWith('/api/push/'),
    );
    assert.equal(options.credentials, url.startsWith('/api/push/') ? 'omit' : 'same-origin');
    if (url.startsWith('/api/push/')) assert.ok(options.headers['X-AegiTasks-Push']);
    assert.equal(options.cache, 'no-store');
    if (fetchMode === 'offline') throw new TypeError('Network unavailable');
    if (fetchMode === 'deferred')
      return new Promise((_, reject) => {
        rejectDeferred = reject;
      });
    if (fetchMode === 'stalled')
      return new Promise((_, reject) =>
        options.signal.addEventListener('abort', () => reject(new Error('Aborted'))),
      );
    return {
      ok: status === 200,
      status,
      json: async () =>
        url.startsWith('/api/chat/') || url.startsWith('/api/push/chat/')
          ? { ...chatNotice }
          : {
              title: 'Corregir cierre del POS',
              body: 'María cambió el estado a «Resuelto».',
              tag: 'unique-notice',
              url: '/?space=abc&task=def#inbox',
            },
    };
  },
});
async function dispatch(name, props) {
  let work;
  handlers.get(name)({ ...props, waitUntil: (promise) => (work = promise) });
  await work;
}
const data = {
  notificationId: '11111111-1111-4111-8111-111111111111',
  deviceId: '22222222-2222-4222-8222-222222222222',
};
await dispatch('push', { data: { json: () => data } });
assert.equal(displays.length, 1);
assert.equal(messages.length, 1);
assert.equal(displays[0].options.tag, 'unique-notice');
assert.equal(displays[0].title, 'Corregir cierre del POS');
assert.equal(displays[0].options.body, 'María cambió el estado a «Resuelto».');
assert.equal(displays[0].options.badge, '/aegitasks-notification-badge.png');
assert.equal(displays[0].options.icon, '/aegitasks-icon-192.png');
assert.ok(!Object.hasOwn(displays[0].options, 'image'));
console.log(
  'PASS Push worker rechecks authenticated access, displays the notice and updates the open app',
);
for (const code of [401, 403, 404, 503]) {
  status = code;
  await dispatch('push', { data: { json: () => data } });
}
assert.equal(displays.length, 1);
console.log(
  'PASS Expired sessions, revoked access, read/deleted notices and unavailable API do not expose notifications',
);
const previousReads = reads;
await dispatch('push', {
  data: { json: () => ({ notificationId: 'invalid', deviceId: data.deviceId }) },
});
assert.equal(reads, previousReads);
console.log('PASS Malformed push identifiers are discarded without network requests');
let closed = false;
await dispatch('notificationclick', {
  notification: { data: { url: '/?space=abc&task=def#inbox' }, close: () => (closed = true) },
});
assert.ok(closed);
assert.equal(opened[0], 'https://task.example.com/?space=abc&task=def#inbox');
await dispatch('notificationclick', {
  notification: { data: { url: 'https://evil.example' }, close: () => {} },
});
assert.equal(opened.length, 1);
console.log(
  'PASS Notification clicks open the intended app path, reject external URLs and do not explicitly navigate existing windows',
);
status = 200;
const chatData = {
  chatNotificationId: '33333333-3333-4333-8333-333333333333',
  deviceId: data.deviceId,
};
chatNotice = {
  id: chatData.chatNotificationId,
  userId: '44444444-4444-4444-8444-444444444444',
  roomId: '55555555-5555-4555-8555-555555555555',
  title: 'Equipo soporte',
  body: 'Alice: Primer mensaje',
  count: 1,
  sequence: 1,
  tag: 'aegitasks-chat-user-room',
  url: '/#chat/55555555-5555-4555-8555-555555555555',
};
await dispatch('push', { data: { json: () => chatData } });
await dispatch('push', { data: { json: () => chatData } });
assert.equal(displays.length, 2);
assert.equal(displays.at(-1).options.badge, '/aegitasks-notification-badge.png');
assert.equal(displays.at(-1).options.icon, '/aegitasks-icon-192.png');
assert.ok(!Object.hasOwn(displays.at(-1).options, 'image'));
chatNotice = {
  ...chatNotice,
  body: '2 mensajes nuevos\nAlice: Primer mensaje\nBob: Segundo mensaje',
  count: 2,
  sequence: 2,
};
await dispatch('push', { data: { json: () => chatData } });
assert.equal(current.size, 2); // One task notice and one grouped chat, not one notice per message.
assert.equal(displays.at(-1).options.renotify, true);
assert.equal(current.get(chatNotice.tag).data.sequence, 2);
chatNotice = { ...chatNotice, body: 'Older snapshot', count: 1, sequence: 1 };
const beforeOld = displays.length;
await dispatch('push', { data: { json: () => chatData } });
assert.equal(displays.length, beforeOld);
chatNotice = { ...chatNotice, body: 'Bob: Segundo mensaje', count: 1, sequence: 2 };
await dispatch('push', { data: { json: () => chatData } });
assert.equal(displays.at(-1).options.renotify, false);
assert.equal(current.get(chatNotice.tag).body, 'Bob: Segundo mensaje');
assert.equal(messages.at(-1).type, 'AEGITASKS_CHAT_NOTIFICATIONS');
console.log(
  'PASS Chat messages share a per-conversation notice with badge, previews and audible new-message updates; duplicates and old pushes cannot replace newer content',
);
await dispatch('message', {
  data: { type: 'AEGITASKS_CHAT_CLEAR', userId: 'another-user', roomId: chatNotice.roomId },
});
assert.ok(current.has(chatNotice.tag));
await dispatch('message', {
  data: {
    type: 'AEGITASKS_CHAT_CLEAR',
    userId: chatNotice.userId,
    roomId: chatNotice.roomId,
    sequence: 1,
  },
});
assert.ok(current.has(chatNotice.tag));
await dispatch('message', {
  data: {
    type: 'AEGITASKS_CHAT_CLEAR',
    userId: chatNotice.userId,
    roomId: chatNotice.roomId,
    sequence: 2,
  },
});
assert.ok(!current.has(chatNotice.tag));
await dispatch('notificationclick', {
  notification: { data: { url: chatNotice.url }, close: () => {} },
});
assert.equal(opened.at(-1), 'https://task.example.com' + chatNotice.url);
console.log(
  'PASS Reading/muting closes only the matching account/conversation up to the read cursor; chat notification clicks preserve deep links',
);
for (const code of [401, 403, 404, 503]) {
  status = code;
  await dispatch('push', { data: { json: () => chatData } });
}
assert.ok(!current.has(chatNotice.tag));
console.log(
  'PASS Unauthorized, muted, read and unavailable chat previews never display an OS notification',
);

noWindows = true;
status = 200;
const background = {
  ...data,
  backgroundToken: 'opaque-protected-token',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};
await dispatch('push', { data: { json: () => background } });
assert.equal(displays.at(-1).title, 'Corregir cierre del POS');
assert.equal(displays.at(-1).options.icon, '/aegitasks-icon-192.png');
console.log('PASS Background preview displays with no app windows and no browser-session cookies');
let count = displays.length;
for (const code of [401, 403, 404, 410]) {
  status = code;
  await dispatch('push', { data: { json: () => background } });
}
assert.equal(displays.length, count);
console.log(
  'PASS Revoked/read/deleted background capabilities never display private or fallback notifications',
);
status = 503;
await dispatch('push', { data: { json: () => background } });
assert.equal(displays.at(-1).title, 'AegiTasks');
assert.ok(!displays.at(-1).options.body.includes('María'));
assert.equal(displays.at(-1).options.data.url, '/#inbox');
fetchMode = 'offline';
await dispatch('push', { data: { json: () => background } });
assert.equal(displays.at(-1).title, 'AegiTasks');
fetchMode = 'stalled';
await dispatch('push', { data: { json: () => background } });
assert.equal(displays.at(-1).title, 'AegiTasks');
console.log(
  'PASS Transient server errors, offline preview fetches and stalled requests retain a generic notice without revealing private content',
);
count = displays.length;
fetchMode = 'normal';
status = 200;
const countReads = reads;
await dispatch('push', {
  data: { json: () => ({ ...background, expiresAt: new Date(0).toISOString() }) },
});
await dispatch('push', {
  data: { json: () => ({ ...background, backgroundToken: 'x'.repeat(2001) }) },
});
assert.equal(reads, countReads);
assert.equal(displays.length, count);
console.log('PASS Expired and malformed background pushes are discarded before network or display');
const backgroundChat = {
  ...background,
  notificationId: undefined,
  ...chatData,
  userId: '66666666-6666-4666-8666-666666666666',
  roomId: '77777777-7777-4777-8777-777777777777',
  sequence: 8,
  count: 3,
};
fetchMode = 'offline';
await dispatch('push', { data: { json: () => backgroundChat } });
await dispatch('push', { data: { json: () => ({ ...backgroundChat, sequence: 9, count: 4 }) } });
const fallbackTag = displays.at(-1).options.tag;
assert.equal(displays.at(-1).title, 'AegiTasks');
assert.equal(displays.at(-1).options.data.sequence, 9);
assert.equal(current.get(fallbackTag).data.count, 4);
count = displays.length;
await dispatch('push', { data: { json: () => backgroundChat } });
assert.equal(displays.length, count);
await dispatch('message', {
  data: {
    type: 'AEGITASKS_CHAT_CLEAR',
    userId: backgroundChat.userId,
    roomId: backgroundChat.roomId,
    sequence: 9,
  },
});
assert.ok(!current.has(fallbackTag));
console.log(
  'PASS Offline chat fallbacks still group by conversation, reject old sequences and close when read or muted',
);
fetchMode = 'deferred';
count = displays.length;
const pendingPush = dispatch('push', {
  data: { json: () => ({ ...backgroundChat, sequence: 10, count: 1 }) },
});
await dispatch('message', {
  data: {
    type: 'AEGITASKS_CHAT_CLEAR',
    userId: backgroundChat.userId,
    roomId: backgroundChat.roomId,
  },
});
rejectDeferred(new TypeError('Network unavailable'));
await pendingPush;
assert.equal(displays.length, count);
fetchMode = 'offline';
await dispatch('push', { data: { json: () => ({ ...backgroundChat, sequence: 11, count: 1 }) } });
assert.equal(displays.length, count + 1);
console.log(
  'PASS Muting/clearing while a preview is pending prevents a late display without suppressing future valid receipts',
);
