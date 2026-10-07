import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import path from 'node:path';

export async function testChatNotifications({
  page,
  request,
  admin,
  adminUser,
  shared,
  json,
  pass,
  artifacts,
  password,
}) {
  const people = [];
  for (const name of ['Sender', 'Recipient', 'Observer']) {
    const user = await json(admin, 'POST', '/users', {
      name: `Chat notices ${name}`,
      email: `chat-notices-${name.toLowerCase()}@qa.example`,
      role: 'User',
      password,
    });
    const client = await request.newContext({
      baseURL: 'http://127.0.0.1:5213',
      extraHTTPHeaders: { 'X-AegiTasks': '1', 'X-Space-Id': 'not-a-space' },
    });
    await json(client, 'POST', '/auth/login', { email: user.email, password });
    people.push({ user, client });
  }
  const [{ user: alice, client: a }, { user: bob, client: b }, { user: carol, client: c }] = people;
  const send = async (client, room, body, clientId = crypto.randomUUID()) => {
    const response = await client.post(`/api/chat/${room}/messages`, {
      multipart: { body, clientId },
    });
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  };
  const notices = (client) => json(client, 'GET', '/chat/notifications');
  const preference = (client, id) => json(client, 'GET', `/chat/${id}/notifications`);
  const save = async (client, id, settings, expected = 200, version) =>
    json(
      client,
      'PUT',
      `/chat/${id}/notifications`,
      {
        settings,
        version: version === undefined ? (await preference(client, id)).version : version,
      },
      expected,
    );
  const on = { mode: 'on', timeZone: 'UTC', periods: [], until: null };
  const inbox = async () => {
    const baseline = page.waitForResponse(
      (r) => r.url().endsWith('/api/chat/notifications') && r.status() === 200,
    );
    await page.goto(`/?space=${shared.id}#inbox`);
    await (await baseline).finished();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  };
  try {
    const room = await json(a, 'POST', '/chat', { isGroup: false, users: [bob.id] });
    const key = createECDH('prime256v1');
    key.generateKeys();
    const device = await json(b, 'POST', '/notifications/devices', {
      endpoint: `https://fcm.googleapis.com/chat-notices-${randomBytes(10).toString('hex')}`,
      keys: {
        p256dh: key.getPublicKey().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      },
    });
    const retry = crypto.randomUUID();
    await send(a, room.id, 'Primer mensaje privado', retry);
    await send(a, room.id, 'Primer mensaje privado', retry);
    await send(a, room.id, 'Segundo mensaje privado');
    let alert = (await notices(b)).find((n) => n.roomId === room.id);
    assert.equal(alert.count, 2);
    assert.equal(alert.previews.length, 2);
    assert.ok(alert.previews[0].includes(alice.name));
    assert.ok(alert.previews[1].includes('Segundo mensaje privado'));
    assert.equal((await notices(a)).length, 0);
    const push = await json(b, 'GET', `/chat/notifications/${alert.id}/push?device=${device.id}`);
    assert.equal(push.tag, alert.tag);
    assert.equal(push.url, `/#chat/${room.id}`);
    assert.match(push.body, /2 mensajes nuevos/);
    await json(
      c,
      'GET',
      `/chat/notifications/${alert.id}/push?device=${device.id}`,
      undefined,
      404,
    );
    await json(admin, 'GET', `/chat/${room.id}/notifications`, undefined, 404);
    pass(
      'Direct messages create private, idempotent grouped alerts and authorized previews; self-sends and nonparticipants never receive them',
    );
    const oldId = alert.id;
    const muted = await save(b, room.id, { ...on, mode: 'always' });
    assert.equal((await preference(b, room.id)).muted, true);
    assert.equal((await preference(a, room.id)).settings.mode, 'on');
    await save(b, room.id, on, 409, null);
    await send(a, room.id, 'Silenciado para siempre');
    assert.equal((await notices(b)).length, 0);
    assert.equal((await json(b, 'GET', '/chat'))[0].unread, 3);
    await json(b, 'GET', `/chat/notifications/${oldId}/push?device=${device.id}`, undefined, 404);
    await save(b, room.id, on, 200, muted.version);
    await send(a, room.id, 'Después del silencio');
    alert = (await notices(b))[0];
    assert.equal(alert.count, 1);
    assert.ok(!alert.body.includes('Silenciado para siempre'));
    pass(
      'Permanent mute affects only the current member, cancels queued previews and retains unread messages without replaying quiet messages on unmute',
    );
    await save(b, room.id, {
      ...on,
      mode: 'until',
      until: new Date(Date.now() + 3600000).toISOString(),
    });
    await send(a, room.id, 'Silenciado temporalmente');
    assert.equal((await notices(b)).length, 0);
    await save(b, room.id, {
      ...on,
      mode: 'schedule',
      timeZone: 'America/Mexico_City',
      periods: [{ days: [0, 1, 2, 3, 4, 5, 6], startMinute: 0, endMinute: 0 }],
    });
    await send(a, room.id, 'Silenciado por horario');
    assert.equal((await notices(b)).length, 0);
    const now = new Date();
    const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
    await save(b, room.id, {
      ...on,
      mode: 'schedule',
      periods: [
        {
          days: [0, 1, 2, 3, 4, 5, 6],
          startMinute: (minute + 120) % 1440,
          endMinute: (minute + 121) % 1440,
        },
      ],
    });
    assert.equal((await preference(b, room.id)).muted, false);
    await send(a, room.id, 'Fuera del horario de silencio');
    assert.equal((await notices(b))[0].count, 1);
    for (const invalid of [
      { ...on, mode: 'unknown' },
      { ...on, timeZone: 'Invalid/Zone' },
      { ...on, mode: 'until', until: new Date(Date.now() - 1000).toISOString() },
      { ...on, mode: 'schedule', periods: [] },
      { ...on, mode: 'schedule', periods: [{ days: [7], startMinute: 0, endMinute: 0 }] },
      { ...on, mode: 'schedule', periods: [{ days: [1], startMinute: 1440, endMinute: 0 }] },
    ])
      await save(b, room.id, invalid, 400);
    const version = (await preference(b, room.id)).version;
    const concurrent = await Promise.all(
      ['always', 'on'].map((mode) =>
        b.put(`/api/chat/${room.id}/notifications`, {
          data: { settings: { ...on, mode }, version },
        }),
      ),
    );
    assert.deepEqual(concurrent.map((r) => r.status()).sort(), [200, 409]);
    await save(b, room.id, on);
    pass(
      'Temporary and scheduled silence are enforced server-side, validate dates/zones/rules, and concurrent preference changes reject stale versions',
    );
    alert = (await notices(b))[0];
    if (alert) {
      await json(b, 'POST', `/chat/${room.id}/read`, { sequence: alert.sequence }, 204);
      assert.equal((await notices(b)).length, 0);
    }

    const group = await json(a, 'POST', '/chat', {
      isGroup: true,
      name: 'Avisos del grupo QA',
      users: [bob.id, carol.id, adminUser.id],
    });
    await save(b, group.id, { ...on, mode: 'always' });
    for (let i = 0; i < 7; i++) await send(a, group.id, `Mensaje grupal ${i}`);
    assert.ok(!(await notices(b)).some((n) => n.roomId === group.id));
    const carolAlert = (await notices(c)).find((n) => n.roomId === group.id);
    assert.equal(carolAlert.count, 7);
    assert.equal(carolAlert.previews.length, 5);
    assert.ok(carolAlert.previews[0].includes('Mensaje grupal 2'));
    assert.ok(carolAlert.previews[4].includes('Mensaje grupal 6'));
    assert.notEqual(carolAlert.tag, (await notices(admin)).find((n) => n.roomId === group.id).tag);
    const current = (await json(a, 'GET', '/chat')).find((r) => r.id === group.id);
    await json(
      a,
      'PUT',
      `/chat/${group.id}`,
      { name: current.name, users: [adminUser.id, carol.id], version: current.version },
      204,
    );
    await json(b, 'GET', `/chat/${group.id}/notifications`, undefined, 404);
    await json(
      a,
      'PUT',
      `/chat/${group.id}`,
      {
        name: current.name,
        users: [adminUser.id, carol.id, bob.id],
        version: (await json(a, 'GET', '/chat')).find((r) => r.id === group.id).version,
      },
      204,
    );
    assert.equal((await preference(b, group.id)).settings.mode, 'on');
    pass(
      'Group alerts aggregate counts and the latest five author previews; member-specific mute and removed/rejoined membership stay isolated',
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await inbox();
    const live = await json(admin, 'POST', '/chat', { isGroup: false, users: [bob.id] });
    await send(b, live.id, 'Aviso directo en tiempo real');
    const banner = page.locator('.chat-live-notice').filter({ hasText: bob.name });
    await banner.getByText('Aviso directo en tiempo real', { exact: false }).waitFor();
    await send(b, live.id, 'Segundo aviso en el mismo chat');
    await banner.getByText('2 mensajes nuevos', { exact: true }).waitFor();
    for (const [width, height, theme] of [
      [1440, 900, 'light'],
      [1440, 900, 'dark'],
      [390, 844, 'dark'],
      [320, 740, 'light'],
      [844, 390, 'dark'],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const box = await banner.boundingBox();
      assert.ok(
        box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height,
      );
      await page.screenshot({
        path: path.join(artifacts, `chat-notice-${width}-${theme}.png`),
        animations: 'disabled',
      });
    }
    await banner.locator('.chat-live-open').click();
    await page.waitForURL((url) => url.hash === `#chat/${live.id}`);
    await page
      .locator('.chat-head')
      .getByRole('heading', { name: bob.name, exact: true })
      .waitFor();
    await page.waitForFunction(() => !document.querySelector('.chat-live-notices'));
    await send(b, live.id, 'Mensaje en el chat abierto');
    await page
      .getByRole('log', { name: 'Mensajes' })
      .getByText('Mensaje en el chat abierto', { exact: true })
      .waitFor();
    assert.equal(await page.locator('.chat-live-notice').count(), 0);
    pass(
      'Live notifications outside the active chat aggregate previews, fit both themes/phone/landscape, navigate correctly and stop once the chat is read',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Notificaciones del chat', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Notificaciones del chat', exact: true });
    await dialog.getByLabel('Cuándo notificar').selectOption('schedule');
    await dialog.getByRole('button', { name: 'Agregar horario' }).click();
    await dialog.getByLabel('Todo el día').last().check();
    for (const [width, height, theme] of [
      [1440, 900, 'light'],
      [390, 844, 'dark'],
      [320, 740, 'light'],
      [844, 390, 'dark'],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      const bounds = await dialog.boundingBox();
      const action = await dialog
        .getByRole('button', { name: 'Guardar preferencias' })
        .boundingBox();
      assert.ok(
        bounds.x >= 0 &&
          bounds.x + bounds.width <= width &&
          bounds.y >= 0 &&
          bounds.y + bounds.height <= height,
      );
      assert.ok(action.y >= bounds.y && action.y + action.height <= bounds.y + bounds.height);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({
        path: path.join(artifacts, `chat-mute-dialog-${width}-${theme}.png`),
        animations: 'disabled',
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(artifacts, 'chat-mute-schedule-mobile.png'),
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Guardar preferencias' }).click();
    await dialog.waitFor({ state: 'hidden' });
    const prefs = await preference(admin, live.id);
    assert.equal(prefs.settings.periods.length, 2);
    assert.equal(prefs.settings.mode, 'schedule');
    await page.getByRole('button', { name: 'Notificaciones del chat', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Notificaciones del chat', exact: true });
    await dialog.getByLabel('Cuándo notificar').selectOption('until');
    await dialog.getByRole('button', { name: '8 horas', exact: true }).click();
    await dialog.getByRole('button', { name: 'Guardar preferencias' }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await preference(admin, live.id)).muted, true);
    await inbox();
    await send(b, live.id, 'Sin aviso mientras está silenciado');
    const afterQuiet = await notices(admin);
    assert.ok(!afterQuiet.some((n) => n.roomId === live.id));
    const roomInfo = (await json(admin, 'GET', '/chat')).find((r) => r.id === live.id);
    assert.equal(roomInfo.unread, 1);
    await page.goto(`/#chat/${live.id}`);
    await page.getByRole('button', { name: 'Notificaciones del chat', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Notificaciones del chat', exact: true });
    await dialog.getByLabel('Cuándo notificar').selectOption('always');
    page.once('dialog', (prompt) => prompt.dismiss());
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(await dialog.isVisible(), true);
    page.once('dialog', (prompt) => prompt.accept());
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await preference(admin, live.id)).settings.mode, 'until');
    pass(
      'The actual phone dialog saves multiple weekly rules and temporary durations, keeps unread counts, and confirms discarding unsaved preferences',
    );
    await save(admin, live.id, on);
    await inbox();
    await send(a, group.id, 'Aviso grupal en tiempo real');
    const groupBanner = page
      .locator('.chat-live-notice')
      .filter({ hasText: 'Avisos del grupo QA' });
    await groupBanner.getByText('Aviso grupal en tiempo real', { exact: false }).waitFor();
    await groupBanner.locator('.chat-live-open').click();
    await page.getByRole('button', { name: 'Notificaciones del chat', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Notificaciones del chat', exact: true });
    await dialog.getByLabel('Cuándo notificar').selectOption('always');
    await dialog.getByRole('button', { name: 'Guardar preferencias' }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await preference(admin, group.id)).settings.mode, 'always');
    assert.equal((await preference(a, group.id)).settings.mode, 'on');
    await inbox();
    await send(a, group.id, 'Grupo silenciado para admin');
    assert.ok(!(await notices(admin)).some((n) => n.roomId === group.id));
    pass(
      'A group member can mute their own group notifications without owning the group or changing other members’ settings',
    );
    await page.goto(`/#chat/${live.id}`);
    await page.getByRole('button', { name: 'Notificaciones del chat', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Notificaciones del chat', exact: true });
    await dialog.getByLabel('Cuándo notificar').selectOption('schedule');
    await save(admin, live.id, { ...on, mode: 'always' });
    await dialog.getByRole('button', { name: 'Guardar preferencias' }).click();
    await dialog
      .getByText(
        'Tus preferencias cambiaron en otra sesión. Cierra y vuelve a abrir este diálogo.',
        { exact: true },
      )
      .waitFor();
    assert.equal(await dialog.getByLabel('Cuándo notificar').inputValue(), 'schedule');
    page.once('dialog', (prompt) => prompt.accept());
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await save(admin, live.id, on);
    pass(
      'Preference dialogs keep Save/Cancel visible in desktop/phone/landscape and preserve edits on real cross-session conflicts',
    );
    await save(admin, group.id, on);
    await inbox();
    await send(a, group.id, 'Vista previa antes de retirar acceso');
    const removedBanner = page
      .locator('.chat-live-notice')
      .filter({ hasText: 'Avisos del grupo QA' });
    await removedBanner
      .getByText('Vista previa antes de retirar acceso', { exact: false })
      .waitFor();
    const latestGroup = (await json(a, 'GET', '/chat')).find((r) => r.id === group.id);
    await json(
      a,
      'PUT',
      `/chat/${group.id}`,
      { name: latestGroup.name, users: [bob.id, carol.id], version: latestGroup.version },
      204,
    );
    await removedBanner.waitFor({ state: 'hidden' });
    assert.ok(!(await notices(admin)).some((n) => n.roomId === group.id));
    pass(
      'Removing a participant clears their live preview immediately even when the server emits only the conversation-change event',
    );
  } finally {
    await page.goto('/#inbox');
    await Promise.all(people.map((p) => p.client.dispose()));
  }
}
