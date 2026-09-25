import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

async function until(check, label) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out: ${label}`);
}

async function stream(context, space) {
  const controller = new AbortController();
  const cookies = (await context.storageState()).cookies
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const response = await fetch(`http://localhost:5213/api/events?space=${space}`, {
    headers: { Cookie: cookies },
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  const messages = [];
  const reading = (async () => {
    let buffer = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) return;
        buffer += decoder.decode(result.value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (event.includes('event:')) messages.push(event);
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) throw e;
    }
  })();
  await until(() => messages.some((m) => m.includes('event: ready')), 'SSE ready');
  return {
    messages,
    close: async () => {
      controller.abort();
      await reading;
    },
  };
}

export async function testWorkflow({
  page,
  context,
  admin,
  personalAdmin,
  support,
  shared,
  request,
  json,
  pass,
  artifacts,
  password,
}) {
  const personal = (await json(personalAdmin, 'GET', '/spaces')).spaces.find((s) => s.isPersonal);
  assert.equal((await support.get(`/api/events?space=${personal.id}`)).status(), 403);
  const sharedStream = await stream(support, shared.id);
  const privateStream = await stream(personalAdmin, personal.id);
  const project = await json(admin, 'POST', '/projects', {
    name: 'Continuous product',
    color: 'purple',
    labels: 'PMS, CRM, PMS',
  });
  assert.equal(project.labels, 'PMS, CRM');
  const labels = Array.from({ length: 10 }, (_, i) => `${i}`.padEnd(30, 'x')).join(', ');
  const boundary = await json(admin, 'POST', '/projects', {
    name: 'Label boundaries',
    color: 'purple',
    labels,
  });
  assert.equal(boundary.labels, labels);
  await json(admin, 'DELETE', `/projects/${boundary.id}`, undefined, 204);
  await until(() => sharedStream.messages.some((m) => m.includes('catalog')), 'member notified');
  assert(!privateStream.messages.some((m) => m.includes('event: change')));
  let w = await json(admin, 'GET', '/workspace');
  const statuses = w.statuses.filter((s) => s.projectId === project.id);
  assert.deepEqual(
    statuses.map((s) => s.name),
    ['Pendiente', 'Por iniciar', 'En progreso', 'Resuelto', 'Resuelto y revisado'],
  );
  const done = statuses.find((s) => s.name === 'Resuelto');
  const reviewed = statuses.find((s) => s.name === 'Resuelto y revisado');
  const input = (title) => ({ title, projectId: project.id, statusId: statuses[0].id, tagIds: [] });
  let task = await json(admin, 'POST', '/tasks', input('Focus workflow regression'));
  await json(
    personalAdmin,
    'PUT',
    `/tasks/${task.id}/status`,
    { statusId: done.id, version: task.version },
    404,
  );
  await json(personalAdmin, 'DELETE', `/tasks/${task.id}?version=${task.version}`, undefined, 404);
  await json(personalAdmin, 'DELETE', `/projects/${project.id}`, undefined, 404);
  const foreign = w.statuses.find((s) => s.projectId !== project.id);
  await json(
    admin,
    'PUT',
    `/tasks/${task.id}/status`,
    { statusId: foreign.id, version: task.version },
    400,
  );
  const oldVersion = task.version;
  task = await json(admin, 'PUT', `/tasks/${task.id}/status`, {
    statusId: statuses[1].id,
    version: task.version,
  });
  await json(
    admin,
    'PUT',
    `/tasks/${task.id}/status`,
    { statusId: done.id, version: oldVersion },
    409,
  );
  await json(admin, 'DELETE', `/tasks/${task.id}?version=${oldVersion}`, undefined, 409);
  pass(
    'Project labels persist independently of task workflows; status changes and deletion enforce space and version boundaries',
  );

  const observerState = await support.storageState();
  const supportUser = await json(support, 'GET', '/auth/me');
  observerState.origins.push({
    origin: 'http://localhost:4174',
    localStorage: [{ name: `aegitasks-space-${supportUser.id}`, value: shared.id }],
  });
  const observerContext = await context
    .browser()
    .newContext({ storageState: observerState, viewport: { width: 1366, height: 768 } });
  const observer = await observerContext.newPage();
  await observer.goto(`http://localhost:4174/#project/${project.id}`);
  await observer
    .getByRole('button', { name: `Abrir pendiente: ${task.title}`, exact: true })
    .waitFor();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('http://localhost:4174/#focus');
  await page.locator('.focus-choose-tasks').click();
  await page.getByLabel('Buscar pendientes para enfocar').fill(task.title);
  await page
    .locator('.focus-task-picker')
    .getByRole('button', { name: `Agregar ${task.title}`, exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirmar selección', exact: true }).click();
  await page.getByRole('button', { name: 'Comenzar enfoque', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).waitFor();
  const session = (await json(admin, 'GET', '/focus')).session;
  assert(session.endsAt.endsWith('Z'), 'persisted UTC timestamp must declare its timezone');
  assert(new Date(session.endsAt).getTime() - Date.now() <= session.focusMinutes * 60000 + 1000);
  assert.deepEqual(JSON.parse(session.taskIdsJson), [task.id]);
  await json(personalAdmin, 'GET', `/focus/${session.id}/tasks`, undefined, 404);
  await page.getByRole('button', { name: `Completar ${task.title}`, exact: true }).click();
  await until(
    async () => (await json(admin, 'GET', `/tasks/${task.id}`)).item.statusId === done.id,
    'Focus resolves persisted task',
  );
  await observer
    .getByRole('button', { name: `Abrir pendiente: ${task.title}`, exact: true })
    .waitFor({ state: 'hidden' });
  task = (await json(admin, 'GET', `/tasks/${task.id}`)).item;
  await json(admin, 'PUT', `/tasks/${task.id}/status`, {
    statusId: reviewed.id,
    version: task.version,
  });
  await until(
    async () => (await json(admin, 'GET', `/tasks/${task.id}`)).item.statusId === reviewed.id,
    'reviewed status persists',
  );
  await page.reload();
  await page.locator('.focus-session-task').getByText('Completado', { exact: true }).waitFor();
  await page.waitForFunction(
    (max) =>
      Number(document.querySelector('.focus-digits strong')?.textContent?.split(':')[0]) <= max,
    session.focusMinutes,
  );
  assert(
    await page
      .locator('.focus-session-task')
      .getByText(/Resuelto y revisado/)
      .isVisible(),
  );
  assert.equal(
    await page
      .locator('.focus-session-task select, .focus-session-task input[type="checkbox"]')
      .count(),
    0,
  );
  task = (await json(admin, 'GET', `/tasks/${task.id}`)).item;
  await json(admin, 'PUT', `/tasks/${task.id}/status`, {
    statusId: statuses[0].id,
    version: task.version,
  });
  await observer
    .getByRole('button', { name: `Abrir pendiente: ${task.title}`, exact: true })
    .waitFor();
  for (const [width, height, theme] of [
    [1366, 768, 'light'],
    [390, 844, 'dark'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      window.scrollTo(0, 0);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }, theme);
    await page.screenshot({
      path: path.join(artifacts, `workflow-focus-${theme}.png`),
      fullPage: true,
    });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  pass(
    'Focus dialog selection and completion persist; external reviewed/reopened states update the summary and other members',
  );

  // Keep an unsaved form open while another member changes the same task.
  await observer
    .getByRole('button', { name: `Abrir pendiente: ${task.title}`, exact: true })
    .click();
  await observer.getByLabel('Título', { exact: true }).fill('Unsaved local draft');
  task = (await json(admin, 'GET', `/tasks/${task.id}`)).item;
  task = await json(admin, 'PUT', `/tasks/${task.id}/status`, {
    statusId: statuses[2].id,
    version: task.version,
  });
  await observer.waitForTimeout(400);
  assert.equal(
    await observer.getByLabel('Título', { exact: true }).inputValue(),
    'Unsaved local draft',
  );
  observer.once('dialog', (d) => d.accept());
  await observer.getByRole('button', { name: 'Cerrar', exact: true }).click();
  pass('Realtime invalidation preserves unsaved task edits');

  const note = await json(admin, 'POST', '/notes', {
    title: 'Keep documentation',
    markdown: 'Retain this content',
    projectId: project.id,
    color: 'purple',
    font: 'sans',
  });
  const linked = await json(admin, 'POST', `/notes/${note.id}/task`, {
    projectId: project.id,
    version: note.version,
  });
  const linkedTask = (await json(admin, 'GET', `/tasks/${linked.id}`)).item;
  const png = await readFile(new URL('../public/aegitasks-icon-192.png', import.meta.url));
  const attachmentResponse = await admin.post(`/api/tasks/${linked.id}/attachments`, {
    multipart: { file: { name: 'evidence.png', mimeType: 'image/png', buffer: png } },
  });
  assert.equal(attachmentResponse.status(), 200);
  const attachment = await attachmentResponse.json();
  await json(
    support,
    'DELETE',
    `/tasks/${linked.id}?version=${linkedTask.version}`,
    undefined,
    204,
  );
  assert.equal((await json(admin, 'GET', `/notes/${note.id}`)).linkedTaskId, null);
  assert.equal((await admin.get(`/api/attachments/${attachment.id}`)).status(), 404);
  await json(admin, 'GET', `/tasks/${linked.id}`, undefined, 404);
  pass(
    'User can permanently delete a task; linked notes survive and deleted attachments are inaccessible',
  );

  // Desktop pagination keeps long project lists reachable without hiding overflow.
  for (let i = 0; i < 12; i++)
    await json(admin, 'POST', '/projects', {
      name: `Sidebar ${String(i).padStart(2, '0')}`,
      color: 'purple',
    });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('http://localhost:4174/#projects');
  for (const height of [900, 768, 600]) {
    await page.setViewportSize({ width: 1366, height });
    const sidebar = page.locator('.sidebar');
    await sidebar.getByRole('button', { name: 'PROYECTOS', exact: true }).click();
    await page.waitForTimeout(100);
    assert.equal(
      await sidebar
        .getByRole('button', { name: 'WORKSPACE COMPARTIDO', exact: true })
        .getAttribute('aria-expanded'),
      'false',
    );
    assert(
      await sidebar.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
      `sidebar overflow at ${height}`,
    );
    assert(
      await sidebar
        .getByRole('button', { name: 'Nuevo proyecto', exact: true })
        .evaluate(
          (el) =>
            el.getBoundingClientRect().right <=
            el.closest('.sidebar').getBoundingClientRect().right,
        ),
      'create-project control stays within sidebar',
    );
    const found = new Set();
    while (true) {
      for (const name of await sidebar.locator('.project-link').allTextContents())
        found.add(name.trim());
      const next = sidebar.getByRole('button', { name: 'Más opciones', exact: true });
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.click();
    }
    assert(found.has('Sidebar 11'));
    await sidebar.getByRole('button', { name: 'WORKSPACE COMPARTIDO', exact: true }).click();
    assert.equal(
      await sidebar
        .getByRole('button', { name: 'PROYECTOS', exact: true })
        .getAttribute('aria-expanded'),
      'false',
    );
    assert(await sidebar.evaluate((el) => el.scrollHeight <= el.clientHeight + 1));
  }
  await page.screenshot({ path: path.join(artifacts, 'workflow-sidebar-600.png') });
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Instalar AegiTasks', exact: true })
    .click();
  await page.getByRole('dialog', { name: 'Instala AegiTasks' }).waitFor();
  assert.equal(
    await page.locator('.sidebar').getByText('Instalar aplicación', { exact: true }).count(),
    0,
  );
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  pass(
    'Exclusive sidebar sections paginate large catalogs without vertical overflow at 900/768/600px; logo opens installation dialog',
  );

  // Exercise deletion through both UI entry points, preserving note contents and clearing Focus links.
  await page.goto(`http://localhost:4174/?task=${task.id}#focus`);
  const privateBeforeDelete = privateStream.messages.length;
  await page.getByRole('button', { name: 'Eliminar pendiente', exact: true }).waitFor();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Eliminar pendiente', exact: true }).click();
  await json(admin, 'GET', `/tasks/${task.id}`);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Eliminar pendiente', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await until(
    async () => JSON.parse((await json(admin, 'GET', '/focus')).session.taskIdsJson).length === 0,
    'deleted Focus link cleared',
  );
  await until(
    () => privateStream.messages.slice(privateBeforeDelete).some((m) => m.includes('"focus"')),
    'Focus cleanup reaches the owner even in another space',
  );
  // Project deletion includes a remaining task, folder and a linked note.
  const folder = await json(admin, 'POST', '/folders', {
    projectId: project.id,
    name: 'Delete with project',
  });
  const survivor = await json(admin, 'POST', '/tasks', {
    ...input('Delete with project'),
    folderId: folder.id,
  });
  await page.goto('http://localhost:4174/#settings');
  await page.getByLabel('Proyecto a configurar').selectOption(project.id);
  await page.getByRole('button', { name: 'Editar proyecto', exact: true }).click();
  assert.equal(await page.getByLabel('Etiquetas del proyecto (opcional)').inputValue(), 'PMS, CRM');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Eliminar proyecto', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  w = await json(admin, 'GET', '/workspace');
  assert(!w.projects.some((p) => p.id === project.id));
  assert(!w.statuses.some((s) => s.projectId === project.id));
  assert(!w.folders.some((s) => s.projectId === project.id));
  await json(admin, 'GET', `/tasks/${survivor.id}`, undefined, 404);
  const savedNote = await json(admin, 'GET', `/notes/${note.id}`);
  assert.equal(savedNote.projectId, null);
  assert.equal(savedNote.markdown, 'Retain this content');
  const latestSession = (await json(admin, 'GET', '/focus')).session;
  await json(admin, 'POST', `/focus/${latestSession.id}/action`, {
    action: 'finish',
    version: latestSession.version,
  });
  pass(
    'Task and project deletion UI confirms intent; project cascade preserves notes and clears active Focus links',
  );

  await json(admin, 'POST', '/roles', { name: 'WorkflowLimited' }, 204);
  await json(
    admin,
    'PUT',
    '/roles/WorkflowLimited/permissions',
    { pages: ['projects', 'notes', 'focus', 'spaces', 'settings'] },
    204,
  );
  const accessUser = await json(admin, 'POST', '/users', {
    name: 'Live access',
    email: 'live@example.com',
    password,
    role: 'WorkflowLimited',
  });
  const accessContext = await request.newContext({
    baseURL: 'http://localhost:5213',
    extraHTTPHeaders: { 'X-AegiTasks': '1', 'X-Space-Id': shared.id },
  });
  await json(accessContext, 'POST', '/auth/login', { email: accessUser.email, password });
  const invitation = await json(admin, 'POST', `/spaces/${shared.id}/invite`);
  await json(accessContext, 'POST', '/spaces/join', { code: invitation.code });
  const guardedProject = await json(admin, 'POST', '/projects', {
    name: 'Permission guard',
    color: 'purple',
  });
  const guardedStatus = (await json(admin, 'GET', '/workspace')).statuses.find(
    (s) => s.projectId === guardedProject.id,
  );
  const guardedTask = await json(admin, 'POST', '/tasks', {
    title: 'Must survive denied cascade',
    projectId: guardedProject.id,
    statusId: guardedStatus.id,
    tagIds: [],
  });
  await json(accessContext, 'DELETE', `/projects/${guardedProject.id}`, undefined, 403);
  await json(
    accessContext,
    'DELETE',
    `/tasks/${guardedTask.id}?version=${guardedTask.version}`,
    undefined,
    403,
  );
  await json(
    accessContext,
    'PUT',
    `/tasks/${guardedTask.id}/status`,
    { statusId: guardedStatus.id, version: guardedTask.version },
    403,
  );
  await json(admin, 'GET', `/tasks/${guardedTask.id}`);
  await json(admin, 'DELETE', `/projects/${guardedProject.id}`, undefined, 204);
  pass(
    'Revoked task permission blocks status updates, direct deletion and project cascade deletion',
  );
  const accessStream = await stream(accessContext, shared.id);
  await json(admin, 'DELETE', `/spaces/${shared.id}/members/${accessUser.id}`, undefined, 204);
  await until(
    () => accessStream.messages.some((m) => m.includes('event: revoked') && m.includes('403')),
    'live membership revocation',
  );
  await accessStream.close();
  assert.equal((await accessContext.get(`/api/events?space=${shared.id}`)).status(), 403);
  await accessContext.dispose();
  await sharedStream.close();
  await privateStream.close();
  pass(
    'SSE refuses private-space subscriptions and disconnects an already-connected member on access revocation',
  );

  await observer.goto('http://localhost:4174/#inbox');
  await observer.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
  await observer.waitForTimeout(700);
  let reads = 0;
  const count = (r) => {
    if (/\/api\/(tasks|workspace|spaces)(\?|$|\/summary)/.test(r.url())) reads++;
  };
  observer.on('request', count);
  await observer.waitForTimeout(31500);
  observer.off('request', count);
  assert.equal(reads, 0, 'idle UI must not poll every 30 seconds');
  await observerContext.close();
  pass(
    'Idle connected UI issues no data refresh requests over a complete 30-second polling window',
  );
}
