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
  const createdNotice = (await notices(target))[0];
  assert.equal(createdNotice.title, task.title);
  assert.match(createdNotice.message, /creó.*asignado a ti/);
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
  const initialNotices = await notices(target);
  assert.equal(
    initialNotices.find((n) => n.id === createdNotice.id).title,
    'Assigned notification',
  );
  assert.match(initialNotices.find((n) => n.kind === 'updated').message, /actualizó: título/);
  assert.match(initialNotices.find((n) => n.kind === 'comment').message, /comentó el pendiente/);
  assert.match(initialNotices.find((n) => n.kind === 'evidence').message, /agregó evidencia/);
  assert.ok(!initialNotices.some((n) => n.message.includes('Private comment')));
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
  assert.match(
    (await notices(other)).find((n) => n.workItemId === task.id).message,
    /te asignó el pendiente.*título/,
  );
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
  let pending = await json(owner, 'POST', '/tasks', input('Pending push test'));
  const notice = (await notices(target)).find((n) => n.workItemId === pending.id);
  const push = await json(target, 'GET', `/notifications/${notice.id}/push?device=${device.id}`);
  assert.equal(push.title, pending.title);
  assert.equal(push.body, notice.message);
  assert.ok(push.url.includes(`space=${shared.id}&task=${pending.id}`));
  assert.ok(!JSON.stringify(push).includes('Keep private'));
  const completedStatus = workspace.statuses.find((s) => s.projectId === project.id && s.isDone);
  pending = await json(owner, 'PUT', `/tasks/${pending.id}/status`, {
    statusId: completedStatus.id,
    version: pending.version,
  });
  const statusNotice = (await notices(target)).find(
    (n) => n.workItemId === pending.id && n.kind === 'updated',
  );
  const statusPush = await json(
    target,
    'GET',
    `/notifications/${statusNotice.id}/push?device=${device.id}`,
  );
  assert.equal(statusPush.title, pending.title);
  assert.equal(statusPush.body, statusNotice.message);
  assert.ok(statusPush.body.includes(`cambió el estado a «${completedStatus.name}»`));
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

  let detailed = await json(owner, 'POST', '/tasks', input('Detailed changes', null));
  const taskNotices = async () =>
    (await notices(owner)).filter((n) => n.workItemId === detailed.id);
  const firstDetails = (await taskNotices())[0];
  const tag = await json(owner, 'POST', '/tags', { name: 'Notice tag', color: 'purple' });
  const folder = await json(owner, 'POST', '/folders', {
    name: 'Notice folder',
    projectId: project.id,
  });
  const done = await json(owner, 'POST', '/statuses', {
    name: 'Resuelto y revisado ' + 'X'.repeat(60),
    projectId: project.id,
    color: 'green',
    isDone: true,
  });
  const newInput = {
    ...input('Título detallado ' + 'X'.repeat(175), null),
    description: 'Description content stays in the app',
    priority: 4,
    dueDate: '2026-12-31',
    estimateMinutes: 90,
    folderId: folder.id,
    statusId: done.id,
    tagIds: [tag.id],
  };
  detailed = await json(owner, 'PUT', `/tasks/${detailed.id}`, {
    ...newInput,
    version: detailed.version,
  });
  const changedNotice = (await taskNotices()).find((n) => n.kind === 'updated');
  for (const label of [
    'título',
    'descripción',
    'prioridad',
    'fecha límite',
    'estimación',
    'carpeta',
    'etiquetas',
  ])
    assert.ok(changedNotice.message.includes(label), label);
  assert.ok(changedNotice.message.includes(`cambió el estado a «${done.name}»`));
  assert.ok(changedNotice.message.length > 200);
  assert.equal(changedNotice.title, detailed.title);
  assert.equal(
    (await taskNotices()).find((n) => n.id === firstDetails.id).title,
    'Detailed changes',
  );
  assert.ok(!changedNotice.message.includes('Description content'));
  pass(
    'Notifications retain event titles and name every edited property with the actual destination status, even beyond 200 characters',
  );
  const countBeforeNoop = (await taskNotices()).length;
  detailed = await json(owner, 'PUT', `/tasks/${detailed.id}`, {
    ...newInput,
    version: detailed.version,
  });
  detailed = await json(owner, 'PUT', `/tasks/${detailed.id}/status`, {
    statusId: done.id,
    version: detailed.version,
  });
  assert.equal((await taskNotices()).length, countBeforeNoop);
  const tagChangeInput = { ...newInput, tagIds: [] };
  detailed = await json(owner, 'PUT', `/tasks/${detailed.id}`, {
    ...tagChangeInput,
    version: detailed.version,
  });
  assert.equal((await taskNotices()).length, countBeforeNoop + 1);
  assert.match((await taskNotices())[0].message, /actualizó: etiquetas\.$/);
  pass(
    'Tag-only changes notify precisely; unchanged saves and unchanged status actions do not generate generic notices',
  );
  detailed = await json(owner, 'POST', `/tasks/${detailed.id}/archive`, {
    archived: true,
    version: detailed.version,
  });
  assert.match((await taskNotices())[0].message, /archivó el pendiente/);
  detailed = await json(owner, 'POST', `/tasks/${detailed.id}/archive`, {
    archived: false,
    version: detailed.version,
  });
  assert.match((await taskNotices())[0].message, /restauró el pendiente/);
  pass('Archive and restore produce distinct actionable notifications');
  const parentTask = await json(owner, 'POST', '/tasks', input('Notification parent'));
  detailed = await json(owner, 'PUT', `/tasks/${detailed.id}/parent`, {
    parentTaskId: parentTask.id,
    version: detailed.version,
  });
  assert.match((await taskNotices())[0].message, /pendiente padre/);
  const module = await json(owner, 'POST', '/modules', {
    projectId: project.id,
    name: 'Notice module',
  });
  const cycle = await json(owner, 'POST', '/cycles', {
    projectId: project.id,
    name: 'Notice cycle',
  });
  for (const [group, label, item] of [
    ['modules', 'módulo', module],
    ['cycles', 'ciclo', cycle],
  ]) {
    await json(
      owner,
      'POST',
      `/${group}/${item.id}/tasks`,
      { tasks: [{ id: detailed.id, version: detailed.version }] },
      204,
    );
    detailed = (await json(owner, 'GET', `/tasks/${detailed.id}`)).item;
    assert.match((await taskNotices())[0].message, new RegExp(label));
  }
  detailed = await json(owner, 'PUT', `/tasks/${detailed.id}`, {
    ...tagChangeInput,
    version: detailed.version,
    planning: {
      moduleId: module.id,
      cycleId: cycle.id,
      estimateKind: 'fibonacci',
      estimatePoints: 8,
    },
  });
  assert.match((await taskNotices())[0].message, /actualizó: estimación\.$/);
  const nextProject = await json(owner, 'POST', '/projects', {
    name: 'Notice move destination',
    color: 'blue',
  });
  const nextWorkspace = await json(owner, 'GET', '/workspace');
  detailed = await json(owner, 'PUT', `/tasks/${detailed.id}`, {
    ...tagChangeInput,
    projectId: nextProject.id,
    folderId: null,
    statusId: nextWorkspace.statuses.find((s) => s.projectId === nextProject.id).id,
    version: detailed.version,
  });
  for (const label of ['proyecto', 'carpeta', 'módulo', 'ciclo', 'pendiente padre'])
    assert.ok((await taskNotices())[0].message.includes(label), label);
  task = await json(owner, 'PUT', `/tasks/${task.id}`, {
    ...input('Unassigned after reassignment', null),
    version: task.version,
  });
  for (const client of [owner, target, other])
    assert.match(
      (await notices(client)).find((n) => n.workItemId === task.id).message,
      /dejó el pendiente sin responsable/,
    );
  pass(
    'Parent links, bulk module/cycle assignment, point estimation, project moves and unassignment describe their actual changes',
  );

  await page.goto(`/?space=${shared.id}#inbox`);
  await page
    .locator('.header-actions')
    .getByRole('button', { name: /^Notificaciones/ })
    .waitFor();
  await page
    .locator('.header-actions')
    .getByRole('button', { name: /^Notificaciones/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Notificaciones', exact: true });
  await dialog.getByText('Unassigned notification', { exact: true }).first().waitFor();
  await dialog.getByRole('button', { name: 'Marcar todas leídas' }).click();
  await page
    .locator('.header-actions')
    .getByRole('button', { name: 'Notificaciones', exact: true })
    .waitFor();
  await json(other, 'POST', `/tasks/${publicTask.id}/comments`, { body: 'Live comment' }, 204);
  await page.getByRole('button', { name: 'Notificaciones: 1 sin leer', exact: true }).waitFor();
  pass('Notification bell receives live workspace events and read-all updates its unread count');
  assert.equal(
    await dialog.getByRole('button', { name: 'Activar en este dispositivo' }).count(),
    0,
  );
  await dialog.getByRole('link', { name: 'Configurar notificaciones del dispositivo' }).click();
  await page.getByRole('heading', { name: 'Notificaciones', exact: true }).waitFor();
  const deviceSettings = page.locator('.device-settings-card');
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
  let finishRegistration;
  const registrationGate = new Promise((resolve) => (finishRegistration = resolve));
  const holdRegistration = async (route) => {
    await registrationGate;
    await route.continue();
  };
  await page.route('**/api/notifications/devices', holdRegistration);
  await deviceSettings.getByRole('button', { name: 'Activar en este dispositivo' }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.device-settings-card')?.getAttribute('data-update-blocked') ===
      'true',
  );
  finishRegistration();
  await deviceSettings.getByText('Avisos activados en este dispositivo').waitFor();
  await page.unroute('**/api/notifications/devices', holdRegistration);
  await deviceSettings.getByRole('button', { name: 'Desactivar', exact: true }).click();
  await deviceSettings.getByText('Recibe avisos aunque no tengas la app abierta').waitFor();
  pass(
    'Device activation/deactivation controls persist via API (PushManager simulated, no real provider delivery)',
  );
  await page
    .locator('.header-actions')
    .getByRole('button', { name: /^Notificaciones/ })
    .click();
  for (const [width, height, theme] of [
    [1440, 900, 'light'],
    [1440, 900, 'dark'],
    [768, 1024, 'light'],
    [390, 844, 'dark'],
    [390, 844, 'light'],
    [320, 740, 'dark'],
    [320, 740, 'light'],
    [375, 812, 'dark'],
    [430, 932, 'light'],
    [844, 390, 'dark'],
    [844, 390, 'light'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    await page.screenshot({
      path: path.join(artifacts, `notifications-${width}-${theme}.png`),
      animations: 'disabled',
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `No overflow at ${width}`,
    );
    const box = await dialog.boundingBox();
    assert.ok(box.width <= width && box.height <= height);
    assert.ok(
      box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height,
    );
    assert.ok(
      Math.abs(box.x + box.width / 2 - width / 2) <= 1,
      `Notification dialog must be centered at ${width}px: x=${box.x}, width=${box.width}`,
    );
    await dialog.getByText(detailed.title, { exact: true }).first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(artifacts, `notification-details-${width}-${theme}.png`),
      animations: 'disabled',
    });
  }
  pass(
    'Notification center stays horizontally centered and fits desktop, tablet, portrait/landscape phones and both themes, including 320 pixels',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByRole('button', { name: 'Marcar todas leídas' }).click();
  await page
    .locator('.header-actions')
    .getByRole('button', { name: 'Notificaciones', exact: true })
    .waitFor();
  await dialog.getByRole('checkbox', { name: 'Solo sin leer' }).check();
  await dialog.getByText('No tienes notificaciones sin leer.', { exact: true }).waitFor();
  const emptyBox = await dialog.boundingBox();
  assert.ok(Math.abs(emptyBox.x + emptyBox.width / 2 - 195) <= 1);
  await page.screenshot({ path: path.join(artifacts, 'notification-mobile-empty-centered.png') });
  await dialog.getByRole('checkbox', { name: 'Solo sin leer' }).uncheck();
  await dialog.getByText('Unassigned notification', { exact: true }).first().waitFor();
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
  const ownNotices = (await json(owner, 'GET', '/notifications')).items;
  const foreignNotice = (await notices(target))[0];
  assert.ok(ownNotices.length > 0 && foreignNotice);
  await json(owner, 'DELETE', `/notifications/${foreignNotice.id}`, undefined, 404);
  await json(outsider, 'DELETE', `/notifications/${ownNotices[0].id}`, undefined, 404);
  await json(owner, 'DELETE', `/notifications/${ownNotices[0].id}`, undefined, 204);
  await json(owner, 'DELETE', `/notifications/${ownNotices[0].id}`, undefined, 404);
  assert.ok(
    !(await json(owner, 'GET', '/notifications')).items.some((n) => n.id === ownNotices[0].id),
  );
  assert.ok((await notices(target)).some((n) => n.id === foreignNotice.id));
  pass(
    'Individual deletion is scoped to the authenticated owner, including Admin; foreign notices stay intact',
  );
  await page.reload();
  await page
    .locator('.header-actions')
    .getByRole('button', { name: /^Notificaciones/ })
    .click();
  await dialog
    .getByRole('button', { name: /^Eliminar notificación:/ })
    .first()
    .waitFor();
  const beforeDelete = (await json(owner, 'GET', '/notifications')).total;
  const deleted = page.waitForResponse(
    (r) =>
      r.request().method() === 'DELETE' &&
      /\/api\/notifications\/[\w-]+$/.test(r.url()) &&
      r.status() === 204,
  );
  await dialog
    .getByRole('button', { name: /^Eliminar notificación:/ })
    .first()
    .click();
  await deleted;
  assert.equal((await json(owner, 'GET', '/notifications')).total, beforeDelete - 1);
  // Clearing the history always includes read notices and other pages, irrespective of the filter.
  await dialog.getByRole('checkbox', { name: 'Solo sin leer' }).check();
  await dialog.getByText('No tienes notificaciones sin leer.', { exact: true }).waitFor();
  page.once('dialog', (prompt) => prompt.dismiss());
  await dialog.getByRole('button', { name: 'Limpiar historial', exact: true }).click();
  assert.equal((await json(owner, 'GET', '/notifications')).total, beforeDelete - 1);
  const sibling = await page.context().newPage();
  try {
    await sibling.goto(`/?space=${shared.id}#inbox`);
    await sibling
      .locator('.header-actions')
      .getByRole('button', { name: /^Notificaciones/ })
      .click();
    const siblingDialog = sibling.getByRole('dialog', { name: 'Notificaciones', exact: true });
    await siblingDialog.locator('.notification-list li').first().waitFor();
    page.once('dialog', (prompt) => prompt.accept());
    const cleared = page.waitForResponse(
      (r) =>
        r.request().method() === 'DELETE' &&
        r.url().endsWith('/api/notifications') &&
        r.status() === 204,
    );
    await dialog.getByRole('button', { name: 'Limpiar historial', exact: true }).click();
    await cleared;
    assert.equal((await json(owner, 'GET', '/notifications')).total, 0);
    assert.ok((await notices(target)).length > 0);
    await siblingDialog
      .getByText('Aquí aparecerán los avisos de tus pendientes y Spaces.', { exact: true })
      .waitFor();
    await json(
      other,
      'POST',
      `/tasks/${publicTask.id}/comments`,
      { body: 'After clearing history' },
      204,
    );
    await page
      .locator('.header-actions')
      .getByRole('button', { name: 'Notificaciones: 1 sin leer', exact: true })
      .waitFor();
    await dialog.locator('.notification-list li').waitFor();
  } finally {
    await sibling.close();
  }
  pass(
    'Mobile deletes a notice and confirms clearing all history even under unread filter; cancellation, live tabs and future notices work',
  );
  await json(target, 'POST', '/notifications/devices', subscription);
  const pushNotice = (await notices(target)).find((n) => !n.readAt);
  assert.ok(pushNotice);
  await json(target, 'DELETE', '/notifications', undefined, 204);
  assert.equal((await json(target, 'GET', '/notifications/device')).enabled, true);
  await json(
    target,
    'GET',
    `/notifications/${pushNotice.id}/push?device=${device.id}`,
    undefined,
    404,
  );
  assert.equal((await json(target, 'GET', '/notifications')).total, 0);
  await json(target, 'DELETE', '/notifications', undefined, 204);
  assert.ok((await json(owner, 'GET', '/tasks')).items.some((t) => t.id === publicTask.id));
  pass(
    'Clearing is idempotent, removes push authorizations and preserves enabled devices, task data and other recipients',
  );
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('/#inbox');
  await Promise.all([owner, ...users.map((u) => u.client)].map((c) => c.dispose()));
}
