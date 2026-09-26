import { chromium, request } from 'playwright';
import { testSpaces, testExpansionUi } from './expansion-tests.mjs';
import { testWorkflow } from './workflow-tests.mjs';
import { testAssignments } from './assignment-tests.mjs';
import { testFocusVisuals } from './focus-visual-tests.mjs';
import { testFocusLayout } from './focus-layout-tests.mjs';
import { testNoteEditor } from './note-editor-tests.mjs';
import { testTaskDetailTabs } from './task-detail-tests.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const data = await mkdtemp(path.join(tmpdir(), 'aegitasks-test-'));
const artifacts = path.join(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
const apiBase = 'http://localhost:5213';
const password = 'Test-only-AegiTasks-2026!';
let checks = 0;
const results = [];
const pass = (label) => {
  checks++;
  results.push(label);
  console.log(`PASS ${label}`);
};
const children = [];
let browser;
let failurePage;
let apiLog = '';
const run = (command, args, options) => {
  const child = spawn(command, args, {
    windowsHide: true,
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  child.stdout.on('data', (b) => {
    apiLog += b.toString();
  });
  child.stderr.on('data', (b) => {
    apiLog += b.toString();
  });
  child.on('exit', (code, signal) => {
    apiLog += `\nTEST SERVICE EXIT ${command} ${args[0]} code=${code} signal=${signal}\n`;
  });
  return child;
};
async function ready(url) {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Service did not start: ${url}\n${apiLog}`);
}
async function json(context, method, url, body, expected = 200) {
  const r = await context.fetch(`/api${url}`, { method, data: body });
  assert.equal(r.status(), expected, `${method} ${url}: ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
try {
  run(
    'dotnet',
    [
      path.join(root, 'server/AegiTasks.Api/bin/Debug/net10.0/AegiTasks.Api.dll'),
      '--urls',
      'http://localhost:5213',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        ASPNETCORE_ENVIRONMENT: 'Development',
        DatabaseProvider: process.env.AEGITASKS_TEST_POSTGRES ? 'Postgres' : 'Sqlite',
        ConnectionStrings__Default:
          process.env.AEGITASKS_TEST_POSTGRES || `Data Source=${path.join(data, 'test.db')}`,
        StoragePath: path.join(data, 'uploads'),
        DataProtectionPath: path.join(data, 'keys'),
        SEED_ADMIN_EMAIL: 'admin@example.com',
        SEED_ADMIN_PASSWORD: password,
      },
    },
  );
  run(
    process.execPath,
    [path.join(root, 'client/node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1'],
    { cwd: path.join(root, 'client'), env: process.env },
  );
  await ready('http://localhost:5213/api/health');
  await ready('http://localhost:4174');
  const anon = await request.newContext({ baseURL: apiBase });
  assert.equal((await anon.get('/api/workspace')).status(), 401);
  pass('Unauthenticated requests rejected');
  assert.equal(
    (
      await anon.post('/api/auth/login', { data: { email: 'admin@example.com', password } })
    ).status(),
    400,
  );
  pass('Cross-origin simple mutation rejected');
  let admin = await request.newContext({
    baseURL: apiBase,
    extraHTTPHeaders: { 'X-AegiTasks': '1' },
  });
  const adminUser = await json(admin, 'POST', '/auth/login', {
    email: 'admin@example.com',
    password,
  });
  pass('Seed administrator can sign in');
  const personalAdmin = admin;
  const shared = await json(admin, 'POST', '/spaces', { name: 'Equipo AegiTasks' });
  const invitation = await json(admin, 'POST', `/spaces/${shared.id}/invite`);
  admin = await request.newContext({
    baseURL: apiBase,
    storageState: await personalAdmin.storageState(),
    extraHTTPHeaders: { 'X-AegiTasks': '1', 'X-Space-Id': shared.id },
  });

  await json(
    admin,
    'PUT',
    `/users/${adminUser.id}`,
    { name: adminUser.name, role: 'User', active: true },
    400,
  );
  pass('Administrator cannot remove own admin role');
  const member = await json(admin, 'POST', '/users', {
    name: 'María López',
    email: 'support@example.com',
    role: 'User',
    password,
  });
  const support = await request.newContext({
    baseURL: apiBase,
    extraHTTPHeaders: { 'X-AegiTasks': '1', 'X-Space-Id': shared.id },
  });
  await json(support, 'POST', '/auth/login', { email: member.email, password });
  await json(support, 'POST', '/spaces/join', { code: invitation.code });
  await json(support, 'POST', '/roles', { name: 'Forbidden' }, 403);
  pass('Users cannot administer roles');
  const pms = await json(admin, 'POST', '/projects', {
    name: 'PMS · Hotel',
    description: 'Reservas, huéspedes y una mejor experiencia de estancia.',
    color: 'purple',
  });
  const pos = await json(admin, 'POST', '/projects', {
    name: 'POS · Ventas',
    description: 'Cada venta cuenta. Cuidemos la experiencia en caja.',
    color: 'pink',
  });
  const crm = await json(admin, 'POST', '/projects', {
    name: 'CRM · Clientes',
    description: 'Relaciones más cercanas, seguimiento más simple.',
    color: 'blue',
  });
  pass('Independent projects created with default workflow');
  const folder = await json(admin, 'POST', '/folders', {
    name: 'Reservaciones',
    projectId: pms.id,
  });
  await json(admin, 'POST', '/folders', { name: 'Recepción', projectId: pms.id });
  const status = await json(admin, 'POST', '/statuses', {
    name: 'En revisión',
    projectId: pms.id,
    color: 'orange',
    position: 2,
    isDone: false,
  });
  const customTag = await json(admin, 'POST', '/tags', { name: 'SOPORTE', color: 'purple' });
  let w = await json(admin, 'GET', '/workspace');
  const statusFor = (p, done = false) =>
    w.statuses.find((s) => s.projectId === p.id && s.isDone === done).id;
  const input = (title, p = pms, extra = {}) => ({
    title,
    description:
      'Reporte registrado durante una sesión de soporte. Revisar el comportamiento y validar la solución con el equipo.',
    projectId: p.id,
    statusId: statusFor(p),
    folderId: null,
    assigneeId: null,
    priority: null,
    dueDate: null,
    estimateMinutes: null,
    tagIds: [],
    ...extra,
  });
  let task = await json(
    support,
    'POST',
    '/tasks',
    input('No se guarda el cambio de habitación', pms, {
      folderId: folder.id,
      priority: 4,
      tagIds: [w.tags.find((t) => t.name === 'BUG').id],
      assigneeId: adminUser.id,
      dueDate: '2026-09-22',
      estimateMinutes: 90,
    }),
  );
  pass('Support member can report a bug with optional planning');
  const minimal = await json(
    support,
    'POST',
    '/tasks',
    input('Agregar filtro por fecha de llegada'),
  );
  assert.equal(minimal.priority, null);
  assert.equal(minimal.dueDate, null);
  assert.equal(minimal.estimateMinutes, null);
  pass('Date, estimate, priority and assignee are truly optional');
  await json(support, 'POST', '/tasks', input('Invalid status', pos, { statusId: status.id }), 400);
  await json(support, 'POST', '/tasks', input('Invalid folder', pos, { folderId: folder.id }), 400);
  pass('Cross-project folders and statuses rejected');
  await json(support, 'POST', '/tasks', input('Invalid priority', pms, { priority: 5 }), 400);
  await json(
    support,
    'POST',
    '/tasks',
    input('Invalid estimate', pms, { estimateMinutes: -1 }),
    400,
  );
  pass('Planning values validated');
  await json(admin, 'DELETE', `/folders/${folder.id}`, undefined, 400);
  pass('In-use folders cannot be deleted');
  task = await json(admin, 'PUT', `/tasks/${task.id}`, {
    ...input(task.title),
    ...task,
    tagIds: task.tags.map((t) => t.id),
    statusId: status.id,
  });
  await json(
    admin,
    'PUT',
    `/tasks/${task.id}`,
    { ...input(task.title), version: '00000000-0000-0000-0000-000000000000' },
    409,
  );
  pass('Stale edits cannot overwrite another team member');
  await json(
    support,
    'POST',
    `/tasks/${task.id}/comments`,
    { body: 'Se reproduce al cambiar una reserva que ya tiene anticipo. Adjunto evidencia.' },
    204,
  );
  const png = await readFile(path.join(root, 'client/public/aegitasks-icon-192.png'));
  let response = await support.post(`/api/tasks/${task.id}/attachments`, {
    multipart: { file: { name: 'captura.png', mimeType: 'image/png', buffer: png } },
  });
  assert.equal(response.status(), 200, await response.text());
  const attachment = await response.json();
  assert.equal((await anon.get(`/api/attachments/${attachment.id}`)).status(), 401);
  assert.equal((await support.get(`/api/attachments/${attachment.id}`)).status(), 200);
  pass('Evidence persisted and download requires authentication');
  response = await support.post(`/api/tasks/${task.id}/attachments`, {
    multipart: {
      file: {
        name: 'fake.png',
        mimeType: 'image/png',
        buffer: Buffer.from('<script>not an image</script>'),
      },
    },
  });
  assert.equal(response.status(), 400);
  pass('Disguised non-image attachment rejected');
  const detail = await json(admin, 'GET', `/tasks/${task.id}`);
  assert.ok(detail.activities.some((a) => a.kind === 'comment'));
  assert.ok(detail.activities.some((a) => a.body.includes('En revisión')));
  pass('Comments and status audit persisted');
  task = await json(admin, 'POST', `/tasks/${task.id}/archive`, {
    archived: true,
    version: task.version,
  });
  assert.ok(
    (await json(admin, 'GET', '/tasks?scope=archived')).items.some((t) => t.id === task.id),
  );
  task = await json(admin, 'POST', `/tasks/${task.id}/archive`, {
    archived: false,
    version: task.version,
  });
  pass('Admin archive and restore preserve history');
  await json(
    admin,
    'POST',
    '/tasks',
    input('El ticket de venta muestra el total incorrecto', pos, {
      priority: 3,
      tagIds: [w.tags.find((t) => t.name === 'BUG').id],
      estimateMinutes: 60,
      assigneeId: adminUser.id,
    }),
  );
  await json(
    admin,
    'POST',
    '/tasks',
    input('Exportar la lista de clientes a Excel', crm, {
      priority: 2,
      tagIds: [w.tags.find((t) => t.name === 'ADD').id],
      assigneeId: member.id,
    }),
  );
  await json(
    admin,
    'POST',
    '/tasks',
    input('Mejorar el mensaje al cancelar una reserva', pms, {
      priority: 1,
      tagIds: [customTag.id],
      folderId: folder.id,
    }),
  );
  await json(
    admin,
    'POST',
    '/tasks',
    input('Corregir el formato de fecha en el recibo', pos, {
      statusId: statusFor(pos, true),
      tagIds: [w.tags.find((t) => t.name === 'FIX').id],
    }),
  );
  const filtered = await json(
    admin,
    'GET',
    `/tasks?project=${pms.id}&folder=${folder.id}&q=habitación`,
  );
  assert.equal(filtered.total, 1);
  assert.equal((await json(admin, 'GET', '/tasks?scope=done')).total, 1);
  assert.equal((await json(admin, 'GET', '/tasks/summary')).done, 1);
  pass('Search, project, folder and completed filters agree with dashboard');
  // Exercise pagination in a disposable project, then archive it so screenshots stay focused.
  const qa = await json(admin, 'POST', '/projects', { name: 'Pagination QA', color: 'blue' });
  w = await json(admin, 'GET', '/workspace');
  for (let i = 0; i < 53; i++)
    await json(admin, 'POST', '/tasks', input(`Pagination task ${i}`, qa));
  const page1 = await json(admin, 'GET', `/tasks?project=${qa.id}&page=1`);
  const page2 = await json(admin, 'GET', `/tasks?project=${qa.id}&page=2`);
  assert.equal(page1.items.length, 50);
  assert.equal(page2.items.length, 3);
  assert.equal(new Set([...page1.items, ...page2.items].map((t) => t.id)).size, 53);
  pass('Pagination has stable, non-overlapping pages');
  await json(admin, 'PUT', `/projects/${qa.id}`, { ...qa, archived: true });
  const spaceTests = await testSpaces({
    request,
    admin,
    personalAdmin,
    support,
    shared,
    member,
    adminUser,
    password,
    json,
    pass,
    pms,
    task,
    attachment,
  });
  const storedSession = await admin.storageState();
  storedSession.origins.push({
    origin: 'http://localhost:4174',
    localStorage: [{ name: `aegitasks-space-${adminUser.id}`, value: shared.id }],
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: 'http://localhost:4174',
    viewport: { width: 1440, height: 1080 },
    timezoneId: 'America/Mexico_City',
    storageState: storedSession,
    colorScheme: 'light',
  });
  const page = await context.newPage();
  failurePage = page;
  page.on('requestfailed', (r) => {
    apiLog += `\nBROWSER REQUEST FAILED ${r.method()} ${r.url()} ${r.failure()?.errorText}\n`;
  });
  const browserErrors = [];
  page.on('pageerror', (e) => browserErrors.push(e.message));
  await page.goto('http://localhost:4174');
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
  await page
    .getByRole('button', { name: 'Abrir pendiente: No se guarda el cambio de habitación' })
    .waitFor();
  await page.screenshot({ path: path.join(artifacts, 'desktop-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cambiar a modo oscuro' }).click();
  await page.screenshot({ path: path.join(artifacts, 'desktop-dark.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.reload();
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  pass('Desktop light/dark themes and persistence');
  await page.getByRole('button', { name: 'Nuevo pendiente', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Reporte de prueba desde navegador');
  await page
    .getByLabel('Descripción (opcional)')
    .fill('Se conserva como borrador al cerrar el formulario.');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo pendiente', exact: true }).click();
  assert.equal(
    await page.getByLabel('Título', { exact: true }).inputValue(),
    'Reporte de prueba desde navegador',
  );
  pass('New report draft survives closing and reopening');
  await page.getByRole('button', { name: 'Crear pendiente', exact: true }).click();
  await page.getByRole('heading', { name: 'Detalle del pendiente' }).waitFor();
  await page.getByText('Todos los cambios están guardados.').waitFor();
  assert.equal(
    await page
      .getByRole('tab', { name: 'Detalle general', exact: true })
      .getAttribute('aria-selected'),
    'true',
  );
  await page.getByRole('tab', { name: 'Conversación y actividad', exact: true }).click();
  await page.getByLabel('Agregar comentario').fill('Comentario desde la interfaz.');
  await page.getByRole('button', { name: 'Comentar', exact: true }).click();
  await page.getByText('Comentario desde la interfaz.', { exact: true }).waitFor();
  pass('Create and comment through actual UI');
  await testTaskDetailTabs({ page, png, artifacts, pass });
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.goto(`http://localhost:4174/#project/${pms.id}`);
  await page.getByRole('button', { name: 'Vista de tablero' }).click();
  await page.locator('.board-heading').getByText('En revisión', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(artifacts, 'board-dark.png'), fullPage: true });
  pass('Project board renders custom statuses');
  await page.goto('http://localhost:4174/#inbox');
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.toast').waitFor({ state: 'hidden' });
  await page.screenshot({ path: path.join(artifacts, 'mobile-dark.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  pass('Phone layout has no horizontal overflow');
  await page.getByRole('button', { name: 'Cambiar a modo claro' }).click();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({ path: path.join(artifacts, 'mobile-light.png'), fullPage: true });
  await page
    .getByRole('button', { name: 'Abrir pendiente: Agregar filtro por fecha de llegada' })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifacts, 'mobile-list-light.png') });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Nuevo pendiente', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Borrador sin conexión');
  await context.setOffline(true);
  await page.getByLabel('Descripción (opcional)').fill('La app conserva este texto.');
  await page.getByRole('button', { name: 'Crear pendiente', exact: true }).click();
  await page
    .getByRole('dialog', { name: '¿Qué encontraste?' })
    .getByRole('alert')
    .filter({ hasText: 'No hay conexión' })
    .waitFor();
  assert.equal(
    await page.getByLabel('Título', { exact: true }).inputValue(),
    'Borrador sin conexión',
  );
  await page.screenshot({ path: path.join(artifacts, 'mobile-offline.png'), fullPage: true });
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Crear pendiente', exact: true }).click();
  await page.getByRole('heading', { name: 'Detalle del pendiente' }).waitFor();
  pass('Offline submission keeps draft and succeeds after reconnect');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `Overflow at ${width}px`,
    );
  }
  pass('320, 768 and 1024px layouts fit viewport');
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('navigation', { name: 'Navegación móvil' })
    .getByRole('button', { name: 'Más', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Más opciones' })
    .getByRole('button', { name: 'Usuarios y roles' })
    .click();
  await page.getByRole('heading', { name: 'Usuarios y roles', exact: true }).waitFor();
  await page.getByText('María López', { exact: true }).waitFor();
  pass('Mobile settings and team navigation');
  assert.equal((await page.request.get('/manifest.webmanifest')).status(), 200);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.equal((await page.request.get(icon.src)).status(), 200);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  pass('Installable manifest, actual PNG icons and registered service worker');
  await testExpansionUi({
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
  });
  await testWorkflow({
    page,
    context,
    admin,
    personalAdmin,
    support,
    shared,
    adminUser,
    request,
    json,
    pass,
    artifacts,
    password,
  });
  await testAssignments({
    page,
    context,
    admin,
    support,
    shared,
    adminUser,
    json,
    pass,
    artifacts,
  });
  await testFocusVisuals({ page, context, admin, support, json, pass, artifacts });
  await testFocusLayout({ page, admin, json, pass, artifacts });
  await testNoteEditor({ page, context, admin, json, pass, artifacts });
  const waitMs = new Date(spaceTests.clockSession.endsAt).getTime() - Date.now() + 100;
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 60000)));
  let clockSession = await json(support, 'POST', `/focus/${spaceTests.clockSession.id}/action`, {
    action: 'next',
    version: spaceTests.clockSession.version,
  });
  assert.equal(clockSession.completedCycles, 1);
  assert.equal(clockSession.phase, 'longBreak');
  assert.equal(clockSession.remainingSeconds, 120);
  clockSession = await json(support, 'POST', `/focus/${clockSession.id}/action`, {
    action: 'finish',
    version: clockSession.version,
  });
  assert.equal(clockSession.completedCycles, 1);
  pass(
    'Real elapsed server interval advances to configured long break and counts one completed focus cycle',
  );
  // Verify the installed shell can reopen offline; server data is intentionally not cached.
  await context.setOffline(true);
  await page.reload();
  await page.getByText('Qué bueno tenerte aquí').waitFor();
  await page.getByRole('alert').waitFor();
  await context.setOffline(false);
  pass('Offline reload loads shell and explains server connectivity');
  assert.deepEqual(browserErrors, []);
  pass('No uncaught browser errors');
  await json(admin, 'PUT', `/users/${member.id}`, {
    name: member.name,
    role: 'User',
    active: false,
  });
  assert.equal((await support.get('/api/workspace')).status(), 401);
  pass('Disabling a member revokes an existing session');
  await json(
    admin,
    'POST',
    '/auth/password',
    { currentPassword: password, newPassword: 'New-test-only-password-2026!' },
    204,
  );
  assert.equal((await admin.get('/api/workspace')).status(), 401);
  pass('Password change invalidates session');
  await writeFile(
    path.join(artifacts, 'test-results.json'),
    JSON.stringify(
      {
        checks,
        results,
        testedAt: new Date().toISOString(),
        database: process.env.AEGITASKS_TEST_POSTGRES
          ? 'PostgreSQL (real persistence)'
          : 'SQLite (real persistence)',
        productionDockerTested: false,
      },
      null,
      2,
    ),
  );
  console.log(`\n${checks} checks passed. Screenshots: ${artifacts}`);
} catch (e) {
  await writeFile(path.join(artifacts, 'test-server.log'), apiLog);
  if (failurePage && !failurePage.isClosed())
    await failurePage.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {});
  throw e;
} finally {
  if (browser) await browser.close();
  for (const child of children) child.kill();
  // The isolated temp database is retained for diagnosing failures, never the developer database.
}
