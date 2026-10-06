import assert from 'node:assert/strict';
import path from 'node:path';
import { testProjectNavigation } from './project-navigation-tests.mjs';

export async function testPlanningViews({ page, admin, support, fixtures, json, pass, artifacts }) {
  await testProjectNavigation({ page, admin, fixtures, json, pass, artifacts });
  await page.setViewportSize({ width: 1440, height: 900 });
  const project = fixtures.project;
  const base = `http://localhost:4174/#project/${project.id}`;
  const nav = () => page.getByRole('navigation', { name: 'Secciones del proyecto' });
  const manager = () => page.getByRole('region', { name: /^Gestión de/ });
  const layout = () => page.getByRole('group', { name: 'Vista de agrupaciones' });
  const localDay = (offset = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const cycles = [];
  for (const [name, startsOn, endsOn] of [
    ['Ciclo actual de vistas', localDay(), localDay()],
    ['Próximo ciclo de vistas', localDay(2), localDay(7)],
    ['Periodo anterior de vistas', localDay(-7), localDay(-1)],
    ['Ciclo sin fechas de vistas', null, null],
    ['Ciclo con fecha parcial', localDay(-1), null],
  ])
    cycles.push(
      await json(admin, 'POST', '/cycles', {
        projectId: project.id,
        name,
        startsOn,
        endsOn,
        color: 'purple',
      }),
    );
  await page.goto(base);
  await nav().getByRole('button', { name: 'Módulos', exact: true }).click();
  await page.getByRole('heading', { name: 'Módulos', exact: true }).waitFor();
  await manager()
    .getByRole('article', { name: `módulo ${fixtures.mod.name}`, exact: true })
    .waitFor();
  const initialCount = await manager().getByRole('article').count();
  for (const name of ['Lista', 'Tablero', 'Tarjetas']) {
    await layout().getByRole('button', { name, exact: true }).click();
    assert.equal(await manager().getByRole('article').count(), initialCount);
  }
  await layout().getByRole('button', { name: 'Cronología', exact: true }).click();
  await page.getByRole('heading', { name: /^Sin programar/ }).waitFor();
  assert.equal(await page.locator('.planning-unscheduled button').count(), initialCount);
  await page.reload();
  assert.equal(
    await layout().getByRole('button', { name: 'Cronología' }).getAttribute('aria-pressed'),
    'true',
  );
  await layout().getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByLabel('Buscar módulos').fill(fixtures.mod.name);
  assert.equal(await manager().getByRole('article').count(), 1);
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page.getByLabel('Avance', { exact: true }).selectOption('empty');
  await page.getByRole('button', { name: 'Ver resultados', exact: true }).click();
  assert.equal(await manager().getByRole('article').count(), 0);
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  pass(
    'Dedicated module pages offer equivalent gallery/list/board/timeline, persistent layout, search and progress filters without hiding undated modules',
  );

  await nav().getByRole('button', { name: 'Ciclos', exact: true }).click();
  await manager()
    .getByRole('article', { name: 'ciclo Ciclo actual de vistas', exact: true })
    .waitFor();
  await layout().getByRole('button', { name: 'Tablero', exact: true }).click();
  for (const [section, name] of [
    ['En curso', cycles[0].name],
    ['Próximos', cycles[1].name],
    ['Periodo finalizado', cycles[2].name],
    ['Sin periodo definido', cycles[3].name],
    ['Sin periodo definido', cycles[4].name],
  ]) {
    assert.equal(
      await page
        .getByRole('region', { name: section, exact: true })
        .getByRole('article', { name: `ciclo ${name}`, exact: true })
        .count(),
      1,
    );
  }
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page.getByLabel('Periodo', { exact: true }).selectOption('active');
  await page.getByLabel('Ordenar por', { exact: true }).selectOption('date');
  await page.getByRole('button', { name: 'Ver resultados', exact: true }).click();
  const classified = await json(admin, 'GET', `/projects/${project.id}/planning`);
  assert.equal(
    await manager().getByRole('article').count(),
    classified.cycles.filter(
      ({ group }) =>
        group.startsOn &&
        group.endsOn &&
        group.startsOn <= localDay() &&
        group.endsOn >= localDay(),
    ).length,
  );
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await layout().getByRole('button', { name: 'Cronología', exact: true }).click();
  assert.equal(
    await page.locator('.planning-timeline-row').count(),
    classified.cycles.filter(({ group }) => group.startsOn || group.endsOn).length,
  );
  assert.equal((await page.locator('.planning-today-marker').count()) > 0, true);
  pass(
    'Cycle board and filters classify current, future, past and partial/undated periods; timeline keeps dated groups and marks today without completing tasks',
  );

  await nav().getByRole('button', { name: 'Módulos', exact: true }).click();
  await page.getByRole('button', { name: 'Crear módulo', exact: true }).click();
  await page.getByLabel('Nombre del módulo').fill('Gestión dedicada UI');
  await page
    .getByLabel('Descripción de la agrupación (opcional)')
    .fill('Objetivo del módulo de soporte');
  await page.getByRole('button', { name: 'Guardar agrupación' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'Gestión dedicada UI', exact: true }).waitFor();
  let mod = (await json(admin, 'GET', '/workspace')).modules.find(
    (m) => m.name === 'Gestión dedicada UI',
  );
  assert.ok(page.url().endsWith(`/modules/${mod.id}`));
  await page.getByRole('button', { name: 'Agregar existentes', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Agregar pendientes al módulo', exact: true });
  await picker.getByLabel('Buscar pendientes para agrupar').fill(fixtures.zero.title);
  const option = picker.locator('.planning-task-option').filter({ hasText: fixtures.zero.title });
  await option.getByRole('checkbox').check();
  await picker.getByRole('button', { name: 'Agregar seleccionados' }).click();
  await picker.waitFor({ state: 'hidden' });
  let task = (await json(admin, 'GET', `/tasks/${fixtures.zero.id}`)).item;
  assert.equal(task.moduleId, mod.id);
  const otherCycle = task.cycleId;
  await page.getByLabel(`Estado de ${task.title}`, { exact: true }).selectOption(fixtures.done.id);
  await page.getByText('1 de 1 resueltos', { exact: true }).waitFor();
  assert.equal((await json(admin, 'GET', `/tasks/${task.id}`)).item.statusId, fixtures.done.id);
  await page
    .getByRole('group', { name: 'Vista de pendientes de la agrupación' })
    .getByRole('button', { name: 'Tablero', exact: true })
    .click();
  assert.equal(
    await page
      .getByRole('region', { name: `Estado ${fixtures.done.name}`, exact: true })
      .getByRole('article', { name: `Pendiente ${task.title}`, exact: true })
      .count(),
    1,
  );
  await page.getByRole('button', { name: `Quitar ${task.title} del módulo`, exact: true }).click();
  await page.getByText('0 de 0 resueltos', { exact: true }).waitFor();
  task = (await json(admin, 'GET', `/tasks/${task.id}`)).item;
  assert.equal(task.moduleId, null);
  assert.equal(task.cycleId, otherCycle);
  assert.equal(task.statusId, fixtures.done.id);
  pass(
    'Module detail creates deep links, adds existing work, updates custom task status and removes membership while preserving tasks, cycle and estimates',
  );

  await page.getByRole('button', { name: 'Nuevo pendiente', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Nuevo desde detalle del módulo');
  await page.locator('details.advanced').evaluate((d) => {
    d.open = true;
  });
  assert.equal(await page.getByLabel('Módulo (opcional)').inputValue(), mod.id);
  await page.getByRole('button', { name: 'Crear pendiente', exact: true }).click();
  await page.getByText('Todos los cambios están guardados.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByLabel('Estado de Nuevo desde detalle del módulo', { exact: true }).waitFor();
  const newTask = (
    await json(admin, 'GET', `/tasks?project=${project.id}&q=Nuevo%20desde%20detalle&scope=all`)
  ).items[0];
  await page.route(
    `**/api/tasks/${newTask.id}/status`,
    async (route) => {
      const live = (await json(admin, 'GET', `/tasks/${newTask.id}`)).item;
      await json(admin, 'PUT', `/tasks/${newTask.id}/status`, {
        version: live.version,
        statusId: fixtures.done.id,
      });
      await route.continue();
    },
    { times: 1 },
  );
  await page
    .getByLabel(`Estado de ${newTask.title}`, { exact: true })
    .selectOption(fixtures.done.id);
  await page.getByRole('alert').filter({ hasText: 'El pendiente cambió' }).waitFor();
  await page.getByText('1 de 1 resueltos', { exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').filter({ hasText: 'El pendiente cambió' }).count(), 1);
  await page
    .getByLabel(`Estado de ${newTask.title}`, { exact: true })
    .selectOption(fixtures.open.id);
  await page.getByText('0 de 1 resueltos', { exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  pass(
    'New detail tasks inherit their group; concurrent status edits show a persistent conflict, refresh versions and allow a safe retry',
  );

  const selection = (
    await json(admin, 'GET', `/tasks?project=${project.id}&q=Planning%20selection&scope=all`)
  ).items;
  await json(
    admin,
    'POST',
    `/modules/${mod.id}/tasks`,
    {
      tasks: selection.map((t) => ({ id: t.id, version: t.version })),
    },
    204,
  );
  await page
    .getByRole('group', { name: 'Vista de pendientes de la agrupación' })
    .getByRole('button', { name: 'Lista', exact: true })
    .click();
  await page.getByText('51 pendientes · página 1 de 2', { exact: true }).waitFor();
  assert.equal(await page.locator('.planning-detail-task').count(), 50);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByText('51 pendientes · página 2 de 2', { exact: true }).waitFor();
  assert.equal(await page.locator('.planning-detail-task').count(), 1);
  await page.reload();
  await page.getByRole('heading', { name: mod.name, exact: true }).waitFor();
  await page.getByText('51 pendientes · página 1 de 2', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Editar módulo', exact: true }).click();
  await page.getByLabel('Nombre del módulo').fill('Gestión dedicada renombrada UI');
  await page.getByRole('button', { name: 'Guardar agrupación' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page
    .getByRole('heading', { name: 'Gestión dedicada renombrada UI', exact: true })
    .waitFor();
  pass(
    'Dedicated detail handles more than 50 tasks with honest paginated list/board counts, survives reload and edits metadata from its page',
  );

  for (const theme of ['light', 'dark']) {
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
      [320, 740],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        localStorage.setItem('aegitasks-theme', t);
      }, theme);
      for (const kind of ['modules', 'cycles']) {
        await page.goto(`${base}/${kind}`);
        await page
          .getByRole('heading', { name: kind === 'modules' ? 'Módulos' : 'Ciclos', exact: true })
          .waitFor();
        for (const name of ['Tarjetas', 'Lista', 'Tablero', 'Cronología']) {
          await layout().getByRole('button', { name, exact: true }).click();
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `${kind} ${name} ${width} ${theme}`,
          );
          if ((width === 1440 && theme === 'dark') || (width === 390 && theme === 'light'))
            await page.screenshot({
              path: path.join(artifacts, `planning-views-${kind}-${name}-${width}-${theme}.png`),
            });
        }
      }
      await page.goto(`${base}/modules/${mod.id}`);
      await page.getByText('51 pendientes · página 1 de 2', { exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: path.join(artifacts, `planning-detail-${width}-${theme}.png`),
        });
      if (width === 390) {
        await page.locator('.planning-detail-work').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: path.join(artifacts, `planning-detail-tasks-${width}-${theme}.png`),
        });
      }
    }
  }
  pass(
    'All four management layouts and task detail fit desktop, phone, narrow phone and landscape in light/dark with no page overflow',
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Eliminar módulo Gestión dedicada renombrada UI', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Módulos', exact: true }).waitFor();
  assert.equal((await json(admin, 'GET', `/tasks/${newTask.id}`)).item.moduleId, null);
  await page.goto(`${base}/modules/${mod.id}`);
  await page
    .getByRole('heading', { name: 'Este módulo ya no está disponible', exact: true })
    .waitFor();
  await page.goto(`${base}/cycles`);
  await page.getByRole('button', { name: 'Crear ciclo', exact: true }).click();
  await page.getByLabel('Nombre del ciclo').fill('Ciclo desde gestión UI');
  await page.getByLabel('Fecha inicial (opcional)').fill(localDay());
  await page.getByLabel('Fecha final (opcional)').fill(localDay());
  await page.getByRole('button', { name: 'Guardar agrupación' }).click();
  await page.getByRole('heading', { name: 'Ciclo desde gestión UI', exact: true }).waitFor();
  const cycle = (await json(admin, 'GET', '/workspace')).cycles.find(
    (c) => c.name === 'Ciclo desde gestión UI',
  );
  const latest = (await json(admin, 'GET', `/tasks/${newTask.id}`)).item;
  await json(
    admin,
    'POST',
    `/cycles/${cycle.id}/tasks`,
    {
      tasks: [{ id: latest.id, version: latest.version }],
    },
    204,
  );
  await page.getByLabel(`Estado de ${latest.title}`, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Editar ciclo', exact: true }).click();
  await page.getByLabel('Nombre del ciclo').fill('Ciclo renombrado desde gestión UI');
  await page.getByRole('button', { name: 'Guardar agrupación' }).click();
  await page
    .getByRole('heading', { name: 'Ciclo renombrado desde gestión UI', exact: true })
    .waitFor();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Eliminar ciclo Ciclo renombrado desde gestión UI', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Ciclos', exact: true }).waitFor();
  const retained = (await json(admin, 'GET', `/tasks/${latest.id}`)).item;
  assert.equal(retained.cycleId, null);
  assert.equal(retained.title, latest.title);
  pass(
    'Both management pages create/edit/delete groups, preserve linked tasks and provide a safe missing-group screen for stale deep links',
  );
  const allowed = (await json(admin, 'GET', '/roles')).permissions
    .filter((p) => p.roleName === 'User' && p.allowed)
    .map((p) => p.page);
  const user = await json(support, 'GET', '/auth/me');
  const spaceId = await page.getByLabel('Espacio activo').inputValue();
  const context = await page
    .context()
    .browser()
    .newContext({ storageState: await support.storageState() });
  await context.addInitScript(
    ({ userId, spaceId }) => localStorage.setItem(`aegitasks-space-${userId}`, spaceId),
    { userId: user.id, spaceId },
  );
  const userPage = await context.newPage();
  try {
    await json(
      admin,
      'PUT',
      '/roles/User/permissions',
      { pages: allowed.filter((p) => p !== 'projects') },
      204,
    );
    for (const kind of ['modules', 'cycles']) {
      await userPage.goto(`${base}/${kind}`);
      await userPage.getByRole('heading', { name: 'Página sin acceso', exact: true }).waitFor();
      assert.equal(await userPage.locator('.planning-page').count(), 0);
    }
    await json(
      admin,
      'PUT',
      '/roles/User/permissions',
      { pages: allowed.filter((p) => p !== 'tasks') },
      204,
    );
    await userPage.goto(`${base}/modules/${fixtures.mod.id}`);
    await userPage.getByRole('heading', { name: fixtures.mod.name, exact: true }).waitFor();
    await userPage
      .getByText('El detalle de pendientes requiere permiso de la vista Pendientes.', {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await userPage.getByRole('button', { name: 'Agregar existentes', exact: true }).count(),
      0,
    );
    assert.equal(
      await userPage.getByRole('button', { name: 'Nuevo pendiente', exact: true }).count(),
      0,
    );
    assert.equal(
      await userPage
        .getByRole('navigation', { name: 'Secciones del proyecto' })
        .getByRole('button', { name: 'Pendientes', exact: true })
        .count(),
      0,
    );
  } finally {
    await json(admin, 'PUT', '/roles/User/permissions', { pages: allowed }, 204);
    await context.close();
  }
  pass(
    'Direct module/cycle routes enforce Projects permission, and project-only users see progress without task actions or detail access',
  );
}
