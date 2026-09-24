import assert from 'node:assert/strict';
import path from 'node:path';

export async function testAssignments({
  page,
  context,
  admin,
  support,
  shared,
  adminUser,
  json,
  pass,
  artifacts,
}) {
  const supportUser = await json(support, 'GET', '/auth/me');
  const active = (await json(admin, 'GET', '/focus')).session;
  if (active)
    await json(admin, 'POST', `/focus/${active.id}/action`, {
      action: 'finish',
      version: active.version,
    });
  const project = await json(admin, 'POST', '/projects', {
    name: 'Assignment regression',
    color: 'purple',
  });
  const workspace = await json(admin, 'GET', '/workspace');
  const statuses = workspace.statuses.filter((s) => s.projectId === project.id);
  const open = statuses.find((s) => !s.isDone);
  const done = statuses.find((s) => s.isDone);
  const create = (title, assigneeId = null, statusId = open.id) =>
    json(admin, 'POST', '/tasks', {
      title,
      projectId: project.id,
      statusId,
      assigneeId,
      tagIds: [],
    });
  const own = await create('Owner selection admin', adminUser.id);
  const unassigned = await create('Owner selection unassigned');
  const other = await create('Owner selection support', supportUser.id);
  const completed = await create('Owner selection completed', adminUser.id, done.id);
  let archived = await create('Owner selection archived', adminUser.id);
  archived = await json(admin, 'POST', `/tasks/${archived.id}/archive`, {
    archived: true,
    version: archived.version,
  });
  for (let index = 0; index < 50; index++)
    await create(`Page selection ${index}`, index % 2 ? adminUser.id : null);
  const filtered = (who, assignee, extra = '') =>
    json(who, 'GET', `/tasks?scope=open&project=${project.id}&assignee=${assignee}${extra}`);
  const first = await filtered(admin, 'mine-or-unassigned');
  const second = await filtered(admin, 'mine-or-unassigned', '&page=2');
  assert.equal(first.total, 52);
  assert.equal(first.items.length, 50);
  assert.equal(second.items.length, 2);
  const all = [...first.items, ...second.items];
  assert.equal(new Set(all.map((t) => t.id)).size, 52);
  assert(all.every((t) => !t.assigneeId || t.assigneeId === adminUser.id));
  assert.equal((await filtered(support, 'mine-or-unassigned')).total, 27);
  assert.equal((await filtered(admin, 'mine')).total, 26);
  assert.equal((await filtered(admin, 'unassigned')).total, 26);
  assert.equal((await filtered(admin, supportUser.id)).total, 1);
  assert.equal((await filtered(admin, 'all')).total, 53);
  await json(admin, 'GET', '/tasks?assignee=invalid', undefined, 400);
  const counts = await json(admin, 'GET', '/tasks/summary?assignee=mine-or-unassigned');
  assert.equal(
    counts.open,
    (await json(admin, 'GET', '/tasks?scope=open&assignee=mine-or-unassigned')).total,
  );
  pass(
    'Assignee filtering uses the signed-in user, includes unassigned work and paginates before returning consistent totals',
  );

  for (const task of [other, completed, archived]) {
    await json(admin, 'POST', '/focus/start', { taskIds: [task.id] }, 400);
  }
  const archivedProject = await json(admin, 'POST', '/projects', {
    name: 'Archived assignment project',
    color: 'purple',
  });
  const hiddenWorkspace = await json(admin, 'GET', '/workspace');
  const hiddenTask = await json(admin, 'POST', '/tasks', {
    title: 'Archived project task',
    projectId: archivedProject.id,
    statusId: hiddenWorkspace.statuses.find((s) => s.projectId === archivedProject.id).id,
    tagIds: [],
  });
  await json(admin, 'PUT', `/projects/${archivedProject.id}`, {
    name: archivedProject.name,
    color: 'purple',
    archived: true,
  });
  await json(admin, 'POST', '/focus/start', { taskIds: [hiddenTask.id] }, 400);
  await json(admin, 'DELETE', `/projects/${archivedProject.id}`, undefined, 204);
  pass(
    'Focus rejects completed, archived, other-assignee and archived-project tasks on the server',
  );

  const titleButton = (p, task) =>
    p.getByRole('button', { name: `Abrir pendiente: ${task.title}`, exact: true });
  async function searchInbox(p) {
    const loaded = p.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/tasks' &&
        url.searchParams.get('q') === 'Owner selection' &&
        response.status() === 200
      );
    });
    await p.getByLabel('Buscar pendientes', { exact: true }).fill('Owner selection');
    await loaded;
    await p.locator('.loading-line').waitFor({ state: 'hidden' });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('http://localhost:4174/#inbox');
  assert.equal(await page.getByLabel('Filtrar por responsable').inputValue(), 'mine-or-unassigned');
  await searchInbox(page);
  await titleButton(page, own).waitFor();
  await titleButton(page, unassigned).waitFor();
  assert.equal(await titleButton(page, other).count(), 0);
  await page.getByLabel('Filtrar por responsable').selectOption(supportUser.id);
  await titleButton(page, other).waitFor();
  assert.equal(await titleButton(page, own).count(), 0);
  await page.goto('http://localhost:4174/#projects');
  await page.goto('http://localhost:4174/#inbox');
  assert.equal(await page.getByLabel('Filtrar por responsable').inputValue(), 'mine-or-unassigned');
  await page.reload();
  assert.equal(await page.getByLabel('Filtrar por responsable').inputValue(), 'mine-or-unassigned');
  const state = await support.storageState();
  state.origins.push({
    origin: 'http://localhost:4174',
    localStorage: [{ name: `aegitasks-space-${supportUser.id}`, value: shared.id }],
  });
  const supportContext = await context
    .browser()
    .newContext({ storageState: state, viewport: { width: 390, height: 844 } });
  try {
    const supportPage = await supportContext.newPage();
    await supportPage.goto('http://localhost:4174/#inbox');
    assert.equal(
      await supportPage.getByLabel('Filtrar por responsable').inputValue(),
      'mine-or-unassigned',
    );
    await searchInbox(supportPage);
    await titleButton(supportPage, other).waitFor();
    await titleButton(supportPage, unassigned).waitFor();
    assert.equal(await titleButton(supportPage, own).count(), 0);
    assert(await supportPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await supportPage.screenshot({
      path: path.join(artifacts, 'assignment-inbox-mobile.png'),
      fullPage: true,
    });
  } finally {
    await supportContext.close();
  }
  pass(
    'Admin and User inboxes default to their own or unassigned tasks; the owner filter and navigation reset work on desktop/mobile',
  );

  await page.goto('http://localhost:4174/#focus');
  const search = page.getByLabel('Buscar pendientes para enfocar');
  await search.fill('Owner selection');
  const picker = page.locator('.focus-task-picker');
  const checkbox = (task) => picker.getByRole('checkbox', { name: new RegExp(`^${task.title}`) });
  await checkbox(own).waitFor();
  await checkbox(unassigned).waitFor();
  assert.equal(await checkbox(other).count(), 0);
  assert.equal(await checkbox(completed).count(), 0);
  assert.equal(await checkbox(archived).count(), 0);
  await checkbox(unassigned).check();
  await search.fill(own.title);
  await checkbox(own).check();
  for (const [width, height, theme] of [
    [1366, 768, 'light'],
    [390, 600, 'dark'],
    [320, 600, 'light'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    const start = await page
      .getByRole('button', { name: 'Comenzar enfoque', exact: true })
      .boundingBox();
    const choose = await page.getByRole('button', { name: /Elegir pendientes/ }).boundingBox();
    assert(
      choose.y - (start.y + start.height) >= 15.5,
      'Focus actions need at least 16px separation',
    );
    await page.getByRole('button', { name: 'Ampliar en esta pestaña', exact: true }).click();
    const expanded = page.locator('.focus-stage.is-immersive');
    await expanded.waitFor();
    assert.equal(await page.evaluate(() => document.fullscreenElement), null);
    const box = await expanded.boundingBox();
    assert(
      Math.abs(box.x) < 1 &&
        Math.abs(box.y) < 1 &&
        Math.abs(box.width - width) < 1 &&
        Math.abs(box.height - height) < 1,
    );
    assert(await expanded.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    await page.screenshot({ path: path.join(artifacts, `assignment-focus-expanded-${width}.png`) });
    await page.getByRole('button', { name: /Elegir pendientes/ }).click();
    await expanded.waitFor({ state: 'hidden' });
    await search.waitFor();
    await page.waitForFunction(
      () => document.activeElement === document.querySelector('#focus-plan input'),
    );
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Comenzar enfoque', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).waitFor();
  let session = (await json(admin, 'GET', '/focus')).session;
  assert.deepEqual(new Set(JSON.parse(session.taskIdsJson)), new Set([own.id, unassigned.id]));
  await page.getByRole('button', { name: 'Ampliar en esta pestaña', exact: true }).click();
  const temporaryTab = await context.newPage();
  await temporaryTab.goto('about:blank');
  await temporaryTab.bringToFront();
  await page.bringToFront();
  await temporaryTab.close();
  assert.equal(await page.evaluate(() => document.fullscreenElement), null);
  await page.keyboard.press('Escape');
  await page.locator('.focus-stage.is-immersive').waitFor({ state: 'hidden' });
  session = (await json(admin, 'GET', '/focus')).session;
  assert.equal(session.state, 'running');
  await json(admin, 'POST', `/focus/${session.id}/action`, {
    action: 'finish',
    version: session.version,
  });
  await json(admin, 'DELETE', `/projects/${project.id}`, undefined, 204);
  pass(
    'Focus selects own/unassigned tasks across searches, spaces actions by 16px and expands only within the browser viewport while keeping its timer running',
  );
}
