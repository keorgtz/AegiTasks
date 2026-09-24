import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

export async function testSpaces({
  request,
  admin,
  personalAdmin,
  support,
  shared,
  member,
  password,
  json,
  pass,
  pms,
  task,
  attachment,
}) {
  const baseURL = 'http://localhost:5213';
  const personalSupport = await request.newContext({
    baseURL,
    storageState: await support.storageState(),
    extraHTTPHeaders: { 'X-AegiTasks': '1' },
  });
  const mine = (await json(personalSupport, 'GET', '/spaces')).spaces.find((s) => s.isPersonal);
  assert.equal(mine.ownerId, member.id);
  const asSpace = async (context, id) =>
    request.newContext({
      baseURL,
      storageState: await context.storageState(),
      extraHTTPHeaders: { 'X-AegiTasks': '1', 'X-Space-Id': id },
    });
  const intruder = await asSpace(admin, mine.id);
  for (const endpoint of [
    '/workspace',
    '/tasks',
    '/notes',
    '/note-folders',
    '/focus',
    `/attachments/${attachment.id}`,
  ])
    await json(intruder, 'GET', endpoint, undefined, 403);
  pass('Every account has a personal space; even Admin cannot open another personal space');
  assert.equal((await json(personalSupport, 'GET', '/workspace')).projects.length, 0);
  await json(personalSupport, 'GET', `/tasks/${task.id}`, undefined, 404);
  await json(personalSupport, 'GET', `/attachments/${attachment.id}`, undefined, 404);
  assert.equal(
    (await personalSupport.get(`/api/attachments/${attachment.id}?space=${shared.id}`)).status(),
    200,
  );
  pass(
    'Task details and evidence obey space scope; authenticated download links carry their space',
  );
  const noteInput = {
    title: 'Private reference',
    markdown: '# Personal\nOnly its owner.',
    folderId: null,
    projectId: null,
    color: 'purple',
    font: 'sans',
    pinned: false,
    archived: false,
  };
  const privateNote = await json(personalSupport, 'POST', '/notes', noteInput);
  await json(admin, 'GET', `/notes/${privateNote.id}`, undefined, 404);
  await json(personalAdmin, 'GET', `/notes/${privateNote.id}`, undefined, 404);
  assert.ok(
    !(await json(admin, 'GET', '/notes/export')).notes.some((n) => n.id === privateNote.id),
  );
  pass('Private notes never appear in shared lists, direct reads or exports');
  const root = await json(support, 'POST', '/note-folders', {
    name: 'Infraestructura',
    parentId: null,
  });
  const nested = await json(support, 'POST', '/note-folders', { name: 'VPN', parentId: root.id });
  await json(
    support,
    'PUT',
    `/note-folders/${root.id}`,
    { name: root.name, parentId: nested.id },
    400,
  );
  await json(personalSupport, 'POST', '/note-folders', { name: 'Invalid', parentId: root.id }, 400);
  await json(personalSupport, 'POST', '/notes', { ...noteInput, folderId: nested.id }, 400);
  await json(personalSupport, 'POST', '/notes', { ...noteInput, projectId: pms.id }, 400);
  await json(support, 'DELETE', `/note-folders/${root.id}`, undefined, 400);
  pass('Nested folders reject cycles, cross-space parents and deletion of nonempty folders');
  let note = await json(support, 'POST', '/notes', {
    ...noteInput,
    title: 'Guía de conectividad VPN',
    markdown:
      '# Conectividad\n\n| Campo | Valor |\n| --- | --- |\n| Entorno | QA |\n\n> Validar con el equipo.\n\n```bash\necho connected\n```',
    folderId: nested.id,
    projectId: pms.id,
    pinned: true,
  });
  const stale = note;
  note = await json(admin, 'PUT', `/notes/${note.id}`, {
    ...note,
    markdown: note.markdown + '\n\n- [ ] Verificar conexión',
  });
  await json(support, 'PUT', `/notes/${note.id}`, stale, 409);
  assert.equal((await json(support, 'GET', `/notes/${note.id}`)).markdown, note.markdown);
  pass('Shared notes persist across users and reject stale overwrites');
  const converted = await json(support, 'POST', `/notes/${note.id}/task`, {
    projectId: pms.id,
    version: note.version,
  });
  assert.equal(
    (
      await json(support, 'POST', `/notes/${note.id}/task`, {
        projectId: pms.id,
        version: note.version,
      })
    ).id,
    converted.id,
  );
  assert.equal((await json(admin, 'GET', `/tasks/${converted.id}`)).item.title, note.title);
  pass('A note becomes a linked task once, preserving its source');
  const ownProject = await json(support, 'POST', '/projects', {
    name: 'Support sandbox',
    color: 'green',
  });
  await json(support, 'PUT', `/projects/${ownProject.id}`, { ...ownProject, archived: true });
  await json(
    support,
    'POST',
    '/users',
    { name: 'No', email: 'no@example.com', password, role: 'Admin' },
    403,
  );
  await json(support, 'GET', '/users', undefined, 403);
  await json(support, 'GET', '/roles', undefined, 403);
  pass('User can organize shared content but cannot administer accounts or roles');
  await json(admin, 'POST', '/roles', { name: 'Analyst' }, 204);
  const analyst = await json(admin, 'POST', '/users', {
    name: 'QA Analyst',
    email: 'analyst@example.com',
    password,
    role: 'Analyst',
  });
  const outsider = await request.newContext({ baseURL, extraHTTPHeaders: { 'X-AegiTasks': '1' } });
  await json(outsider, 'POST', '/auth/login', { email: analyst.email, password });
  assert.deepEqual((await json(outsider, 'GET', '/spaces')).permissions.sort(), [
    'focus',
    'notes',
    'projects',
    'settings',
    'spaces',
    'tasks',
  ]);
  const sharedOutsider = await asSpace(outsider, shared.id);
  await json(sharedOutsider, 'GET', '/notes', undefined, 403);
  await json(outsider, 'GET', `/spaces/${shared.id}/members`, undefined, 404);
  await json(outsider, 'POST', `/spaces/${shared.id}/invite`, undefined, 404);
  pass('Custom roles default to operational pages; unjoined users cannot read a workspace');
  const allPages = ['tasks', 'projects', 'notes', 'focus', 'spaces', 'settings'];
  await json(
    admin,
    'PUT',
    '/roles/Analyst/permissions',
    {
      pages: allPages.filter((p) => p !== 'notes'),
    },
    204,
  );
  for (const endpoint of ['/notes', '/notes/export', '/note-folders'])
    await json(outsider, 'GET', endpoint, undefined, 403);
  await json(admin, 'PUT', '/roles/Analyst/permissions', { pages: [...allPages, 'users'] }, 400);
  assert.ok(!(await json(outsider, 'GET', '/spaces')).permissions.includes('notes'));
  await json(admin, 'DELETE', '/roles/Analyst', undefined, 400);
  pass(
    'Page revocation applies to existing sessions and exports; account administration cannot be granted',
  );
  const first = await json(admin, 'POST', `/spaces/${shared.id}/invite`);
  const rotated = await json(admin, 'POST', `/spaces/${shared.id}/invite`);
  await json(outsider, 'POST', '/spaces/join', { code: first.code }, 400);
  await json(outsider, 'POST', '/spaces/join', { code: rotated.code });
  await json(admin, 'DELETE', `/spaces/${shared.id}/invite`, undefined, 204);
  await json(outsider, 'POST', '/spaces/join', { code: rotated.code }, 400);
  await json(admin, 'DELETE', `/spaces/${shared.id}/members/${analyst.id}`, undefined, 204);
  await json(sharedOutsider, 'GET', '/tasks', undefined, 403);
  pass(
    'Invitations rotate and revoke; removing membership blocks the existing session immediately',
  );
  const profile = {
    focusMinutes: 1,
    shortBreakMinutes: 1,
    longBreakMinutes: 2,
    cycles: 1,
    theme: 'aurora',
    animated: true,
    sound: false,
  };
  await json(admin, 'PUT', '/focus/profile', { ...profile, focusMinutes: 0 }, 400);
  await json(admin, 'PUT', '/focus/profile', profile);
  await json(
    personalAdmin,
    'POST',
    '/focus/start',
    { goal: 'Wrong space task', taskIds: [task.id] },
    400,
  );
  let session = await json(admin, 'POST', '/focus/start', {
    goal: 'Verify persistence\nReview results',
    taskIds: [task.id],
  });
  await json(admin, 'POST', '/focus/start', { goal: 'Duplicate' }, 409);
  await json(
    support,
    'POST',
    `/focus/${session.id}/action`,
    { action: 'pause', version: session.version },
    404,
  );
  assert.equal((await json(support, 'GET', '/focus')).session, null);
  await json(
    admin,
    'POST',
    `/focus/${session.id}/action`,
    { action: 'next', version: session.version },
    400,
  );
  const running = session;
  session = await json(admin, 'POST', `/focus/${session.id}/action`, {
    action: 'pause',
    version: session.version,
  });
  await json(
    admin,
    'POST',
    `/focus/${session.id}/action`,
    { action: 'resume', version: running.version },
    409,
  );
  assert.equal((await json(personalAdmin, 'GET', '/focus')).session.state, 'paused');
  session = await json(admin, 'POST', `/focus/${session.id}/action`, {
    action: 'goals',
    version: session.version,
    goal: '[x] Verify persistence\nReview results',
  });
  const finished = await json(admin, 'POST', `/focus/${session.id}/action`, {
    action: 'finish',
    version: session.version,
  });
  assert.equal(finished.completedCycles, 0);
  pass(
    'Personal focus validates durations, task scope, one active timer, concurrency, pause and private goals',
  );
  // This one-minute real server interval completes while browser tests exercise the UI.
  await json(support, 'PUT', '/focus/profile', profile);
  const clockSession = await json(support, 'POST', '/focus/start', {
    goal: 'Server wall-clock proof',
  });
  return { privateNote, mine, nested, note, outsider, clockSession };
}

export async function testExpansionUi({
  page,
  context,
  artifacts,
  pass,
  pms,
  admin,
  personalAdmin,
  json,
  spaceTests,
  shared,
}) {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('http://localhost:4174/#spaces');
  await page.getByLabel('Nombre del workspace').fill('Documentación QA');
  await page.getByRole('button', { name: 'Crear workspace', exact: true }).click();
  await page.getByRole('heading', { name: 'Documentación QA', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(artifacts, 'spaces-mobile.png'), fullPage: true });
  pass('Workspace creation and membership controls work on a phone layout');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('http://localhost:4174/#admin');
  await page.getByLabel('Nuevo rol').fill('Editor QA');
  await page.getByRole('button', { name: 'Crear rol', exact: true }).click();
  const roleCard = page
    .locator('.role-card')
    .filter({ has: page.getByRole('heading', { name: 'Editor QA', exact: true }) });
  await roleCard.waitFor();
  assert.equal(await roleCard.locator('input:checked').count(), 6);
  await roleCard.getByLabel('Notas', { exact: true }).click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.role-card')]
        .find((el) => el.textContent.includes('Editor QA'))
        ?.querySelectorAll('input:checked').length === 5,
  );
  await page.screenshot({ path: path.join(artifacts, 'roles-desktop.png'), fullPage: true });
  pass('Admin can create a role and change page access through the actual UI');
  await page.goto('http://localhost:4174/#notes');
  await page.getByRole('button', { name: 'Crear carpeta de notas', exact: true }).click();
  await page.getByLabel('Nombre de carpeta').fill('Procedimientos');
  await page.getByLabel('Carpeta superior').selectOption(spaceTests.nested.id);
  await page.getByRole('button', { name: 'Guardar carpeta', exact: true }).click();
  await page.getByRole('button', { name: 'Editar carpeta Procedimientos', exact: true }).waitFor();
  await page.getByLabel('Importar Markdown', { exact: true }).setInputFiles({
    name: 'Manual.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Manual importado\n\n> Una referencia portátil.'),
  });
  await page.getByLabel('Título de nota', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Título de nota').inputValue(), 'Manual');
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await page.getByRole('heading', { name: 'Editar nota', exact: true }).waitFor();
  await page.getByLabel('Contenido Markdown').waitFor();
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await page.pdf({ path: path.join(artifacts, 'note-print.pdf'), format: 'A4' });
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  pass('Nested folder creation, Markdown import and PDF print rendering work through the UI');
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
  await page.getByLabel('Título de nota', { exact: true }).fill('Guía de despliegue');
  await page.getByLabel('Proyecto relacionado').selectOption(pms.id);
  await page.getByLabel('Carpeta de nota', { exact: true }).selectOption(spaceTests.nested.id);
  const markdown =
    '# Checklist de despliegue\n\n| Paso | Estado |\n| --- | --- |\n| Backup | Pendiente |\n\n> Revisar el entorno antes de comenzar.\n\n```javascript\nconst ready = true;\n```\n\n<span class="ink-purple">AegiPulse</span>\n\n- [ ] Validar servicio\n\n<script>window.noteInjected=true</script><img src="https://example.invalid/track" onerror="window.noteInjected=true"><a href="javascript:alert(1)">unsafe</a>';
  await page.getByLabel('Contenido Markdown').fill(markdown);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.evaluate(() => (location.hash = '#focus'));
  await page.waitForFunction(() => location.hash === '#notes');
  assert.equal(await page.getByLabel('Contenido Markdown').inputValue(), markdown);
  pass('Cancelling navigation preserves an unsaved Markdown draft');
  const preview = page.locator('.markdown-preview');
  await preview.locator('table').waitFor();
  assert.equal(await preview.locator('script,img,[onerror],a[href^="javascript:"]').count(), 0);
  assert.equal(await page.evaluate(() => window.noteInjected), undefined);
  assert.equal(await preview.locator('.ink-purple').textContent(), 'AegiPulse');
  assert.ok(await preview.locator('code.hljs').count());
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await page.getByRole('heading', { name: 'Editar nota', exact: true }).waitFor();
  await page.getByLabel('Contenido Markdown').waitFor();
  assert.equal(await page.getByLabel('Contenido Markdown').inputValue(), markdown);
  pass('Markdown UI saves tables, quotes, code and colors while removing active HTML');
  await page.screenshot({ path: path.join(artifacts, 'notes-editor-light.png'), fullPage: true });
  for (const format of ['Markdown', 'HTML']) {
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: format, exact: true }).click();
    const file = await downloaded;
    const body = await readFile(await file.path(), 'utf8');
    if (format === 'Markdown') assert.ok(body.includes(markdown));
    else {
      assert.ok(body.includes('<table>'));
      assert.ok(!body.includes('<script>'));
      assert.ok(!body.includes('javascript:alert'));
    }
  }
  pass('Markdown and sanitized HTML exports contain actual edited content');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await page.locator('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await page.screenshot({ path: path.join(artifacts, 'notes-mobile-preview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Cambiar a modo oscuro' }).click();
  await page.locator('.toast').waitFor({ state: 'hidden' });
  await page.screenshot({ path: path.join(artifacts, 'notes-mobile-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.screenshot({ path: path.join(artifacts, 'notes-desktop-dark.png'), fullPage: true });
  const zipDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar espacio' }).click();
  const zip = unzipSync(await readFile(await (await zipDownload).path()));
  assert.ok(Object.keys(zip).some((k) => k.startsWith('Infraestructura/VPN/Guía de despliegue')));
  assert.ok(!strFromU8(zip['aegitasks-index.json']).includes(spaceTests.privateNote.id));
  pass('Notes fit mobile and desktop; ZIP preserves nested folders and space privacy');
  await page
    .getByLabel('Espacio activo')
    .first()
    .selectOption(
      (await json(personalAdmin, 'GET', '/spaces')).spaces.find((s) => s.isPersonal).id,
    );
  await page.goto('http://localhost:4174/#notes');
  await page.getByRole('heading', { name: 'Un lugar para tus ideas' }).waitFor();
  assert.equal(await page.locator('.note-card').count(), 0);
  await page.getByLabel('Espacio activo').first().selectOption(shared.id);
  await page.goto('http://localhost:4174/#focus');
  await page
    .getByLabel('Objetivos de la sesión')
    .fill('Revisar el despliegue\nActualizar documentación');
  await page.getByLabel('Enfoque (min)').fill('1');
  await page.getByRole('button', { name: 'Comenzar enfoque', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).waitFor();
  const paused = await page.getByRole('timer').getAttribute('aria-label');
  await page.reload();
  await page.getByRole('button', { name: 'Continuar', exact: true }).waitFor();
  assert.equal(await page.getByRole('timer').getAttribute('aria-label'), paused);
  await page.locator('.focus-goals').getByLabel('Revisar el despliegue').click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('.focus-goals input').disabled);
  assert.ok((await json(admin, 'GET', '/focus')).session.goal.startsWith('[x]'));
  pass('Space switch clears content; Focus pause and checked goals survive reload');
  for (const theme of ['aurora', 'waves', 'terminal']) {
    await page.getByLabel('Ambiente visual').selectOption(theme);
    const stage = page.locator('.focus-stage');
    assert.equal(await stage.evaluate((el) => getComputedStyle(el).position), 'relative');
    assert.equal(await stage.evaluate((el) => getComputedStyle(el).opacity), '1');
    await stage.screenshot({ path: path.join(artifacts, `focus-${theme}.png`) });
  }
  await page.getByRole('button', { name: 'Guardar preferencias', exact: true }).click();
  await page.getByText('Preferencias de enfoque guardadas.').waitFor();
  await page.getByRole('button', { name: 'Pantalla completa', exact: true }).click();
  await page.locator('.focus-stage.is-immersive').waitFor();
  await page.screenshot({ path: path.join(artifacts, 'focus-immersive.png') });
  await page.getByRole('button', { name: 'Salir de pantalla completa', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(artifacts, 'focus-mobile.png'), fullPage: true });
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Focus overflow ${width}`,
    );
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page.locator('.orb-one').evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  pass('Three Focus themes, immersive mode, reduced motion and responsive layouts work');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
  await page.getByRole('button', { name: 'Comenzar enfoque', exact: true }).waitFor();
  const limited = await context.browser().newContext({
    baseURL: 'http://localhost:4174',
    storageState: await spaceTests.outsider.storageState(),
  });
  const restricted = await limited.newPage();
  await restricted.goto('http://localhost:4174/#notes');
  await restricted.getByRole('heading', { name: 'Página sin acceso' }).waitFor();
  assert.equal(
    await restricted
      .locator('.sidebar')
      .getByRole('button', { name: 'Notas', exact: true })
      .count(),
    0,
  );
  await restricted.goto('http://localhost:4174/#admin');
  await restricted.getByRole('heading', { name: 'Página sin acceso' }).waitFor();
  await limited.close();
  pass('Denied Notes and administration pages cannot be opened through direct UI routes');
}
