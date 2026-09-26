import assert from 'node:assert/strict';
import path from 'node:path';

export async function testInboxFilters({ page, admin, support, adminUser, json, artifacts, pass }) {
  const a = await json(admin, 'POST', '/projects', { name: 'Filter QA Alpha', color: 'purple' });
  const b = await json(admin, 'POST', '/projects', { name: 'Filter QA Beta', color: 'blue' });
  const custom = await json(admin, 'POST', '/statuses', {
    projectId: a.id,
    name: 'Diagnóstico QA',
    color: 'orange',
    position: 1,
    isDone: false,
  });
  const folder = await json(admin, 'POST', '/folders', { projectId: a.id, name: 'Módulo QA' });
  const w = await json(admin, 'GET', '/workspace');
  const other = await json(support, 'GET', '/auth/me');
  const prefix = 'Filter board QA';
  const make = (title, projectId, extra = {}) =>
    json(admin, 'POST', '/tasks', {
      title: `${prefix} ${title}`,
      projectId,
      statusId: w.statuses.find((s) => s.projectId === projectId && !s.isDone).id,
      tagIds: [],
      ...extra,
    });
  const own = await make('own', a.id, {
    statusId: custom.id,
    folderId: folder.id,
    assigneeId: adminUser.id,
    priority: 4,
    tagIds: [w.tags[0].id],
  });
  await make('available', b.id, { priority: 4 });
  const foreign = await make('other owner', a.id, { assigneeId: other.id, priority: 4 });
  const done = await make('resolved', b.id, {
    statusId: w.statuses.find((s) => s.projectId === b.id && s.isDone).id,
  });
  for (let i = 0; i < 49; i++) await make(`page ${i}`, a.id, { priority: 1 });
  await page.goto('http://localhost:4174/#inbox');
  await page.getByLabel('Buscar pendientes', { exact: true }).fill(prefix);
  const settled = () =>
    page.waitForFunction((prefix) => {
      const cards = [...document.querySelectorAll('.work-section .task-card')];
      return (
        !document.querySelector('.loading-line') &&
        cards.length > 0 &&
        cards.every((card) => card.textContent.includes(prefix))
      );
    }, prefix);
  await settled();
  assert.equal(await page.locator('.task-search-bar select').count(), 0);
  const titles = () =>
    page
      .locator('.work-section .task-card')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label')).sort());
  const listTitles = await titles();
  assert.equal(listTitles.length, 50);
  await page.getByRole('button', { name: 'Vista de tablero', exact: true }).click();
  await page.locator('.project-board').first().waitFor();
  assert.deepEqual(await titles(), listTitles);
  assert.equal(await page.locator('.project-board').count(), 2);
  const alpha = page.getByRole('region', { name: `Tablero de ${a.name}`, exact: true });
  const beta = page.getByRole('region', { name: `Tablero de ${b.name}`, exact: true });
  await alpha.locator('.board-heading').getByText(custom.name, { exact: true }).waitFor();
  assert.equal(await beta.getByText(custom.name, { exact: true }).count(), 0);
  assert(!listTitles.some((title) => title.includes(foreign.title) || title.includes(done.title)));
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.waitForFunction(
    () =>
      !document.querySelector('.loading-line') &&
      document.querySelectorAll('.work-section .task-card').length === 1,
  );
  assert(!(await titles()).some((title) => listTitles.includes(title)));
  pass(
    'Inbox board immediately shows custom workflows grouped by project, preserves owner/scope filters and paginates the same tasks as the list',
  );

  const open = () => page.getByRole('button', { name: 'Abrir filtros', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Filtrar pendientes' });
  const apply = async () => {
    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/tasks' && r.status() === 200,
    );
    await dialog.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
    await response;
    await page.locator('.loading-line').waitFor({ state: 'hidden' });
  };
  await open();
  await dialog.getByLabel('Filtrar por proyecto').selectOption(a.id);
  await dialog.getByLabel('Filtrar por carpeta').selectOption(folder.id);
  await dialog.getByLabel('Filtrar por estado').selectOption(custom.id);
  await dialog.getByLabel('Filtrar por responsable').selectOption('mine');
  await dialog.getByLabel('Filtrar por etiqueta').selectOption(w.tags[0].id);
  await dialog.getByLabel('Filtrar por prioridad').selectOption('4');
  await dialog.getByLabel('Ordenar pendientes').selectOption('newest');
  await apply();
  assert.equal(new URL(page.url()).hash, '#inbox');
  assert.deepEqual(await titles(), [`Abrir pendiente: ${own.title}`]);
  assert.equal(await page.locator('.task-filter-count').textContent(), '7');
  await page.getByRole('button', { name: 'Nuevo pendiente', exact: true }).click();
  const report = page.getByRole('dialog', { name: '¿Qué encontraste?' });
  assert.equal(await report.getByLabel('Proyecto', { exact: true }).inputValue(), a.id);
  assert.equal(await report.getByLabel('Carpeta', { exact: true }).inputValue(), folder.id);
  await report.getByRole('button', { name: 'Cerrar', exact: true }).click();

  await open();
  await dialog.getByLabel('Filtrar por proyecto').selectOption(b.id);
  assert.equal(await dialog.getByLabel('Filtrar por estado').inputValue(), '');
  assert.equal(await dialog.getByLabel('Filtrar por carpeta').inputValue(), '');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.deepEqual(await titles(), [`Abrir pendiente: ${own.title}`]);
  await open();
  assert.equal(await dialog.getByLabel('Filtrar por proyecto').inputValue(), a.id);
  await dialog.getByRole('button', { name: 'Restablecer', exact: true }).click();
  assert.equal(
    await dialog.getByLabel('Filtrar por responsable').inputValue(),
    'mine-or-unassigned',
  );
  assert.equal(await dialog.getByLabel('Ordenar pendientes').inputValue(), 'priority');
  await dialog.getByLabel('Mostrar pendientes').selectOption('all');
  await apply();
  const expected = await json(
    admin,
    'GET',
    `/tasks?q=${encodeURIComponent(prefix)}&scope=all&assignee=mine-or-unassigned&page=1&sort=priority`,
  );
  assert.deepEqual(await titles(), expected.items.map((t) => `Abrir pendiente: ${t.title}`).sort());
  assert.equal(await page.getByLabel('Buscar pendientes', { exact: true }).inputValue(), prefix);
  pass(
    'Filter dialog applies project/folder/status/owner/tag/priority/order together, resets pagination, cancels changes and restores defaults without losing search',
  );

  for (const [width, height, theme] of [
    [1440, 900, 'light'],
    [390, 844, 'dark'],
    [320, 600, 'light'],
    [844, 390, 'dark'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    await page
      .locator('.work-section')
      .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 90));
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(artifacts, `inbox-board-${width}-${theme}.png`) });
    await open();
    assert(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    const save = dialog.getByRole('button', { name: 'Aplicar filtros', exact: true });
    await save.scrollIntoViewIfNeeded();
    const bounds = await save.boundingBox();
    assert(bounds.y >= 0 && bounds.y + bounds.height <= height + 1);
    await page.screenshot({ path: path.join(artifacts, `inbox-filters-${width}-${theme}.png`) });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await open();
  await dialog.getByRole('button', { name: 'Restablecer', exact: true }).click();
  await apply();
  await page.getByLabel('Buscar pendientes', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Vista de lista', exact: true }).click();
  // Remove only this test's fixtures so subsequent inbox assertions retain their dataset.
  await json(admin, 'DELETE', `/projects/${a.id}`, undefined, 204);
  await json(admin, 'DELETE', `/projects/${b.id}`, undefined, 204);
  pass(
    'Search and filters stay compact; project boards scroll internally and filter dialogs remain usable at 320px and landscape in both themes',
  );
}
