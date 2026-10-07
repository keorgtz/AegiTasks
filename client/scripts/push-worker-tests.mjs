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
const self = {
  location: { origin: 'https://task.example.com' },
  addEventListener: (name, callback) => handlers.set(name, callback),
  registration: { showNotification: async (title, options) => displays.push({ title, options }) },
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
    assert.ok(url.startsWith('/api/notifications/'));
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    return {
      ok: status === 200,
      json: async () => ({
        title: 'AegiTasks',
        body: 'A new task',
        tag: 'unique-notice',
        url: '/?space=abc&task=def#inbox',
      }),
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
