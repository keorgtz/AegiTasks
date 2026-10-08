import assert from 'node:assert/strict';
import path from 'node:path';
import { createECDH, randomBytes } from 'node:crypto';

export async function testReminders({
  page,
  request,
  admin,
  adminUser,
  json,
  pass,
  artifacts,
  password,
}) {
  const space = await json(admin, 'POST', '/spaces', { name: 'Recordatorios QA' });
  const context = async (state, id = space.id) =>
    request.newContext({
      baseURL: 'http://localhost:5213',
      storageState: state,
      extraHTTPHeaders: { 'X-AegiTasks': '1', 'X-Space-Id': id },
    });
  const owner = await context(await admin.storageState());
  const members = [];
  for (const name of ['Alice', 'Bob', 'Outsider']) {
    const user = await json(admin, 'POST', '/users', {
      name: `Reminder ${name}`,
      email: `${name.toLowerCase()}@reminders.example`,
      role: 'User',
      password,
    });
    const client = await context();
    await json(client, 'POST', '/auth/login', { email: user.email, password });
    if (name !== 'Outsider')
      await json(owner, 'POST', `/spaces/${space.id}/members`, { userId: user.id }, 204);
    members.push({ user, client });
  }
  const [{ user: alice, client: a }, { user: bob, client: b }, { user: outsider, client: x }] =
    members;
  const project = await json(owner, 'POST', '/projects', {
    name: 'Recordatorios PMS',
    color: 'purple',
    description: '',
  });
  const w = await json(owner, 'GET', '/workspace');
  const task = await json(owner, 'POST', '/tasks', {
    title: 'Resolver recordatorio QA',
    description: '',
    projectId: project.id,
    statusId: w.statuses.find((s) => s.projectId === project.id && !s.isDone).id,
    assigneeId: bob.id,
    tagIds: [],
  });
  const input = (title, changes = {}) => ({
    title,
    message: `Mensaje ${title}`,
    audience: 'workspace',
    recipientId: null,
    projectId: null,
    workItemId: null,
    enabled: true,
    schedule: {
      mode: 'interval',
      every: 2,
      unit: 'hours',
      days: [1, 3, 5],
      time: '09:00',
      timeZone: 'America/Mexico_City',
      startsAt: new Date(Date.now() + 600000).toISOString(),
    },
    ...changes,
  });
  const put = (reminder, changes = {}) => ({
    ...reminder,
    projectId: reminder.workItemId ? null : reminder.projectId,
    ...changes,
  });
  for (const unit of ['minutes', 'hours', 'days']) {
    const body = input(`Cadencia ${unit}`);
    body.schedule.unit = unit;
    const saved = await json(owner, 'POST', '/reminders', body);
    assert.equal(saved.schedule.unit, unit);
    assert.ok(saved.nextRunAt);
    assert.equal(saved.workItemId, null);
    assert.ok(!('statusId' in saved));
    assert.ok(!('dueDate' in saved));
  }
  const weekly = input('Semanal');
  weekly.schedule.mode = 'weekly';
  const savedWeekly = await json(owner, 'POST', '/reminders', weekly);
  const anonymous = await context();
  await json(anonymous, 'GET', '/reminders', undefined, 401);
  await anonymous.dispose();
  await json(x, 'GET', '/reminders', undefined, 403);
  await json(
    owner,
    'POST',
    '/reminders',
    input('Usuario ajeno', { audience: 'user', recipientId: outsider.id }),
    400,
  );
  await json(
    owner,
    'POST',
    '/reminders',
    input('Proyecto requerido', { audience: 'project' }),
    400,
  );
  await json(
    owner,
    'POST',
    '/reminders',
    input('Asignación inválida', { audience: 'assignee' }),
    400,
  );
  for (const schedule of [
    { ...weekly.schedule, every: 0 },
    { ...weekly.schedule, days: [] },
    { ...weekly.schedule, days: [1, 1] },
    { ...weekly.schedule, timeZone: 'Invalid/Timezone' },
    { ...weekly.schedule, time: '25:01' },
  ])
    await json(owner, 'POST', '/reminders', input('Horario inválido', { schedule }), 400);
  const ownSpace = await json(admin, 'GET', '/spaces');
  const personal = ownSpace.spaces.find((s) => s.isPersonal);
  const personalOwner = await context(await admin.storageState(), personal.id);
  const privateReminder = await json(
    personalOwner,
    'POST',
    '/reminders',
    input('Recordatorio privado', { audience: 'user', recipientId: adminUser.id }),
  );
  await json(a, 'GET', `/reminders/${privateReminder.id}`, undefined, 404);
  await json(
    a,
    'PUT',
    `/reminders/${privateReminder.id}`,
    put(privateReminder, { title: 'Stolen' }),
    404,
  );
  const foreignProject = await json(personalOwner, 'POST', '/projects', {
    name: 'Private reminders project',
    color: 'blue',
    description: '',
  });
  await json(
    owner,
    'POST',
    '/reminders',
    input('Cruce de proyecto', { projectId: foreignProject.id }),
    400,
  );
  pass(
    'Reminder API supports minutes/hours/calendar days/weekly schedules without task status or expiry, validates audience/timezone and isolates personal/shared spaces',
  );

  const due = (title, changes = {}) => {
    const value = input(title, changes);
    value.schedule = {
      ...value.schedule,
      mode: 'once',
      startsAt: new Date(Date.now() + 3000).toISOString(),
    };
    return value;
  };
  const curve = createECDH('prime256v1');
  curve.generateKeys();
  const device = await json(a, 'POST', '/notifications/devices', {
    endpoint: 'https://fcm.googleapis.com/fcm/send/reminder-fixture',
    keys: {
      p256dh: curve.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  });
  const individual = await json(
    owner,
    'POST',
    '/reminders',
    due('Aviso personal', { audience: 'user', recipientId: alice.id }),
  );
  const all = await json(owner, 'POST', '/reminders', due('Aviso del equipo'));
  const projectAll = await json(
    owner,
    'POST',
    '/reminders',
    due('Aviso del proyecto', { audience: 'project', projectId: project.id }),
  );
  const linked = await json(
    owner,
    'POST',
    '/reminders',
    due('Usar título real', {
      audience: 'assignee',
      workItemId: task.id,
      message: 'Avanza con este pendiente',
    }),
  );
  const noticesFor = async (client, id) =>
    (await json(client, 'GET', '/notifications')).items.filter((n) => n.reminderId === id);
  const deadline = Date.now() + 25000;
  let notices;
  do {
    notices = await json(a, 'GET', '/notifications');
    if (
      notices.items.some((n) => n.reminderId === projectAll.id) &&
      (await noticesFor(b, linked.id)).length
    )
      break;
    await page.waitForTimeout(300);
  } while (Date.now() < deadline);
  assert.equal((await noticesFor(a, individual.id)).length, 1);
  assert.equal((await noticesFor(b, individual.id)).length, 0);
  assert.equal((await noticesFor(owner, individual.id)).length, 0);
  for (const client of [owner, a, b]) {
    assert.equal((await noticesFor(client, all.id)).length, 1);
    assert.equal((await noticesFor(client, projectAll.id)).length, 1);
  }
  assert.equal((await noticesFor(x, all.id)).length, 0);
  assert.equal((await noticesFor(a, linked.id)).length, 0);
  const taskNotice = (await noticesFor(b, linked.id))[0];
  assert.equal(taskNotice.workItemId, task.id);
  assert.equal(taskNotice.title, task.title);
  const notice = (await noticesFor(a, individual.id))[0];
  const preview = await json(a, 'GET', `/notifications/${notice.id}/push?device=${device.id}`);
  assert.equal(preview.title, individual.title);
  assert.equal(preview.body, individual.message);
  assert.ok(preview.url.endsWith(`#reminders/${individual.id}`));
  const fired = await json(owner, 'GET', `/reminders/${individual.id}`);
  assert.equal(fired.nextRunAt, null);
  assert.ok(fired.lastSentAt);
  pass(
    'Real server timer creates one-time notices with the app unopened, scopes individual/workspace/project/task recipients and gives subscribed devices authorized reminder deep links',
  );

  const modified = await json(
    owner,
    'PUT',
    `/reminders/${savedWeekly.id}`,
    put(savedWeekly, { message: 'Actualizado' }),
  );
  await json(
    owner,
    'PUT',
    `/reminders/${modified.id}`,
    put(modified, { version: crypto.randomUUID() }),
    409,
  );
  await json(
    owner,
    'DELETE',
    `/reminders/${modified.id}?version=${crypto.randomUUID()}`,
    undefined,
    409,
  );
  const taskBefore = await json(owner, 'GET', `/tasks/${task.id}`);
  const repeat = await json(
    owner,
    'POST',
    '/reminders',
    input('Repeated task', { audience: 'assignee', workItemId: task.id }),
  );
  assert.equal(
    (await json(owner, 'GET', `/tasks/${task.id}`)).item.version,
    taskBefore.item.version,
  );
  await json(owner, 'PUT', `/reminders/${repeat.id}`, put(repeat, { workItemId: null }), 400);
  const paused = await json(
    owner,
    'PUT',
    `/reminders/${individual.id}`,
    put(fired, { enabled: false }),
  );
  assert.equal(paused.nextRunAt, null);
  await json(a, 'GET', `/notifications/${notice.id}/push?device=${device.id}`, undefined, 404);
  const transient = await json(owner, 'POST', '/projects', {
    name: 'Reminder deleted project',
    color: 'green',
    description: '',
  });
  const independent = await json(
    owner,
    'POST',
    '/reminders',
    input('Conservar mensaje', { audience: 'project', projectId: transient.id }),
  );
  await json(owner, 'DELETE', `/projects/${transient.id}`, undefined, 204);
  const retained = await json(owner, 'GET', `/reminders/${independent.id}`);
  assert.equal(retained.projectId, null);
  assert.equal(retained.enabled, false);
  assert.equal(retained.message, independent.message);
  pass(
    'Reminder edits/deletes enforce version conflicts, task reminders do not modify task drafts/versions, pausing suppresses push and deleting a project preserves independent reminders safely paused',
  );

  await page.goto(`/?space=${space.id}#reminders`);
  await page.getByRole('heading', { name: 'Recordatorios', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Nuevo recordatorio', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Nuevo recordatorio', exact: true });
  await editor.getByLabel('Título', { exact: true }).fill('Revisar respaldos');
  await editor.getByLabel('Mensaje', { exact: true }).fill('Verificar el respaldo del PMS');
  await editor.getByLabel('Contexto', { exact: true }).selectOption(project.id);
  await editor.getByLabel('Para quién', { exact: true }).selectOption('project');
  await editor.getByLabel('Repetición', { exact: true }).selectOption('weekly');
  await editor.getByLabel('Hora del aviso', { exact: true }).fill('21:15');
  await editor.getByLabel('Zona horaria', { exact: true }).fill('America/Mexico_City');
  await editor.getByRole('button', { name: 'Guardar recordatorio', exact: true }).click();
  const card = page.getByRole('article', { name: 'Revisar respaldos', exact: true });
  await card.waitFor();
  await card
    .getByRole('button', { name: 'Pausar recordatorio Revisar respaldos', exact: true })
    .click();
  await card.getByText('Programación pausada', { exact: true }).waitFor();
  await card
    .getByRole('button', { name: 'Activar recordatorio Revisar respaldos', exact: true })
    .click();
  await card
    .getByRole('button', { name: 'Pausar recordatorio Revisar respaldos', exact: true })
    .waitFor();
  await card
    .getByRole('button', { name: 'Editar recordatorio Revisar respaldos', exact: true })
    .click();
  const edit = page.getByRole('dialog', { name: 'Editar recordatorio', exact: true });
  await edit.getByLabel('Mensaje', { exact: true }).fill('Borrador local que se conserva');
  const saved = (await json(owner, 'GET', '/reminders?q=Revisar')).items[0];
  await json(
    a,
    'PUT',
    `/reminders/${saved.id}`,
    put(saved, { message: 'Cambio remoto del equipo' }),
  );
  await edit.getByRole('button', { name: 'Guardar recordatorio', exact: true }).click();
  await edit
    .getByRole('alert')
    .getByText('Otra persona actualizó el recordatorio. Recarga antes de guardar.')
    .waitFor();
  assert.equal(
    await edit.getByLabel('Mensaje', { exact: true }).inputValue(),
    'Borrador local que se conserva',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await edit.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByLabel('Buscar recordatorios', { exact: true }).fill('Revisar');
  await card.getByText('Cambio remoto del equipo', { exact: true }).waitFor();
  pass(
    'Actual reminder UI creates project/week schedules, pauses/resumes, searches and preserves an unsaved message on a real cross-user conflict',
  );

  for (const [width, height, theme] of [
    [1440, 900, 'light'],
    [1440, 900, 'dark'],
    [390, 844, 'dark'],
    [320, 740, 'light'],
    [844, 450, 'dark'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(artifacts, `reminders-${width}-${theme}.png`) });
    await page.getByRole('button', { name: 'Nuevo recordatorio', exact: true }).click();
    await editor.getByLabel('Repetición', { exact: true }).selectOption('weekly');
    await editor
      .getByRole('button', { name: 'Guardar recordatorio', exact: true })
      .scrollIntoViewIfNeeded();
    const bounds = await editor.boundingBox();
    const save = await editor
      .getByRole('button', { name: 'Guardar recordatorio', exact: true })
      .boundingBox();
    assert.ok(
      bounds.x >= 0 &&
        bounds.x + bounds.width <= width + 1 &&
        bounds.y >= 0 &&
        bounds.y + bounds.height <= height + 1,
    );
    assert.ok(save.y + save.height <= height + 1 && save.x + save.width <= width + 1);
    await page.screenshot({ path: path.join(artifacts, `reminder-editor-${width}-${theme}.png`) });
    page.once('dialog', (dialog) => dialog.accept());
    await editor.getByRole('button', { name: 'Cancelar', exact: true }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Más', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Más opciones', exact: true })
    .getByRole('button', { name: 'Recordatorios', exact: true })
    .click();
  assert.ok(page.url().endsWith('#reminders'));
  await page.goto(`/?space=${space.id}&task=${task.id}#inbox`);
  await page.getByRole('button', { name: 'Recordatorios del pendiente', exact: true }).click();
  const taskReminders = page.getByRole('dialog', {
    name: 'Recordatorios del pendiente',
    exact: true,
  });
  await taskReminders.getByRole('button', { name: 'Nuevo recordatorio', exact: true }).click();
  await editor.getByLabel('Cada', { exact: true }).fill('2');
  await editor.getByLabel('Unidad', { exact: true }).selectOption('minutes');
  await editor.getByRole('button', { name: 'Guardar recordatorio', exact: true }).click();
  await taskReminders.getByText('Cada 2 minutos', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(artifacts, 'reminder-task-phone.png') });
  await taskReminders.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.goto(`/?space=${space.id}#reminders/${all.id}`);
  await edit.getByLabel('Título', { exact: true }).waitFor();
  assert.equal(await edit.getByLabel('Título', { exact: true }).inputValue(), all.title);
  await edit.getByRole('button', { name: 'Cancelar', exact: true }).click();
  pass(
    'Reminder list/editor and task footer work in portrait/landscape/desktop themes, keep Save reachable, use mobile More and restore push deep links',
  );

  await json(admin, 'POST', '/roles', { name: 'Reminder restricted' }, 204);
  const roleData = await json(admin, 'GET', '/roles');
  assert.ok(
    roleData.permissions.some(
      (p) => p.roleName === 'Reminder restricted' && p.page === 'reminders' && p.allowed,
    ),
  );
  const restricted = await json(admin, 'POST', '/users', {
    name: 'Restricted reminders',
    email: 'restricted@reminders.example',
    role: 'Reminder restricted',
    password,
  });
  const restrictedClient = await context();
  await json(restrictedClient, 'POST', '/auth/login', { email: restricted.email, password });
  await json(owner, 'POST', `/spaces/${space.id}/members`, { userId: restricted.id }, 204);
  await json(
    admin,
    'PUT',
    `/roles/${encodeURIComponent('Reminder restricted')}/permissions`,
    { pages: roleData.pages.filter((name) => name !== 'reminders') },
    204,
  );
  await json(restrictedClient, 'GET', '/reminders', undefined, 403);
  await json(restrictedClient, 'POST', '/reminders', input('Blocked'), 403);
  await json(
    owner,
    'DELETE',
    `/tasks/${task.id}?version=${(await json(owner, 'GET', `/tasks/${task.id}`)).item.version}`,
    undefined,
    204,
  );
  await json(owner, 'GET', `/reminders/${repeat.id}`, undefined, 404);
  assert.equal((await json(owner, 'GET', `/reminders/${all.id}`)).workItemId, null);
  await json(
    owner,
    'DELETE',
    `/reminders/${all.id}?version=${(await json(owner, 'GET', `/reminders/${all.id}`)).version}`,
    undefined,
    204,
  );
  assert.equal((await noticesFor(a, all.id)).length, 0);
  const departed = await json(
    owner,
    'POST',
    '/reminders',
    input('Destinatario inactivo', { audience: 'user', recipientId: bob.id }),
  );
  await json(
    admin,
    'PUT',
    `/users/${bob.id}`,
    { name: bob.name, role: 'User', active: false },
    200,
  );
  assert.equal(
    (await json(owner, 'PUT', `/reminders/${departed.id}`, put(departed, { enabled: false })))
      .enabled,
    false,
  );
  const archivedProject = await json(owner, 'POST', '/projects', {
    name: 'Archived reminders project',
    color: 'blue',
    description: '',
  });
  const archivedReminder = await json(
    owner,
    'POST',
    '/reminders',
    input('Proyecto archivado', { projectId: archivedProject.id }),
  );
  await json(owner, 'PUT', `/projects/${archivedProject.id}`, {
    ...archivedProject,
    archived: true,
  });
  assert.equal((await json(owner, 'GET', `/reminders/${archivedReminder.id}`)).suppressed, true);
  assert.equal(
    (
      await json(
        owner,
        'PUT',
        `/reminders/${archivedReminder.id}`,
        put(archivedReminder, { enabled: false }),
      )
    ).enabled,
    false,
  );
  pass(
    'Default/new role page permissions apply to reminders, revoked users cannot manage them, task deletion removes only attached reminders and independent deletion cancels recipient notices',
  );
  for (const client of [owner, a, b, x, personalOwner, restrictedClient]) await client.dispose();
}
