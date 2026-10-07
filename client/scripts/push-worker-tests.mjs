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
    matchAll: async () => [{ postMessage: (message) => messages.push(message) }],
    openWindow: async (url) => opened.push(url),
  },
};
vm.runInNewContext(source, {
  self,
  URL,
  fetch: async (url, options) => {
    reads++;
    assert.ok(url.startsWith('/api/notifications/') || url.startsWith('/api/chat/notifications/'));
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    return {
      ok: status === 200,
      json: async () =>
        url.startsWith('/api/chat/')
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
