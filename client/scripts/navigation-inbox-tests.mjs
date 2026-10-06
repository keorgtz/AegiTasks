import assert from 'node:assert/strict';
import path from 'node:path';

export async function testNavigationInbox({
  page,
  admin,
  support,
  member,
  adminUser,
  json,
  pass,
  artifacts,
}) {
  const project = await json(admin, 'POST', '/projects', {
    name: 'Inbox views fixture',
    color: 'purple',
  });
  const workspace = await json(admin, 'GET', '/workspace');
  const open = workspace.statuses.find(
    (status) => status.projectId === project.id && !status.isDone,
  );
  const done = workspace.statuses.find(
    (status) => status.projectId === project.id && status.isDone,
  );
  const prefix = 'Navigation work';
  const today = new Date();
  const localDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const date = (offset) =>
    new Date(Date.parse(localDay + 'T12:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  for (let i = 0; i < 54; i++)
    await json(admin, 'POST', '/tasks', {
      title: `${prefix} ${String(i).padStart(2, '0')}`,
      projectId: project.id,
      statusId: i === 53 ? done.id : open.id,
      assigneeId: i === 52 ? member.id : i % 2 ? adminUser.id : null,
      dueDate: i % 3 ? date(i - 20) : null,
      tagIds: [],
    });
  const fresh = async () => {
    await page.goto('http://localhost:4174/#inbox');
    await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
  };
  const work = () => page.locator('.work-section');
  const matches = () =>
    work().getByRole('button', { name: new RegExp('^Abrir pendiente: ' + prefix) });
  const choose = (label) =>
    work()
      .getByRole('button', { name: 'Vista de ' + label, exact: true })
      .click();
  const search = async () => {
    const request = page.waitForResponse(
      (response) =>
        response.url().includes('/api/tasks?') &&
        new URL(response.url()).searchParams.get('q') === prefix &&
        response.request().method() === 'GET',
    );
    await page.getByLabel('Buscar pendientes', { exact: true }).fill(prefix);
    await request;
    await page.waitForFunction(() => !document.querySelector('.loading-line'));
  };
  await fresh();
  assert.equal(await page.getByRole('button', { name: 'Mis pendientes', exact: true }).count(), 0);
  const sidebar = page.locator('.sidebar');
  assert.equal(
    await sidebar
      .locator('#sidebar-workspace')
      .getByRole('button', { name: 'Proyectos', exact: true })
      .count(),
    0,
  );
  await sidebar.getByRole('button', { name: 'Contraer proyectos', exact: true }).click();
  await sidebar.getByRole('button', { name: 'PROYECTOS', exact: true }).click();
  await page.getByRole('heading', { name: 'Tus proyectos', exact: true }).waitFor();
  assert.equal(
    await sidebar
      .getByRole('button', { name: 'Expandir proyectos', exact: true })
      .getAttribute('aria-expanded'),
    'false',
  );
  await sidebar.getByRole('button', { name: 'Expandir proyectos', exact: true }).click();
  await fresh();
  pass(
    'Desktop Projects heading opens the catalog without expanding its tree; duplicate Projects and My Tasks entries are removed',
  );

  const settings = sidebar.getByRole('button', { name: 'Ajustes', exact: true });
  if ((await settings.getAttribute('aria-expanded')) !== 'true') await settings.click();
  const submenu = sidebar.getByRole('navigation', { name: 'Submenú de ajustes', exact: true });
  for (const [name, route, heading] of [
    ['Organización', 'organization', 'Ajustes'],
    ['Workspace', 'workspace', 'Spaces'],
    ['Usuarios y roles', 'users', 'Usuarios y roles'],
    ['Mi cuenta', 'account', 'Mi cuenta'],
  ]) {
    await submenu.getByRole('button', { name, exact: true }).click();
    await page.waitForURL((url) => url.hash === '#settings/' + route);
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole('navigation', { name: 'Secciones de ajustes', exact: true })
        .getByRole('button', { name, exact: true })
        .getAttribute('aria-current'),
      'page',
    );
  }
  await page.goto('http://localhost:4174/#admin');
  await page.getByRole('heading', { name: 'Usuarios y roles', exact: true }).waitFor();
  assert(page.url().endsWith('#settings/users'));
  await page.goto('http://localhost:4174/#mine');
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
  assert(page.url().endsWith('#inbox'));
  pass(
    'Settings submenu reaches organization, workspace, users/roles and account; legacy admin/space links migrate and My Tasks redirects to the inbox',
  );

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    for (const height of [900, 600, 450]) {
      await page.setViewportSize({ width: 1366, height });
      assert.equal(
        await sidebar
          .getByRole('button', { name: 'WORKSPACE COMPARTIDO', exact: true })
          .getAttribute('aria-expanded'),
        'true',
      );
      assert.equal(
        await sidebar
          .getByRole('button', { name: 'Contraer proyectos', exact: true })
          .getAttribute('aria-expanded'),
        'true',
      );
      const workspacePanel = sidebar.locator('#sidebar-workspace');
      const projectsPanel = sidebar.locator('#sidebar-projects');
      const projectScroll = await projectsPanel.evaluate((element) => element.scrollTop);
      await workspacePanel.evaluate((element) => (element.scrollTop = element.scrollHeight));
      assert.equal(await projectsPanel.evaluate((element) => element.scrollTop), projectScroll);
      const workspaceScroll = await workspacePanel.evaluate((element) => element.scrollTop);
      await projectsPanel.evaluate((element) => (element.scrollTop = element.scrollHeight));
      assert.equal(await workspacePanel.evaluate((element) => element.scrollTop), workspaceScroll);
      assert(
        await sidebar.evaluate(
          (element) =>
            element.scrollHeight <= element.clientHeight + 1 &&
            getComputedStyle(element).overflowY === 'hidden',
        ),
      );
      if (height === 450)
        assert(
          await workspacePanel.evaluate((element) => element.scrollHeight > element.clientHeight),
        );
      await page.screenshot({
        path: path.join(artifacts, `navigation-panels-${height}-${theme}.png`),
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  pass(
    'Workspace and Projects remain open simultaneously and scroll independently without moving the sidebar in either theme at 900/600/450px',
  );

  await settings.click();
  assert.equal(await settings.getAttribute('aria-expanded'), 'false');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(
      () => {
        const panel = document.querySelector('#sidebar-workspace');
        return (
          Math.abs(panel.clientHeight - panel.firstElementChild.getBoundingClientRect().height) <= 1
        );
      },
      undefined,
      { timeout: 5000 },
    );
    const workspacePanel = sidebar.locator('#sidebar-workspace');
    assert.equal(
      await workspacePanel.evaluate((element) => element.scrollHeight > element.clientHeight + 1),
      false,
    );
    assert.equal(await sidebar.locator('.sidebar-note').count(), 0);
    const collapse = sidebar.getByRole('button', { name: 'Contraer proyectos', exact: true });
    const create = sidebar.getByRole('button', { name: 'Nuevo proyecto', exact: true });
    const collapseBounds = await collapse.boundingBox();
    const createBounds = await create.boundingBox();
    assert(collapseBounds.width === 32 && collapseBounds.height === 32);
    assert(createBounds.width === 32 && createBounds.height === 32);
    assert(createBounds.x - collapseBounds.x - collapseBounds.width >= 8);
    await page.screenshot({ path: path.join(artifacts, `sidebar-content-sized-${theme}.png`) });
    await collapse.click();
    for (const height of [900, 600, 450]) {
      await page.setViewportSize({ width: 1440, height });
      await page.waitForFunction(
        (height) => {
          const workspace = document.querySelector('#sidebar-workspace');
          const heading = document.querySelector('.sidebar-project-heading');
          const bounds = workspace.getBoundingClientRect();
          const naturalHeight = workspace.firstElementChild.getBoundingClientRect().height;
          return (
            (height < 600 || Math.abs(bounds.height - naturalHeight) <= 1) &&
            Math.abs(heading.getBoundingClientRect().top - bounds.bottom - 8) <= 1
          );
        },
        height,
        { timeout: 5000 },
      );
    }
    await page.screenshot({
      path: path.join(artifacts, `sidebar-projects-collapsed-${theme}.png`),
    });
    await sidebar.getByRole('button', { name: 'Expandir proyectos', exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await settings.click();
  await submenu.waitFor();
  assert(await submenu.evaluate((element) => parseFloat(getComputedStyle(element).rowGap) >= 4));
  await settings.click();
  pass(
    'Short workspace content keeps its natural height, collapsed Projects follows it at 900/600/450px, compact actions are spaced and the sidebar message is removed in both themes',
  );

  await search();
  const before = await work().boundingBox();
  await page.getByRole('button', { name: 'Ocultar bienvenida', exact: true }).click();
  assert.equal(await page.locator('.hero').count(), 0);
  await page.getByRole('button', { name: 'Ocultar indicadores', exact: true }).click();
  assert.equal(await page.locator('.stats-grid').count(), 0);
  assert((await work().boundingBox()).y < before.y - 100);
  await choose('tarjetas');
  await page.reload();
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
  assert.equal(await page.locator('.hero').count(), 0);
  assert.equal(await page.locator('.stats-grid').count(), 0);
  assert.equal(
    await work()
      .getByRole('button', { name: 'Vista de tarjetas', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  await search();
  pass(
    'Welcome banner and metrics hide independently, reclaim list space and persist after reload along with the selected view',
  );

  const expected = await json(
    admin,
    'GET',
    `/tasks?q=${encodeURIComponent(prefix)}&scope=open&assignee=mine-or-unassigned&page=1&sort=priority`,
  );
  assert.equal(expected.total, 52);
  for (const label of ['tarjetas', 'lista', 'tablero', 'cronología']) {
    await choose(label);
    assert.deepEqual(
      new Set(
        await matches()
          .allTextContents()
          .then(() =>
            matches().evaluateAll((elements) =>
              elements.map((element) =>
                element.getAttribute('aria-label').slice('Abrir pendiente: '.length),
              ),
            ),
          ),
      ),
      new Set(expected.items.map((task) => task.title)),
    );
    assert.equal(await page.getByLabel('Buscar pendientes').inputValue(), prefix);
    if (label === 'cronología') {
      assert.equal(
        await work()
          .getByRole('button', { name: /^Fecha límite de/ })
          .count(),
        expected.items.filter((task) => task.dueDate).length,
      );
      assert.equal(
        await work()
          .getByRole('region', { name: 'Pendientes sin fecha límite', exact: true })
          .getByRole('button')
          .count(),
        expected.items.filter((task) => !task.dueDate).length,
      );
    }
  }
  await work().getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.loading-line'));
  const second = await json(
    admin,
    'GET',
    `/tasks?q=${encodeURIComponent(prefix)}&scope=open&assignee=mine-or-unassigned&page=2&sort=priority`,
  );
  for (const label of ['tarjetas', 'lista', 'tablero', 'cronología']) {
    await choose(label);
    assert.equal(await matches().count(), second.items.length);
    assert.deepEqual(
      new Set(
        await matches().evaluateAll((elements) =>
          elements.map((element) =>
            element.getAttribute('aria-label').slice('Abrir pendiente: '.length),
          ),
        ),
      ),
      new Set(second.items.map((task) => task.title)),
    );
  }
  pass(
    'All four inbox views preserve search, assignee defaults and exactly the same task IDs across both pages beyond 50, including undated timeline work',
  );

  await page.getByRole('button', { name: 'Abrir filtros', exact: true }).click();
  const filters = page.getByRole('dialog', { name: 'Filtrar pendientes', exact: true });
  await filters.getByLabel('Filtrar por responsable').selectOption('all');
  await filters.getByLabel('Mostrar pendientes').selectOption('all');
  await filters.getByLabel('Filtrar por proyecto').selectOption(project.id);
  await filters.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.loading-line'));
  const all = await json(
    admin,
    'GET',
    `/tasks?project=${project.id}&q=${encodeURIComponent(prefix)}&scope=all&assignee=all&page=1&sort=priority`,
  );
  assert.equal(all.total, 54);
  for (const label of ['tarjetas', 'lista', 'tablero', 'cronología']) {
    await choose(label);
    assert.deepEqual(
      new Set(
        await matches().evaluateAll((elements) =>
          elements.map((element) =>
            element.getAttribute('aria-label').slice('Abrir pendiente: '.length),
          ),
        ),
      ),
      new Set(all.items.map((task) => task.title)),
    );
  }
  await matches().first().click();
  await page
    .getByRole('dialog', { name: 'Detalle del pendiente', exact: true })
    .getByLabel('Título', { exact: true })
    .waitFor();
  await page
    .getByRole('dialog', { name: 'Detalle del pendiente', exact: true })
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click();
  pass(
    'Project/owner/status filters produce equivalent cards, list, board and timeline, and timeline tasks open the normal detail editor',
  );

  for (const [width, height, theme] of [
    [1440, 900, 'dark'],
    [390, 844, 'light'],
    [320, 740, 'dark'],
    [844, 390, 'light'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    for (const label of ['tarjetas', 'lista', 'tablero', 'cronología']) {
      await choose(label);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (label === 'cronología' && width <= 640) {
        assert(
          await work()
            .locator('.task-timeline-scroll')
            .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        );
        assert(await work().locator('.task-timeline-date').first().isVisible());
      }
      for (const button of await work()
        .getByRole('group', { name: 'Vista de pendientes', exact: true })
        .getByRole('button')
        .all())
        assert((await button.boundingBox()).height >= 44);
      await page.screenshot({ path: path.join(artifacts, `inbox-${label}-${width}-${theme}.png`) });
    }
    if (width < 1024) {
      await page
        .getByRole('navigation', { name: 'Navegación móvil' })
        .getByRole('button', { name: 'Más', exact: true })
        .click();
      const more = page.getByRole('dialog', { name: 'Más opciones', exact: true });
      await more.getByRole('button', { name: 'Ajustes', exact: true }).click();
      await more.getByRole('button', { name: 'Workspace', exact: true }).click();
      await page.getByRole('heading', { name: 'Spaces', exact: true }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({
        path: path.join(artifacts, `settings-workspace-${width}-${theme}.png`),
      });
      await fresh();
      await search();
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  pass(
    'All inbox layouts, view controls and mobile Settings submenu fit desktop, phone, narrow phone and landscape in both themes with touch-sized targets',
  );

  const context = await page
    .context()
    .browser()
    .newContext({
      baseURL: 'http://localhost:4174',
      storageState: await support.storageState(),
      viewport: { width: 1440, height: 900 },
    });
  const spaceId = await page.getByLabel('Espacio activo').inputValue();
  await context.addInitScript(
    ({ userId, spaceId }) => localStorage.setItem('aegitasks-space-' + userId, spaceId),
    { userId: member.id, spaceId },
  );
  const userPage = await context.newPage();
  try {
    await userPage.goto('http://localhost:4174/#inbox');
    await userPage.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
    assert.equal(
      await userPage
        .getByRole('button', { name: 'Vista de lista', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await userPage.locator('.hero').count(), 1);
    assert.equal(await userPage.locator('.stats-grid').count(), 1);
    await userPage
      .locator('.sidebar')
      .getByRole('button', { name: 'Ajustes', exact: true })
      .click();
    assert.equal(
      await userPage
        .locator('.sidebar')
        .getByRole('navigation', { name: 'Submenú de ajustes' })
        .getByRole('button', { name: 'Usuarios y roles', exact: true })
        .count(),
      0,
    );
    await userPage.goto('http://localhost:4174/#settings/users');
    await userPage.getByRole('heading', { name: 'Página sin acceso', exact: true }).waitFor();
    assert.equal(await userPage.locator('.role-grid').count(), 0);
  } finally {
    await context.close();
  }
  pass(
    'View/summary preferences are isolated by user; User cannot see or open Users and Roles through the nested Settings route',
  );

  await fresh();
  await choose('lista');
  if (await page.getByRole('button', { name: 'Mostrar bienvenida', exact: true }).count())
    await page.getByRole('button', { name: 'Mostrar bienvenida', exact: true }).click();
  if (await page.getByRole('button', { name: 'Mostrar indicadores', exact: true }).count())
    await page.getByRole('button', { name: 'Mostrar indicadores', exact: true }).click();
  await json(admin, 'DELETE', `/projects/${project.id}`, undefined, 204);
  await page.goto('http://localhost:4174/');
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
}
