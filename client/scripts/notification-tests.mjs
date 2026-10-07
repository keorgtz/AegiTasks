import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import path from 'node:path';

export async function testNotifications({ page, request, admin, json, pass, artifacts, password }) {
  const shared = await json(admin, 'POST', '/spaces', { name: 'Notificaciones QA' });
  const ctx = async (state, space = shared.id) =>
    request.newContext({
      baseURL: 'http://localhost:5213',
      storageState: state,
      extraHTTPHeaders: { 'X-AegiTasks': '1', 'X-Space-Id': space },
    });
  const owner = await ctx(await admin.storageState());
  const users = [];
  for (const name of ['recipient', 'observer', 'outsider']) {
    const user = await json(admin, 'POST', '/users', {
      name: `Notification ${name}`,
      email: `${name}@notifications.example`,
      role: 'User',
      password,
    });
    const client = await ctx();
    await json(client, 'POST', '/auth/login', { email: user.email, password });
    if (name !== 'outsider')
      await json(owner, 'POST', `/spaces/${shared.id}/members`, { userId: user.id }, 204);
    users.push({ user, client });
  }
  const [
    { user: recipient, client: target },
    { user: observer, client: other },
    { client: outsider },
  ] = users;
  const project = await json(owner, 'POST', '/projects', {
    name: 'Push QA',
    color: 'purple',
    description: '',
  });
  const workspace = await json(owner, 'GET', '/workspace');
  const input = (title, assigneeId = recipient.id) => ({
    title,
    description: 'Keep private content in the app',
    projectId: project.id,
    statusId: workspace.statuses.find((s) => s.projectId === project.id && !s.isDone).id,
    assigneeId,
    folderId: null,
    priority: null,
    dueDate: null,
    estimateMinutes: null,
    tagIds: [],
  });
  const notices = async (client) =>
    (await json(client, 'GET', '/notifications')).items.filter((n) => n.spaceId === shared.id);
  let task = await json(owner, 'POST', '/tasks', input('Assigned notification'));
  assert.equal((await notices(target)).length, 1);
  assert.equal((await notices(other)).length, 0);
  assert.equal((await notices(owner)).length, 0);
  assert.equal((await notices(outsider)).length, 0);
  pass('Assigned task creation notifies only its active responsible member, never other Spaces');
  task = await json(owner, 'PUT', `/tasks/${task.id}`, {
    ...input('Assigned notification changed'),
    version: task.version,
  });
  await json(
    owner,
    'POST',
    `/tasks/${task.id}/comments`,
    { body: 'Private comment must not appear in push payload' },
    204,
  );
  const upload = await owner.post(`/api/tasks/${task.id}/attachments`, {
    multipart: {
      file: {
        name: 'evidence.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\nTest evidence'),
      },
    },
  });
  assert.equal(upload.status(), 200, await upload.text());
  assert.deepEqual((await notices(target)).map((n) => n.kind).sort(), [
    'comment',
    'created',
    'evidence',
    'updated',
  ]);
  assert.equal((await notices(other)).length, 0);
  const before = (await notices(target)).length;
  await json(
    owner,
    'PUT',
    `/tasks/${task.id}/status`,
    { statusId: task.statusId, version: '00000000-0000-0000-0000-000000000001' },
    409,
  );
  assert.equal((await notices(target)).length, before);
  task = await json(target, 'PUT', `/tasks/${task.id}/status`, {
    statusId: workspace.statuses.find((s) => s.projectId === project.id && s.isDone).id,
    version: task.version,
  });
  assert.equal((await notices(target)).length, before);
  pass(
    'Edits, comments and evidence each generate one notice; failed writes and assigned self-actions generate none',
  );
  const publicTask = await json(owner, 'POST', '/tasks', input('Unassigned notification', null));
  for (const client of [owner, target, other])
    assert.equal((await notices(client)).filter((n) => n.workItemId === publicTask.id).length, 1);
  assert.equal((await notices(outsider)).length, 0);
  await json(
    other,
    'POST',
    `/tasks/${publicTask.id}/comments`,
    { body: 'Everyone should know' },
    204,
  );
  for (const client of [owner, target, other])
    assert.deepEqual(
      (await notices(client))
        .filter((n) => n.workItemId === publicTask.id)
        .map((n) => n.kind)
        .sort(),
      ['comment', 'created'],
    );
  pass(
    'Unassigned tasks and subsequent comments notify all workspace members equally, including the actor',
  );
  task = await json(owner, 'PUT', `/tasks/${task.id}`, {
    ...input('Reassigned notification', observer.id),
    version: task.version,
  });
  assert.equal((await notices(target)).filter((n) => n.workItemId === task.id).length, 4);
  assert.equal((await notices(other)).filter((n) => n.workItemId === task.id).length, 1);
  pass('Reassignment routes the update to the new responsible user');
  const one = (await notices(target)).find((n) => n.workItemId === task.id);
  await json(other, 'PUT', `/notifications/${one.id}/read`, undefined, 404);
  await json(target, 'PUT', `/notifications/${one.id}/read`, undefined, 204);
  assert.ok((await notices(target)).find((n) => n.id === one.id).readAt);
  await json(target, 'PUT', '/notifications/read-all', undefined, 204);
  assert.equal((await json(target, 'GET', '/notifications?unread=true')).total, 0);
  assert.ok((await json(other, 'GET', '/notifications')).unreadCount > 0);
  pass('History and read/read-all are private to each user and retain their workspace context');
  const key = createECDH('prime256v1');
  key.generateKeys();
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/aegitasks-local-test',
    keys: {
      p256dh: key.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
  for (const endpoint of [
    'http://fcm.googleapis.com/x',
    'https://127.0.0.1/x',
    'https://fcm.googleapis.com.evil.example/x',
    'https://user@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x',
  ])
    await json(target, 'POST', '/notifications/devices', { ...subscription, endpoint }, 400);
  await json(
    target,
    'POST',
    '/notifications/devices',
    { ...subscription, keys: { p256dh: 'bad', auth: 'bad' } },
    400,
  );
  const device = await json(target, 'POST', '/notifications/devices', subscription);
  assert.equal((await json(target, 'POST', '/notifications/devices', subscription)).id, device.id);
  assert.equal((await json(target, 'GET', '/notifications/device')).enabled, true);
  const config = await json(target, 'GET', '/notifications/push-config');
  assert.equal(Buffer.from(config.publicKey, 'base64url').length, 65);
  assert.deepEqual(Object.keys(config), ['publicKey']);
  const pending = await json(owner, 'POST', '/tasks', input('Pending push test'));
  const notice = (await notices(target)).find((n) => n.workItemId === pending.id);
  const push = await json(target, 'GET', `/notifications/${notice.id}/push?device=${device.id}`);
  assert.equal(push.title, 'AegiTasks');
  assert.ok(push.url.includes(`space=${shared.id}&task=${pending.id}`));
  assert.ok(!JSON.stringify(push).includes('Keep private'));
  await json(other, 'GET', `/notifications/${notice.id}/push?device=${device.id}`, undefined, 404);
  await json(target, 'PUT', `/notifications/${notice.id}/read`, undefined, 204);
  await json(target, 'GET', `/notifications/${notice.id}/push?device=${device.id}`, undefined, 404);
  pass(
    'Push registration is idempotent, validates provider/keys, exposes only public VAPID and authorizes background reads',
  );
  await json(owner, 'DELETE', `/spaces/${shared.id}/members/${recipient.id}`, undefined, 204);
  assert.equal((await notices(target)).length, 0);
  await json(owner, 'POST', `/spaces/${shared.id}/members`, { userId: recipient.id }, 204);
  await json(owner, 'POST', '/roles', { name: 'NotificationRestricted' }, 204);
  await json(owner, 'PUT', '/roles/NotificationRestricted/permissions', { pages: ['notes'] }, 204);
  await json(owner, 'PUT', `/users/${recipient.id}`, {
    name: recipient.name,
    role: 'NotificationRestricted',
    active: true,
  });
  await json(target, 'POST', '/auth/login', { email: recipient.email, password });
  assert.equal((await notices(target)).length, 0);
  assert.equal((await json(target, 'GET', '/notifications/device')).enabled, false);
  await json(owner, 'PUT', `/users/${recipient.id}`, {
    name: recipient.name,
    role: 'User',
    active: true,
  });
  await json(target, 'POST', '/auth/login', { email: recipient.email, password });
  await json(target, 'POST', '/notifications/devices', subscription);
  await json(target, 'POST', '/auth/logout', undefined, 204);
  await json(target, 'POST', '/auth/login', { email: recipient.email, password });
  assert.equal((await json(target, 'GET', '/notifications/device')).enabled, false);
  pass(
    'Membership/page revocation hides history; session revocation and logout disable the device',
  );
  const ephemeral = await json(owner, 'POST', '/tasks', input('Deleted notification', null));
  await json(
    owner,
    'DELETE',
    `/tasks/${ephemeral.id}?version=${ephemeral.version}`,
    undefined,
    204,
  );
  assert.equal(
    (await notices(owner)).some((n) => n.workItemId === ephemeral.id),
    false,
  );
  pass('Deleting a task removes its notices without breaking existing deletion behavior');

  await page.goto(`/?space=${shared.id}#inbox`);
  await page.getByRole('button', { name: /^Notificaciones/ }).waitFor();
  await page.getByRole('button', { name: /^Notificaciones/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Notificaciones', exact: true });
  await dialog.getByText('Unassigned notification', { exact: true }).first().waitFor();
  await dialog.getByRole('button', { name: 'Marcar todas leídas' }).click();
  await page.getByRole('button', { name: 'Notificaciones', exact: true }).waitFor();
  await json(other, 'POST', `/tasks/${publicTask.id}/comments`, { body: 'Live comment' }, 204);
  await page.getByRole('button', { name: 'Notificaciones: 1 sin leer', exact: true }).waitFor();
  pass('Notification bell receives live workspace events and read-all updates its unread count');
  // Chromium headless denies OS notifications even after permission overrides.
  // Simulate only browser permission/subscription APIs; registration and device removal remain real HTTP.
  await page.evaluate(() => {
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
    Notification.requestPermission = async () => 'granted';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate(
    (data) => {
      const fake = { toJSON: () => data, options: {}, unsubscribe: async () => true };
      PushManager.prototype.getSubscription = async () => fake;
      PushManager.prototype.subscribe = async () => fake;
    },
    { ...subscription, endpoint: subscription.endpoint + '-browser' },
  );
  await dialog.getByRole('button', { name: 'Activar en este dispositivo' }).click();
  await dialog.getByText('Avisos activados en este dispositivo').waitFor();
  await dialog.getByRole('button', { name: 'Desactivar', exact: true }).click();
  await dialog.getByText('Recibe avisos aunque no tengas la app abierta').waitFor();
  pass(
    'Device activation/deactivation controls persist via API (PushManager simulated, no real provider delivery)',
  );
  for (const [width, height, theme] of [
    [1440, 900, 'light'],
    [390, 844, 'dark'],
    [320, 740, 'dark'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    await page.screenshot({
      path: path.join(artifacts, `notifications-${width}-${theme}.png`),
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `No overflow at ${width}`,
    );
    const box = await dialog.boundingBox();
    assert.ok(box.width <= width && box.height <= height);
  }
  pass('Notification center fits desktop/mobile at 1440, 390 and 320 pixels in both themes');
  await dialog
    .getByRole('button', { name: /Unassigned notification.*Live|Unassigned notification.*comentó/ })
    .first()
    .click();
  await page.getByRole('dialog', { name: 'Detalle del pendiente', exact: true }).waitFor();
  await page
    .getByRole('dialog', { name: 'Detalle del pendiente', exact: true })
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click();
  pass('Opening a notification opens the correct task detail');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('/#inbox');
  await Promise.all([owner, ...users.map((u) => u.client)].map((c) => c.dispose()));
}
