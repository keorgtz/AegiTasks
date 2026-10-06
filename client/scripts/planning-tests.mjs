import assert from 'node:assert/strict';
import path from 'node:path';

export async function testPlanningApi({ admin, support, personalAdmin, json, pass }) {
  const project = await json(admin, 'POST', '/projects', {
    name: 'Planning fixture',
    color: 'purple',
    estimateScheme: 'fibonacci',
  });
  const other = await json(admin, 'POST', '/projects', {
    name: 'Planning boundaries',
    color: 'blue',
  });
  const w = await json(admin, 'GET', '/workspace');
  const open = w.statuses.find((s) => s.projectId === project.id && !s.isDone);
  const done = w.statuses.find((s) => s.projectId === project.id && s.isDone);
  const input = (title, planning, resolved = false) => ({
    title,
    projectId: project.id,
    statusId: resolved ? done.id : open.id,
    tagIds: [],
    estimateMinutes: planning.estimateKind === 'time' ? 60 : null,
    planning,
  });
  const mod = await json(support, 'POST', '/modules', {
    projectId: project.id,
    name: 'Reservas',
    color: 'purple',
  });
  const mod2 = await json(admin, 'POST', '/modules', {
    projectId: project.id,
    name: 'Facturación',
    color: 'blue',
  });
  const cycle = await json(admin, 'POST', '/cycles', {
    projectId: project.id,
    name: 'Reservas de hoy',
    color: 'purple',
    startsOn: '2026-10-07',
    endsOn: '2026-10-07',
  });
  const cycle2 = await json(admin, 'POST', '/cycles', {
    projectId: project.id,
    name: 'Facturación de hoy',
    color: 'green',
    startsOn: cycle.startsOn,
    endsOn: cycle.endsOn,
  });
  assert.ok(mod.id && cycle.id);
  await json(
    admin,
    'POST',
    '/cycles',
    { projectId: project.id, name: 'Invalid dates', startsOn: '2026-10-08', endsOn: '2026-10-07' },
    400,
  );
  await json(admin, 'POST', '/modules', { projectId: project.id, name: '   ' }, 400);
  await json(admin, 'POST', '/modules', { projectId: project.id, name: mod.name }, 409);
  assert.equal((await json(admin, 'GET', `/projects/${project.id}/planning`)).project.percent, 0);
  pass(
    'Cycles and modules are optional project-scoped resources; same-day/parallel cycles and undated modules work, while invalid dates/names and duplicates are rejected',
  );
  const tasks = [];
  for (let i = 0; i < 10; i++) {
    const estimateKind =
      i === 2
        ? 'time'
        : i === 3
          ? 'categories'
          : i === 4
            ? 'points'
            : i === 5
              ? 'linear'
              : 'fibonacci';
    tasks.push(
      await json(
        admin,
        'POST',
        '/tasks',
        input(
          `Planning work ${i}`,
          {
            moduleId: i < 7 ? mod.id : mod2.id,
            cycleId: i < 7 ? cycle.id : cycle2.id,
            estimateKind,
            estimatePoints: i === 0 ? 3 : 5,
            estimateCategory: i === 3 ? 'M' : null,
          },
          i === 0 || i === 2,
        ),
      ),
    );
  }
  let progress = await json(admin, 'GET', `/projects/${project.id}/planning`);
  assert.equal(progress.project.total, 10);
  assert.equal(progress.project.percent, 20);
  assert.equal(progress.modules.find((m) => m.group.id === mod.id).progress.percent, 28.6);
  assert.equal(progress.cycles.find((m) => m.group.id === cycle.id).progress.total, 7);
  assert.equal(progress.project.estimates.find((e) => e.kind === 'time').total, 60);
  assert.equal(progress.project.estimates.find((e) => e.kind === 'time').percent, 100);
  assert.equal(progress.project.categories.find((c) => c.category === 'M').total, 1);
  assert.equal(progress.project.estimates.length, 4);
  assert.equal(
    (await json(admin, 'GET', `/tasks?project=${project.id}&module=${mod.id}&scope=all`)).total,
    7,
  );
  assert.equal(
    (await json(admin, 'GET', `/tasks?project=${project.id}&cycle=${cycle2.id}&scope=all`)).total,
    3,
  );
  assert.equal(
    (await json(admin, 'GET', `/tasks?project=${project.id}&module=none&scope=all`)).total,
    0,
  );
  await json(admin, 'GET', '/tasks?module=invalid', undefined, 400);
  pass(
    'Project/module/cycle progress uses every assignee and completed states, includes ungrouped work, and reports points, time and categories without mixing units',
  );
  const base = {
    moduleId: null,
    cycleId: null,
    estimateKind: 'fibonacci',
    estimatePoints: 4,
    estimateCategory: null,
  };
  await json(admin, 'POST', '/tasks', input('Bad Fibonacci', base), 400);
  await json(
    admin,
    'POST',
    '/tasks',
    input('Bad linear', { ...base, estimateKind: 'linear', estimatePoints: 11 }),
    400,
  );
  await json(
    admin,
    'POST',
    '/tasks',
    input('Bad points', { ...base, estimateKind: 'points', estimatePoints: -1 }),
    400,
  );
  await json(
    admin,
    'POST',
    '/tasks',
    input('Bad category', { ...base, estimateKind: 'categories', estimateCategory: 'XXL' }),
    400,
  );
  await json(admin, 'POST', '/tasks', input('Bad kind', { ...base, estimateKind: 'unknown' }), 400);
  const zero = await json(
    admin,
    'POST',
    '/tasks',
    input('Planning zero points', { ...base, estimatePoints: 0 }),
  );
  assert.equal(zero.estimatePoints, 0);
  const without = await json(
    admin,
    'POST',
    '/tasks',
    input('Planning no estimate', { ...base, estimateKind: 'none' }),
  );
  assert.equal(without.estimatePoints, null);
  assert.equal(without.estimateMinutes, null);
  const legacy = await json(admin, 'PUT', `/tasks/${tasks[0].id}`, { ...tasks[0], tagIds: [] });
  assert.equal(legacy.moduleId, mod.id);
  assert.equal(legacy.cycleId, cycle.id);
  assert.equal(legacy.estimatePoints, 3);
  await json(admin, 'PUT', `/projects/${project.id}`, { ...project, estimateScheme: 'categories' });
  assert.equal((await json(admin, 'GET', `/tasks/${tasks[0].id}`)).item.estimateKind, 'fibonacci');
  pass(
    'All estimate modes validate optional values including zero points; older task edits preserve planning and project defaults do not overwrite existing estimates',
  );
  const outsiderModule = await json(admin, 'POST', '/modules', {
    projectId: other.id,
    name: 'Other project',
  });
  await json(
    admin,
    'POST',
    '/tasks',
    input('Cross-project module', { ...base, estimatePoints: 3, moduleId: outsiderModule.id }),
    400,
  );
  const privateProject = await json(personalAdmin, 'POST', '/projects', {
    name: 'Private planning',
    color: 'purple',
  });
  const privateModule = await json(personalAdmin, 'POST', '/modules', {
    projectId: privateProject.id,
    name: 'Private module',
  });
  await json(
    admin,
    'POST',
    '/tasks',
    input('Cross-space module', { ...base, estimatePoints: 3, moduleId: privateModule.id }),
    400,
  );
  await json(
    admin,
    'PUT',
    `/modules/${privateModule.id}`,
    { ...privateModule, name: 'Blocked' },
    404,
  );
  await json(personalAdmin, 'GET', `/projects/${project.id}/planning`, undefined, 404);
  await json(personalAdmin, 'DELETE', `/projects/${privateProject.id}`, undefined, 204);
  const untouched = (await json(admin, 'GET', `/tasks/${tasks[1].id}`)).item;
  await json(
    admin,
    'POST',
    `/modules/${mod2.id}/tasks`,
    {
      tasks: [
        { id: tasks[0].id, version: tasks[0].version },
        { id: untouched.id, version: untouched.version },
      ],
    },
    409,
  );
  assert.equal(
    (await json(admin, 'GET', `/tasks/${untouched.id}`)).item.version,
    untouched.version,
  );
  await json(
    admin,
    'POST',
    `/modules/${outsiderModule.id}/tasks`,
    { tasks: [{ id: untouched.id, version: untouched.version }] },
    400,
  );
  await json(
    admin,
    'POST',
    `/modules/${mod2.id}/tasks`,
    { tasks: [{ id: untouched.id, version: untouched.version }], remove: true },
    400,
  );
  pass(
    'Group assignments reject foreign projects/spaces and stale batches atomically; removing work from another group is rejected',
  );
  const temp = await json(admin, 'POST', '/modules', {
    projectId: project.id,
    name: 'Temporary group',
  });
  await json(
    support,
    'POST',
    `/modules/${temp.id}/tasks`,
    { tasks: [{ id: untouched.id, version: untouched.version }] },
    204,
  );
  const moved = (await json(admin, 'GET', `/tasks/${untouched.id}`)).item;
  assert.equal(moved.moduleId, temp.id);
  assert.equal(moved.cycleId, cycle.id);
  await json(admin, 'DELETE', `/modules/${temp.id}`, undefined, 204);
  const retained = (await json(admin, 'GET', `/tasks/${untouched.id}`)).item;
  assert.equal(retained.moduleId, null);
  assert.equal(retained.cycleId, cycle.id);
  assert.notEqual(retained.version, moved.version);
  await json(admin, 'POST', `/tasks/${tasks[2].id}/archive`, {
    archived: true,
    version: tasks[2].version,
  });
  progress = await json(admin, 'GET', `/projects/${project.id}/planning`);
  assert.equal(progress.project.total, 11);
  assert.equal(progress.project.done, 1);
  const archived = (await json(admin, 'GET', `/tasks/${tasks[2].id}`)).item;
  await json(admin, 'POST', `/tasks/${archived.id}/archive`, {
    archived: false,
    version: archived.version,
  });
  await json(admin, 'DELETE', `/projects/${other.id}`, undefined, 204);
  await json(
    admin,
    'PUT',
    `/modules/${outsiderModule.id}`,
    { ...outsiderModule, name: 'Deleted' },
    404,
  );
  const permissions = (await json(admin, 'GET', '/roles')).permissions
    .filter((p) => p.roleName === 'User' && p.allowed)
    .map((p) => p.page);
  await json(
    admin,
    'PUT',
    '/roles/User/permissions',
    { pages: permissions.filter((p) => p !== 'projects') },
    204,
  );
  await json(support, 'GET', `/projects/${project.id}/planning`, undefined, 403);
  await json(
    support,
    'POST',
    `/cycles/${cycle.id}/tasks`,
    { tasks: [{ id: retained.id, version: retained.version }] },
    403,
  );
  await json(admin, 'PUT', '/roles/User/permissions', { pages: permissions }, 204);
  pass(
    'Deleting groups keeps tasks and the other grouping with a new edit version; archived work is excluded, project deletion cleans groups and page permissions apply',
  );
  for (let i = 0; i < 51; i++)
    await json(
      admin,
      'POST',
      '/tasks',
      input(`Planning selection ${i}`, { moduleId: null, cycleId: null, estimateKind: 'none' }),
    );
  return {
    project: { ...project, estimateScheme: 'categories' },
    mod,
    mod2,
    cycle,
    tasks,
    done,
    open,
    zero,
  };
}

export async function testPlanningUi({ page, admin, fixtures, json, pass, artifacts }) {
  for (const theme of ['light', 'dark'])
    for (const width of [1440, 390, 320, 844]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 900 });
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        localStorage.setItem('aegitasks-theme', t);
      }, theme);
      assert.equal(await page.getByLabel('Espacio activo').count(), 1);
      assert.ok(await page.locator('.app-header').getByLabel('Espacio activo').isVisible());
      const metrics = await page
        .locator('.app-header')
        .getByRole('button', { name: 'Mi cuenta', exact: true })
        .evaluate((e) => {
          const r = e.getBoundingClientRect();
          return { width: r.width, height: r.height, radius: getComputedStyle(e).borderRadius };
        });
      assert.equal(metrics.width, 44);
      assert.equal(metrics.height, 44);
      assert.equal(metrics.radius, '50%');
      const option = await page
        .getByLabel('Espacio activo')
        .locator('option')
        .first()
        .evaluate((e) => ({
          color: getComputedStyle(e).color,
          background: getComputedStyle(e).backgroundColor,
        }));
      assert.notEqual(option.color, option.background);
      if (theme === 'dark') assert.notEqual(option.background, 'rgb(255, 255, 255)');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(artifacts, `titlebar-${width}-${theme}.png`) });
    }
  pass(
    'One themed Space selector lives in the titlebar on desktop and phones; profile button stays exactly circular and layouts fit both themes',
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`http://localhost:4174/#project/${fixtures.project.id}`);
  await page.getByText('Planificación y avance', { exact: true }).click();
  await page.getByRole('button', { name: 'Módulos', exact: true }).click();
  await page.getByRole('button', { name: 'Crear módulo', exact: true }).click();
  await page.getByLabel('Nombre del módulo').fill('Nuevo módulo UI');
  await page.getByRole('button', { name: 'Guardar agrupación' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  let group = page.getByRole('article', { name: 'módulo Nuevo módulo UI', exact: true });
  await group.getByRole('button', { name: 'Agregar pendientes', exact: true }).click();
  let picker = page.getByRole('dialog', { name: 'Agregar pendientes al módulo' });
  await picker.locator('.planning-task-option').first().waitFor();
  const first = await picker
    .locator('.planning-task-option')
    .first()
    .locator('strong')
    .textContent();
  await picker.locator('.planning-task-option').first().getByRole('checkbox').check();
  await picker.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await picker.getByText('Página 2 de 2', { exact: true }).waitFor();
  await picker.locator('.planning-task-option').first().getByRole('checkbox').check();
  await picker.getByRole('button', { name: 'Agregar seleccionados' }).click();
  await picker.waitFor({ state: 'hidden' });
  const currentW = await json(admin, 'GET', '/workspace');
  let mod = currentW.modules.find((m) => m.name === 'Nuevo módulo UI');
  assert.equal(
    (await json(admin, 'GET', `/tasks?project=${fixtures.project.id}&module=${mod.id}&scope=all`))
      .total,
    2,
  );
  await group.getByRole('button', { name: 'Ver pendientes', exact: true }).click();
  await page.getByRole('button', { name: `Abrir pendiente: ${first}`, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Abrir filtros' }).click();
  assert.equal(await page.getByLabel('Filtrar por módulo').inputValue(), mod.id);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Vista de tablero' }).click();
  assert.equal(await page.locator('.board-task').count(), 2);
  pass(
    'Project modules can be created and populated across pages; opening the group filters list/board consistently without altering task status',
  );
  await page.getByRole('button', { name: 'Nuevo pendiente', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Planning UI estimated task');
  await page.locator('details.advanced').evaluate((d) => {
    d.open = true;
  });
  assert.equal(await page.getByLabel('Módulo (opcional)').inputValue(), mod.id);
  assert.equal(await page.getByLabel('Tipo de estimación').inputValue(), 'categories');
  await page.getByLabel('Ciclo (opcional)').selectOption(fixtures.cycle.id);
  await page.getByLabel('Tipo de estimación').selectOption('fibonacci');
  await page.getByLabel('Puntos (opcional)').selectOption('8');
  await page.getByRole('button', { name: 'Crear pendiente', exact: true }).click();
  await page.getByRole('heading', { name: 'Detalle del pendiente' }).waitFor();
  await page.getByText('Todos los cambios están guardados.', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Puntos (opcional)').inputValue(), '8');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page
    .getByRole('button', { name: 'Abrir pendiente: Planning UI estimated task', exact: true })
    .click();
  await page.getByLabel('Estado', { exact: true }).selectOption(fixtures.done.id);
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByText('Todos los cambios están guardados.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await group.getByText('33.3%', { exact: true }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(artifacts, 'planning-desktop-dark.png'),
    fullPage: false,
  });
  pass(
    'Task editor inherits the optional group and project estimate default, persists Fibonacci points and updates group progress when the task is completed',
  );
  await page
    .getByRole('button', { name: 'Abrir pendiente: Planning UI estimated task', exact: true })
    .click();
  for (const [kind, label, value] of [
    ['points', 'Story points (opcional)', '0'],
    ['linear', 'Puntos (opcional)', '0'],
    ['categories', 'Categoría (opcional)', 'XS'],
    ['time', 'Estimación en minutos (opcional)', '25'],
    ['none', null, null],
    ['fibonacci', 'Puntos (opcional)', '8'],
  ]) {
    await page.getByLabel('Tipo de estimación').selectOption(kind);
    if (label) {
      if (kind === 'points' || kind === 'time') await page.getByLabel(label).fill(value);
      else await page.getByLabel(label).selectOption(value);
    }
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('dialog fieldset')?.disabled);
    const stored = (
      await json(
        admin,
        'GET',
        `/tasks?project=${fixtures.project.id}&q=${encodeURIComponent('Planning UI estimated task')}&scope=all`,
      )
    ).items[0];
    assert.equal(stored.estimateKind, kind);
    assert.equal(
      stored.estimatePoints,
      ['points', 'linear', 'fibonacci'].includes(kind) ? Number(value) : null,
    );
    assert.equal(stored.estimateMinutes, kind === 'time' ? 25 : null);
    assert.equal(stored.estimateCategory, kind === 'categories' ? 'XS' : null);
  }
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  pass(
    'Every estimate control saves its own optional value, including zero Story/linear points; switching type clears incompatible values and preserves group membership',
  );
  await group.getByRole('button', { name: 'Editar módulo Nuevo módulo UI' }).click();
  await page.getByLabel('Nombre del módulo').fill('Módulo renombrado UI');
  await page.getByRole('button', { name: 'Guardar agrupación' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Ciclos', exact: true }).click();
  await page.getByRole('button', { name: 'Crear ciclo', exact: true }).click();
  await page.getByLabel('Nombre del ciclo').fill('Ciclo móvil UI');
  await page.getByLabel('Fecha inicial (opcional)').fill('2026-10-08');
  await page.getByLabel('Fecha final (opcional)').fill('2026-10-08');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(artifacts, 'planning-cycle-mobile.png') });
  assert.ok(await page.getByRole('dialog').evaluate((d) => d.scrollWidth <= d.clientWidth));
  await page.getByRole('button', { name: 'Guardar agrupación' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('article', { name: 'ciclo Ciclo móvil UI' }).waitFor();
  await page.getByRole('button', { name: 'Módulos', exact: true }).click();
  group = page.getByRole('article', { name: 'módulo Módulo renombrado UI' });
  await group.getByRole('button', { name: 'Agregar pendientes', exact: true }).click();
  picker = page.getByRole('dialog', { name: 'Agregar pendientes al módulo' });
  await picker.locator('.planning-task-option').first().waitFor();
  await page.screenshot({ path: path.join(artifacts, 'planning-picker-mobile.png') });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.keyboard.press('Escape');
  page.once('dialog', (d) => d.accept());
  await group.getByRole('button', { name: 'Eliminar módulo Módulo renombrado UI' }).click();
  await group.waitFor({ state: 'hidden' });
  const found = await json(
    admin,
    'GET',
    `/tasks?project=${fixtures.project.id}&q=${encodeURIComponent('Planning UI estimated task')}&scope=all`,
  );
  assert.equal(found.items[0].moduleId, null);
  assert.equal(found.items[0].cycleId, fixtures.cycle.id);
  assert.equal(found.items[0].estimatePoints, 8);
  pass(
    'Modules edit/delete safely, single-day cycle creation and paginated task dialog fit phones; deletion keeps tasks, estimates and cycle membership',
  );
  await json(admin, 'DELETE', `/projects/${fixtures.project.id}`, undefined, 204);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('http://localhost:4174/#inbox');
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
}
