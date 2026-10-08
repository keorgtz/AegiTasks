import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

export async function testChat({
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
  const create = async (name) =>
    json(admin, 'POST', '/users', {
      name,
      email: `${name.toLowerCase().replaceAll(' ', '-')}@chat.example`,
      role: 'User',
      password,
    });
  const alice = await create('Chat Alice');
  const bob = await create('Chat Bob');
  const outsider = await create('Chat Outsider');
  const context = async (user, space = '00000000-0000-0000-0000-000000000001') => {
    const c = await request.newContext({
      baseURL: 'http://localhost:5213',
      extraHTTPHeaders: { 'X-AegiTasks': '1', 'X-Space-Id': space },
    });
    await json(c, 'POST', '/auth/login', { email: user.email, password });
    return c;
  };
  const a = await context(alice);
  const b = await context(bob);
  const x = await context(outsider);
  const direct = await json(a, 'POST', '/chat', { isGroup: false, users: [bob.id] });
  assert.equal(
    (await json(b, 'POST', '/chat', { isGroup: false, users: [alice.id] })).id,
    direct.id,
  );
  assert.equal((await json(a, 'GET', '/chat'))[0].id, direct.id);
  assert.equal((await json(b, 'GET', '/chat'))[0].id, direct.id);
  assert.equal((await json(x, 'GET', '/chat')).length, 0);
  await json(x, 'GET', `/chat/${direct.id}/messages`, undefined, 404);
  await json(admin, 'GET', `/chat/${direct.id}/messages`, undefined, 404);
  const users = await json(a, 'GET', '/chat/users?q=Chat Bob');
  assert.ok(users.items.some((u) => u.id === bob.id));
  assert.ok(!users.items.some((u) => 'email' in u));
  pass(
    'Direct chats are unique and independent of workspace headers/membership; only participants can read them and the active-user directory omits emails',
  );
  const send = async (ctx, id, body = '', options = {}) => {
    const r = await ctx.post(`/api/chat/${id}/messages`, {
      multipart: {
        body,
        clientId: options.clientId || crypto.randomUUID(),
        ...(options.taskId ? { taskId: options.taskId } : {}),
        ...(options.file ? { files: options.file } : {}),
      },
    });
    const content = await r.text();
    assert.equal(r.status(), options.status || 200, content);
    return content ? JSON.parse(content) : null;
  };
  const retry = crypto.randomUUID();
  const first = await send(a, direct.id, 'Hola desde otro Space', { clientId: retry });
  assert.equal(
    (await send(a, direct.id, 'Hola desde otro Space', { clientId: retry })).id,
    first.id,
  );
  assert.equal((await json(b, 'GET', `/chat/${direct.id}/messages`)).items.length, 1);
  assert.equal((await json(b, 'GET', '/chat'))[0].unread, 1);
  await json(b, 'POST', `/chat/${direct.id}/read`, { sequence: 1 }, 204);
  assert.equal((await json(b, 'GET', '/chat'))[0].unread, 0);
  await send(a, direct.id, '', { status: 400 });
  await send(x, direct.id, 'Intrusion', { status: 404 });
  for (let i = 0; i < 55; i++) await send(a, direct.id, `History ${i}`);
  const recent = await json(b, 'GET', `/chat/${direct.id}/messages`);
  assert.equal(recent.items.length, 50);
  assert.equal(recent.hasMore, true);
  const older = await json(
    b,
    'GET',
    `/chat/${direct.id}/messages?before=${recent.items[0].sequence}`,
  );
  assert.equal(older.items.length, 6);
  assert.equal(new Set([...older.items, ...recent.items].map((m) => m.id)).size, 56);
  pass(
    'Messages persist once with idempotent retries, sequence pagination has no gaps/duplicates and unread cursors are private and monotonic',
  );
  await json(b, 'POST', `/chat/${direct.id}/read`, { sequence: 1 }, 204);
  assert.equal((await json(b, 'GET', '/chat'))[0].unread, 55);
  await Promise.all([
    send(a, direct.id, 'Concurrent A'),
    send(b, direct.id, 'Concurrent B'),
    send(a, direct.id, 'Concurrent C'),
  ]);
  const parallel = (await json(a, 'GET', `/chat/${direct.id}/messages`)).items.filter((m) =>
    m.body.startsWith('Concurrent'),
  );
  assert.equal(parallel.length, 3);
  assert.equal(new Set(parallel.map((m) => m.sequence)).size, 3);
  pass(
    'Concurrent participants append distinct messages without lost writes and older read cursors never hide new unread work',
  );
  const group = await json(a, 'POST', '/chat', {
    isGroup: true,
    name: 'Equipo Chat',
    users: [bob.id, adminUser.id],
  });
  let info = (await json(a, 'GET', '/chat')).find((r) => r.id === group.id);
  await json(
    b,
    'PUT',
    `/chat/${group.id}`,
    { name: 'Not owner', users: [alice.id], version: info.version },
    403,
  );
  await json(
    a,
    'PUT',
    `/chat/${group.id}`,
    {
      name: 'Grupo actualizado',
      users: [bob.id, adminUser.id, outsider.id],
      version: info.version,
    },
    204,
  );
  await json(
    a,
    'PUT',
    `/chat/${group.id}`,
    { name: 'Stale', users: [bob.id], version: info.version },
    409,
  );
  assert.ok((await json(x, 'GET', '/chat')).some((r) => r.id === group.id));
  info = (await json(a, 'GET', '/chat')).find((r) => r.id === group.id);
  await send(x, group.id, 'Mensaje del nuevo integrante');
  await json(
    a,
    'PUT',
    `/chat/${group.id}`,
    { name: 'Grupo actualizado', users: [bob.id, adminUser.id], version: info.version },
    204,
  );
  await json(x, 'GET', `/chat/${group.id}/messages`, undefined, 404);
  pass(
    'Groups share messages with every participant; only the owner manages name/members, stale edits fail and removed members lose access immediately',
  );
  const pdf = await send(a, direct.id, 'Documento', {
    file: {
      name: 'manual.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nPrivate chat'),
    },
  });
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X+hUAAAAASUVORK5CYII=',
    'base64',
  );
  await send(a, direct.id, 'Imagen', {
    file: { name: 'foto.png', mimeType: 'image/png', buffer: pngBytes },
  });
  await send(a, direct.id, 'Video', {
    file: {
      name: 'video.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.concat([
        Buffer.from([0, 0, 0, 24]),
        Buffer.from('ftypisom'),
        Buffer.alloc(20),
      ]),
    },
  });
  const media = await json(b, 'GET', `/chat/${direct.id}/messages`);
  const file = media.items.find((m) => m.id === pdf.id).files[0];
  const download = await b.get(`/api/chat/files/${file.id}`);
  assert.equal(download.status(), 200);
  assert.ok(download.headers()['content-disposition'].includes('attachment'));
  assert.ok((await download.body()).includes(Buffer.from('Private chat')));
  assert.equal((await x.get(`/api/chat/files/${file.id}`)).status(), 404);
  const image = media.items.find((m) => m.body === 'Imagen').files[0];
  assert.equal((await b.get(`/api/chat/files/${image.id}`)).headers()['content-type'], 'image/png');
  const video = media.items.find((m) => m.body === 'Video').files[0];
  const ranged = await b.get(`/api/chat/files/${video.id}`, { headers: { Range: 'bytes=0-7' } });
  assert.equal(ranged.status(), 206);
  await send(a, direct.id, 'Invalid file', {
    file: {
      name: 'fake.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<script>alert(1)</script>'),
    },
    status: 400,
  });
  await send(a, direct.id, 'Too big', {
    file: {
      name: 'big.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024)]),
    },
    status: 400,
  });
  assert.ok(
    !(await json(b, 'GET', `/chat/${direct.id}/messages`)).items.some(
      (m) => m.body === 'Invalid file' || m.body === 'Too big',
    ),
  );
  pass(
    'Authenticated chat files support documents/images and video ranges, reject spoofed/oversized uploads atomically and deny nonparticipants',
  );
  // Two real looping purple/green GIF frames, 160ms each.
  const gifBytes = await readFile(new URL('./fixtures/chat-animation.gif', import.meta.url));
  const gifUpload = { name: 'animated-check.gif', mimeType: 'image/gif', buffer: gifBytes };
  const gifMessage = await send(a, direct.id, '', { file: gifUpload });
  const gifFile = (await json(b, 'GET', `/chat/${direct.id}/messages`)).items.find(
    (m) => m.id === gifMessage.id,
  ).files[0];
  assert.equal(gifFile.contentType, 'image/gif');
  assert.deepEqual(await (await b.get(`/api/chat/files/${gifFile.id}`)).body(), gifBytes);
  assert.equal((await json(b, 'GET', '/chat/gifs?q=ANIMATED-CHECK')).items[0].id, gifFile.id);
  assert.equal((await json(admin, 'GET', '/chat/gifs')).total, 0);
  assert.equal((await json(x, 'GET', '/chat/gifs')).total, 0);
  assert.equal((await x.get(`/api/chat/files/${gifFile.id}`)).status(), 404);
  await send(a, direct.id, '', {
    file: { ...gifUpload, buffer: Buffer.from('<script>not a GIF</script>') },
    status: 400,
  });
  const gifGroup = await json(a, 'POST', '/chat', {
    isGroup: true,
    name: 'GIF sharing',
    users: [bob.id, outsider.id],
  });
  await send(a, gifGroup.id, '', { file: { ...gifUpload, name: 'group-animation.gif' } });
  assert.equal((await json(x, 'GET', '/chat/gifs?q=group-animation')).total, 1);
  const gifGroupInfo = (await json(a, 'GET', '/chat')).find((r) => r.id === gifGroup.id);
  await json(
    a,
    'PUT',
    `/chat/${gifGroup.id}`,
    { name: gifGroupInfo.name, users: [bob.id], version: gifGroupInfo.version },
    204,
  );
  assert.equal((await json(x, 'GET', '/chat/gifs?q=group-animation')).total, 0);
  for (let i = 0; i < 25; i++)
    await send(a, direct.id, '', { file: { ...gifUpload, name: `paged-${i}.gif` } });
  const gifPage1 = await json(b, 'GET', '/chat/gifs?q=paged-&page=1');
  const gifPage2 = await json(b, 'GET', '/chat/gifs?q=paged-&page=2');
  assert.equal(gifPage1.items.length, 24);
  assert.equal(gifPage2.items.length, 1);
  assert.equal(gifPage1.total, 25);
  assert.equal(new Set([...gifPage1.items, ...gifPage2.items].map((f) => f.id)).size, 25);
  assert.equal(
    (await json(b, 'GET', '/chat')).find((r) => r.id === direct.id).preview,
    'GIF adjunto',
  );
  assert.ok(
    (await json(b, 'GET', '/chat/notifications'))
      .find((n) => n.roomId === direct.id)
      .previews.some((p) => p.includes('GIF adjunto')),
  );
  pass(
    'Animated GIF bytes persist unchanged; the searchable bounded gallery includes only current participant chats, excludes Admin/outsiders and removes group access immediately',
  );
  await json(admin, 'POST', `/spaces/${shared.id}/members`, { userId: alice.id }, 204);
  await json(admin, 'POST', `/spaces/${shared.id}/members`, { userId: bob.id }, 204);
  const project = await json(admin, 'POST', '/projects', {
    name: 'Chat task project',
    color: 'purple',
  });
  const updated = await json(admin, 'GET', '/workspace');
  const task = await json(admin, 'POST', '/tasks', {
    title: 'Pendiente compartido por chat',
    projectId: project.id,
    statusId: updated.statuses.find((s) => s.projectId === project.id).id,
    tagIds: [],
  });
  assert.equal(
    (await json(a, 'GET', `/chat/${direct.id}/task-options?space=${shared.id}`)).total > 0,
    true,
  );
  await send(a, direct.id, 'Revisa este pendiente', { taskId: task.id });
  const reference = (await json(b, 'GET', `/chat/${direct.id}/messages`)).items.find((m) => m.task);
  assert.equal(reference.task.title, task.title);
  await json(admin, 'DELETE', `/spaces/${shared.id}/members/${bob.id}`, undefined, 204);
  assert.equal(
    (await json(b, 'GET', `/chat/${direct.id}/messages`)).items.find((m) => m.task).task.available,
    false,
  );
  assert.equal(
    (await json(a, 'GET', `/chat/${direct.id}/task-options?space=${shared.id}`)).total,
    0,
  );
  await send(a, direct.id, 'Forbidden shortcut', { taskId: task.id, status: 400 });
  await send(b, direct.id, 'El chat sigue independiente');
  await json(admin, 'POST', `/spaces/${shared.id}/members`, { userId: bob.id }, 204);
  pass(
    'Task shortcuts require access for every participant, hide titles after revocation and never bind the conversation to a workspace',
  );
  const roomAdmin = await json(admin, 'POST', '/chat', { isGroup: false, users: [alice.id] });
  const openMediaPicker = async () => {
    if (page.viewportSize().width <= 480) {
      await page.getByRole('button', { name: 'Agregar al mensaje', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Agregar al mensaje', exact: true })
        .getByRole('button', { name: 'Emojis y GIFs', exact: true })
        .click();
    } else
      await page
        .locator('.chat-composer')
        .getByRole('button', { name: 'Emojis y GIFs', exact: true })
        .click();
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?space=${shared.id}#chat/${roomAdmin.id}`);
  await page.getByRole('heading', { name: 'Chat Alice', exact: true }).waitFor();
  const composerText = page.getByLabel('Mensaje', { exact: true });
  await composerText.fill('Inicio FINAL');
  await composerText.evaluate((el) => {
    el.focus();
    el.setSelectionRange(7, 12);
  });
  await openMediaPicker();
  const mediaPicker = page.getByRole('dialog', { name: 'Emojis y GIFs', exact: true });
  await mediaPicker.getByLabel('Buscar emojis').fill('pulgar arriba');
  await mediaPicker.getByLabel('Tono de piel').selectOption('3');
  await mediaPicker
    .getByRole('button', { name: 'Insertar pulgar arriba bien ok', exact: true })
    .click();
  await mediaPicker.getByLabel('Buscar emojis').fill('corazon morado');
  await mediaPicker.getByRole('button', { name: 'Insertar corazón morado', exact: true }).click();
  await mediaPicker.getByRole('button', { name: 'Cerrar', exact: true }).click();
  assert.equal(await composerText.inputValue(), 'Inicio 👍🏽💜');
  assert.equal(await composerText.evaluate((el) => el.selectionStart), 'Inicio 👍🏽💜'.length);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.locator('.chat-message-text').getByText('Inicio 👍🏽💜', { exact: true }).waitFor();
  await openMediaPicker();
  await mediaPicker.getByLabel('Categoría de emojis').selectOption('Recientes');
  await mediaPicker.getByRole('button', { name: 'Insertar 💜', exact: true }).waitFor();
  assert.equal(await mediaPicker.getByLabel('Tono de piel').inputValue(), '3');
  await mediaPicker.getByRole('button', { name: 'Cerrar', exact: true }).click();
  pass(
    'Emoji picker searches accent-insensitively, replaces the selected text at the cursor, supports skin tones and multiple insertions, sends Unicode and restores per-account recent preferences',
  );
  await openMediaPicker();
  await mediaPicker.getByRole('button', { name: 'GIFs', exact: true }).click();
  await mediaPicker
    .locator('input[type=file]')
    .setInputFiles({ name: 'fake.gif', mimeType: 'image/gif', buffer: pngBytes });
  await mediaPicker
    .getByRole('alert')
    .getByText('Selecciona un archivo GIF válido.', { exact: true })
    .waitFor();
  await mediaPicker.locator('input[type=file]').setInputFiles({
    name: 'oversized.gif',
    mimeType: 'image/gif',
    buffer: Buffer.concat([gifBytes, Buffer.alloc(10 * 1024 * 1024)]),
  });
  await mediaPicker
    .getByRole('alert')
    .getByText('Selecciona GIFs de hasta 10 MB cada uno.', { exact: true })
    .waitFor();
  await mediaPicker.locator('input[type=file]').setInputFiles(gifUpload);
  await page.locator('.chat-draft-chip').getByText(gifUpload.name, { exact: true }).waitFor();
  assert.ok(
    !(await json(admin, 'GET', `/chat/${roomAdmin.id}/messages`)).items.some((m) =>
      m.files.some((f) => f.name === gifUpload.name),
    ),
  );
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  const sentGif = page
    .locator('.chat-file')
    .filter({ has: page.getByAltText(gifUpload.name, { exact: true }) });
  await sentGif
    .getByRole('button', { name: `Pausar GIF ${gifUpload.name}`, exact: true })
    .waitFor();
  // Canvas draws the poster of animated images by specification. Measure actual browser rendering.
  const frames = new Set();
  for (let i = 0; i < 8; i++) {
    frames.add((await sentGif.locator('img').screenshot()).toString('base64'));
    await page.waitForTimeout(70);
  }
  assert.ok(frames.size >= 2, 'The real rendered GIF advances between different frames');
  await sentGif.getByRole('button', { name: `Pausar GIF ${gifUpload.name}`, exact: true }).click();
  await sentGif.locator('canvas').waitFor({ state: 'visible' });
  await sentGif
    .getByRole('button', { name: `Reproducir GIF ${gifUpload.name}`, exact: true })
    .click();
  await openMediaPicker();
  await mediaPicker.getByRole('button', { name: 'GIFs', exact: true }).click();
  await mediaPicker
    .getByRole('button', { name: `Adjuntar GIF ${gifUpload.name}`, exact: true })
    .click();
  await page.locator('.chat-draft-chip').getByText(gifUpload.name, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.chat-file .chat-gif-preview').length === 2,
  );
  pass(
    'GIF picker uploads to the draft before sending, displays real animation with pause/play and reuses an authorized GIF as a new attachment without modifying the original',
  );
  await composerText.fill('a'.repeat(4000));
  await openMediaPicker();
  await mediaPicker.getByLabel('Buscar emojis').fill('cohete');
  await mediaPicker
    .getByRole('button', { name: 'Insertar cohete lanzamiento', exact: true })
    .click();
  await mediaPicker
    .getByRole('alert')
    .getByText('El mensaje admite hasta 4000 caracteres.')
    .waitFor();
  await page.keyboard.press('Escape');
  assert.equal((await composerText.inputValue()).length, 4000);
  await composerText.fill('');
  await composerText.evaluate(
    (el, bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], 'pasted.gif', { type: 'image/gif' }));
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
      );
    },
    [...gifBytes],
  );
  await page.locator('.chat-draft-chip').getByText('pasted.gif', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Quitar pasted.gif', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMediaPicker();
  await mediaPicker.getByRole('button', { name: 'GIFs', exact: true }).click();
  assert.equal(await mediaPicker.getByLabel('Animar', { exact: true }).isChecked(), false);
  const galleryGif = mediaPicker
    .getByRole('button', { name: `Adjuntar GIF ${gifUpload.name}`, exact: true })
    .first();
  await galleryGif.locator('canvas').waitFor({ state: 'visible' });
  await mediaPicker.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  pass(
    'Emoji limits reject overflow without losing the draft; pasted GIFs attach without sending and reduced-motion previews default to still frames',
  );
  await page.getByLabel('Mensaje', { exact: true }).fill('Hola desde la interfaz');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page
    .getByRole('log', { name: 'Mensajes' })
    .getByText('Hola desde la interfaz', { exact: true })
    .waitFor();
  await send(a, roomAdmin.id, 'Respuesta en tiempo real');
  await page
    .getByRole('log', { name: 'Mensajes' })
    .getByText('Respuesta en tiempo real', { exact: true })
    .waitFor();
  await page.getByLabel('Mensaje', { exact: true }).fill('Borrador al cambiar Space');
  const personal = (await json(admin, 'GET', '/spaces')).spaces.find((s) => s.isPersonal);
  await page.getByRole('button', { name: 'Cambiar espacio', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Cambiar espacio', exact: true })
    .getByLabel('Espacio activo')
    .selectOption(personal.id);
  await page.waitForFunction(
    (id) => document.querySelector('.app-header select[aria-label="Espacio activo"]')?.value === id,
    personal.id,
  );
  await page.getByRole('heading', { name: 'Chat Alice', exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('Mensaje', { exact: true }).inputValue(),
    'Borrador al cambiar Space',
  );
  await page.getByLabel('Mensaje', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Cambiar espacio', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Cambiar espacio', exact: true })
    .getByLabel('Espacio activo')
    .selectOption(shared.id);
  await page.waitForFunction(
    (id) => document.querySelector('.app-header select[aria-label="Espacio activo"]')?.value === id,
    shared.id,
  );
  await page.getByLabel('Mensaje', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Agregar al mensaje', exact: true }).click();
  await page.getByRole('button', { name: 'Adjuntar archivos', exact: true }).click(); // file chooser remains optional in automation
  await page
    .locator('.chat-composer input[type=file]')
    .setInputFiles({ name: 'ui-photo.png', mimeType: 'image/png', buffer: pngBytes });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByAltText('ui-photo.png').waitFor();
  const clip = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 72;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(20);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    const done = new Promise((resolve) => {
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () =>
        resolve(
          Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer())),
        );
    });
    let frame = 0;
    const timer = setInterval(() => {
      context.fillStyle = '#7c3aed';
      context.fillRect(0, 0, 128, 72);
      context.fillStyle = '#ddd6fe';
      context.fillRect((frame++ * 4) % 100, 20, 24, 24);
    }, 30);
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 700));
    recorder.stop();
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    return done;
  });
  await page
    .locator('.chat-composer input[type=file]')
    .setInputFiles({ name: 'ui-video.webm', mimeType: 'video/webm', buffer: Buffer.from(clip) });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.chat-file video')?.readyState >= 1);
  assert.equal(await page.locator('.chat-file video').getAttribute('controls'), '');
  await page.locator('.chat-file video').evaluate((video) => video.play());
  await page.waitForFunction(() => document.querySelector('.chat-file video')?.currentTime > 0.15);
  await page.locator('.chat-file video').evaluate((video) => video.pause());
  pass(
    'A real recorded WebM uploads and renders in the authenticated player with video metadata and controls',
  );
  await page.getByRole('button', { name: 'Agregar al mensaje', exact: true }).click();
  await page.getByRole('button', { name: 'Compartir pendiente', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Compartir pendiente', exact: true });
  await picker.getByRole('button', { name: task.title, exact: true }).click();
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page
    .getByRole('button', { name: /Pendiente compartido.*Pendiente compartido por chat/ })
    .waitFor();
  pass(
    'The actual UI sends text/images/task shortcuts, receives another user’s message live and preserves drafts/conversations across Space switches',
  );
  for (const [width, height, theme] of [
    [1440, 900, 'light'],
    [1440, 900, 'dark'],
    [390, 844, 'dark'],
    [320, 740, 'light'],
    [844, 450, 'dark'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    await page.waitForFunction(
      () =>
        !!document.querySelector('.chat-composer') &&
        document.querySelector('.chat-composer').getBoundingClientRect().bottom <= innerHeight + 1,
    );
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `No horizontal overflow at ${width}`,
    );
    const composer = await page.locator('.chat-composer').boundingBox();
    assert.ok(
      composer.x >= 0 &&
        composer.x + composer.width <= width &&
        composer.y + composer.height <= height,
      JSON.stringify(composer),
    );
    await page.screenshot({ path: path.join(artifacts, `chat-${width}-${theme}.png`) });
    await openMediaPicker();
    await mediaPicker.getByLabel('Buscar emojis').fill('cohete');
    const mediaBounds = await mediaPicker.boundingBox();
    assert.ok(
      mediaBounds.x >= 0 &&
        mediaBounds.x + mediaBounds.width <= width + 1 &&
        mediaBounds.y >= 0 &&
        mediaBounds.y + mediaBounds.height <= height + 1,
    );
    await page.screenshot({ path: path.join(artifacts, `chat-media-${width}-${theme}.png`) });
    const emojiBounds = await mediaPicker
      .getByRole('button', { name: 'Insertar cohete lanzamiento', exact: true })
      .boundingBox();
    const pickerScroll = await mediaPicker.locator('.chat-media-scroll').boundingBox();
    assert.ok(
      emojiBounds.y + emojiBounds.height <= pickerScroll.y + pickerScroll.height + 1,
      'Emoji is fully reachable in the picker',
    );
    await mediaPicker.getByRole('button', { name: 'GIFs', exact: true }).click();
    await mediaPicker.locator('.chat-gif-option').first().waitFor();
    await page.screenshot({ path: path.join(artifacts, `chat-gifs-${width}-${theme}.png`) });
    const gifBounds = await mediaPicker.locator('.chat-gif-option').first().boundingBox();
    const gifScroll = await mediaPicker.locator('.chat-media-scroll').boundingBox();
    assert.ok(
      gifBounds.y + gifBounds.height <= gifScroll.y + gifScroll.height + 1,
      'GIF choice is fully reachable in the picker',
    );
    await mediaPicker.getByRole('button', { name: 'Cerrar', exact: true }).click();
    if (width < 768) {
      await page.getByRole('button', { name: 'Volver a conversaciones' }).click();
      await page.getByRole('button', { name: 'Nuevo chat', exact: true }).waitFor();
      await page
        .getByRole('navigation', { name: 'Conversaciones' })
        .getByRole('button', { name: /Chat Alice/ })
        .click();
    }
  }
  pass(
    'Conversation list, message previews, composer and attachments fit desktop/portrait/landscape in both themes with mobile back navigation',
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Nuevo chat', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Nueva conversación', exact: true });
  await modal.getByRole('button', { name: 'Grupo', exact: true }).click();
  await modal.getByLabel('Nombre del grupo').fill('Grupo desde UI');
  await modal.getByLabel('Buscar usuarios').fill('Chat Bob');
  await modal.getByRole('checkbox', { name: /Chat Bob/ }).check();
  await modal.getByRole('button', { name: 'Comenzar chat', exact: true }).click();
  await page.getByRole('heading', { name: 'Grupo desde UI', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Integrantes del grupo', exact: true }).click();
  const members = page.getByRole('dialog', { name: 'Integrantes del grupo', exact: true });
  await members.getByLabel('Nombre del grupo').fill('Grupo UI actualizado');
  await members.getByRole('button', { name: 'Guardar grupo', exact: true }).click();
  await page.getByRole('heading', { name: 'Grupo UI actualizado', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Integrantes del grupo', exact: true }).click();
  await members.getByLabel('Nombre del grupo').fill('Draft group name');
  const currentGroup = (await json(admin, 'GET', '/chat')).find(
    (r) => r.name === 'Grupo UI actualizado',
  );
  await json(
    admin,
    'PUT',
    `/chat/${currentGroup.id}`,
    {
      name: 'Remote group name',
      users: currentGroup.members.map((m) => m.userId),
      version: currentGroup.version,
    },
    204,
  );
  await page
    .locator('.chat-head')
    .getByRole('heading', { name: 'Remote group name', exact: true })
    .waitFor();
  await members.getByRole('button', { name: 'Guardar grupo', exact: true }).click();
  await members.getByText('El grupo cambió. Recarga antes de editarlo.', { exact: true }).waitFor();
  assert.equal(await members.getByLabel('Nombre del grupo').inputValue(), 'Draft group name');
  assert.equal(
    (await json(admin, 'GET', '/chat')).find((r) => r.id === currentGroup.id).name,
    'Remote group name',
  );
  await members.getByRole('button', { name: 'Cancelar', exact: true }).click();
  pass(
    'Users create groups and manage their names through the real UI without administration or workspace membership',
  );
  await json(admin, 'POST', '/roles', { name: 'NoChat' }, 204);
  await json(admin, 'PUT', '/roles/NoChat/permissions', { pages: ['notes'] }, 204);
  await json(admin, 'PUT', `/users/${bob.id}`, { name: bob.name, role: 'NoChat', active: true });
  await json(b, 'POST', '/auth/login', { email: bob.email, password });
  await json(b, 'GET', '/chat', undefined, 403);
  await json(b, 'GET', '/chat/gifs', undefined, 403);
  assert.equal((await b.get(`/api/chat/files/${file.id}`)).status(), 403);
  assert.ok(!(await json(a, 'GET', '/chat/users?q=Chat Bob')).items.some((u) => u.id === bob.id));
  pass(
    'Chat is a default page permission for roles; revocation blocks conversations, files and user discovery independently of Spaces',
  );
  await page.goto('/#inbox');
  await Promise.all([a, b, x].map((c) => c.dispose()));
}
