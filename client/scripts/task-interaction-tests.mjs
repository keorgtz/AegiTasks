import assert from 'node:assert/strict';
import path from 'node:path';
import { chooseTaskStatus } from './task-status-helpers.mjs';

export async function testTaskInteractions({
  page,
  admin,
  adminUser,
  member,
  json,
  pass,
  artifacts,
}) {
  const prefix = 'Task interactions';
  const a = await json(admin, 'POST', '/projects', {
    name: 'Interactive board A',
    color: 'purple',
  });
  const b = await json(admin, 'POST', '/projects', { name: 'Interactive board B', color: 'blue' });
  const w = await json(admin, 'GET', '/workspace');
  const states = (id) =>
    w.statuses.filter((s) => s.projectId === id).sort((x, y) => x.position - y.position);
  const [open, next] = states(a.id);
  const done = states(a.id).find((s) => s.isDone);
  const make = (title, dueDate, extra = {}) =>
    json(admin, 'POST', '/tasks', {
      title,
      dueDate,
      projectId: a.id,
      statusId: open.id,
      tagIds: [],
      assigneeId: adminUser.id,
      ...extra,
    });
  let drag;
  for (let i = 0; i < 53; i++) {
    const task = await make(
      `${prefix} ${i === 0 ? 'Drag' : String(i).padStart(2, '0')}`,
      i === 52 ? '2028-02-29' : '2028-02-10',
      { priority: i === 0 ? 4 : null },
    );
    if (i === 0) drag = task;
  }
  await make(prefix + ' Other owner', '2028-02-10', { assigneeId: member.id });
  const undated = await make(prefix + ' Undated', null);
  await make(prefix + ' Previous month', '2028-01-31');
  await make(prefix + ' Next month', '2028-03-01');
  await make(prefix + ' Other project', '2028-02-10', {
    projectId: b.id,
    statusId: states(b.id)[0].id,
    priority: 4,
  });
  const range = `project=${a.id}&scope=all&assignee=all&dueFrom=2028-02-01&dueTo=2028-02-29`;
  const first = await json(admin, 'GET', '/tasks?' + range);
  const second = await json(admin, 'GET', '/tasks?' + range + '&page=2');
  assert.equal(first.total, 54);
  assert.equal(second.items.length, 4);
  assert.equal(new Set([...first.items, ...second.items].map((t) => t.id)).size, 54);
  assert([...first.items, ...second.items].some((t) => t.dueDate === '2028-02-29'));
  assert.equal(
    (
      await json(
        admin,
        'GET',
        '/tasks?' + range.replace('assignee=all', 'assignee=mine-or-unassigned'),
      )
    ).total,
    53,
  );
  assert.deepEqual(
    (await json(admin, 'GET', `/tasks?project=${a.id}&withoutDueDate=true&scope=all`)).items.map(
      (t) => t.id,
    ),
    [undated.id],
  );
  await json(admin, 'GET', '/tasks?dueFrom=2028-03-01&dueTo=2028-02-01', undefined, 400);
  await json(admin, 'GET', '/tasks?dueFrom=2028-02-01&withoutDueDate=true', undefined, 400);
  pass(
    'Calendar date queries include leap-day boundaries, paginate beyond 50, isolate project/owner and keep undated tasks separate',
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://localhost:4174/#inbox');
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
  const work = page.locator('.work-section');
  const choose = (label) =>
    work.getByRole('button', { name: 'Vista de ' + label, exact: true }).click();
  await choose('lista');
  await page.getByLabel('Buscar pendientes', { exact: true }).fill(prefix);
  await page.getByRole('button', { name: 'Abrir filtros', exact: true }).click();
  const filters = page.getByRole('dialog', { name: 'Filtrar pendientes', exact: true });
  await filters.getByLabel('Mostrar pendientes').selectOption('all');
  await filters.getByLabel('Filtrar por responsable').selectOption('all');
  await filters.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await work
    .getByRole('button', { name: 'Cambiar estado de ' + drag.title, exact: true })
    .waitFor();
  const waitState = async (state) => {
    await page.waitForFunction(
      ({ title, state }) => {
        const button = Array.from(
          document.querySelectorAll('.app-content .task-status-button'),
        ).find((b) => b.getAttribute('aria-label') === 'Cambiar estado de ' + title);
        return button && !button.disabled && button.textContent.includes(state);
      },
      { title: drag.title, state: state.name },
      { timeout: 10000 },
    );
    assert.equal((await json(admin, 'GET', `/tasks/${drag.id}`)).item.statusId, state.id);
    assert.equal(
      await page.getByRole('dialog', { name: 'Detalle del pendiente', exact: true }).count(),
      0,
    );
  };
  for (const [label, state] of [
    ['lista', next],
    ['tarjetas', open],
    ['cronología', next],
  ]) {
    await choose(label);
    await waitState(state === next && label === 'lista' ? open : state === open ? next : open);
    await chooseTaskStatus(page, drag.title, state);
    await waitState(state);
  }
  pass(
    'List, gallery and timeline change custom task states with a quick dialog without opening full details',
  );

  await choose('tablero');
  await waitState(next);
  const columns = work.locator(`[data-status-id="${open.id}"]`);
  const handle = () => page.getByRole('button', { name: 'Mover ' + drag.title, exact: true });
  const mouseDrag = async (target, sourceHandle = handle()) => {
    await sourceHandle.hover();
    const from = await sourceHandle.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 3 });
    await page.locator('.task-draggable.is-dragging').waitFor({ timeout: 5000 });
    await target.scrollIntoViewIfNeeded();
    const to = await target.boundingBox();
    await page.mouse.move(to.x + to.width / 2, to.y + 65, { steps: 12 });
    await page.mouse.up();
  };
  await mouseDrag(columns);
  await waitState(open);
  await handle().focus();
  await page.keyboard.press('Space');
  // Let the sensor attach its document listener and paint the drag overlay.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await work.locator('[data-status-id="' + open.id + '"].is-over').waitFor({ timeout: 5000 });
  await page.keyboard.press('ArrowRight');
  await work.locator('[data-status-id="' + next.id + '"].is-over').waitFor({ timeout: 5000 });
  await page.keyboard.press('Space');
  // Let the sensor attach its document listener and paint the drag overlay.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await waitState(next);
  const lastHandle = columns.getByRole('button', { name: /^Mover / }).last();
  const lastTitle = (await lastHandle.getAttribute('aria-label')).slice('Mover '.length);
  const lastTask = (
    await json(admin, 'GET', `/tasks?project=${a.id}&scope=all&q=${encodeURIComponent(lastTitle)}`)
  ).items.find((task) => task.title === lastTitle);
  await mouseDrag(
    work.locator(`[data-status-id="${next.id}"]`),
    page.getByRole('button', { name: 'Mover ' + lastTitle, exact: true }),
  );
  await page.waitForFunction(
    ({ title, state }) =>
      Array.from(document.querySelectorAll('.task-status-button')).some(
        (button) =>
          button.getAttribute('aria-label') === 'Cambiar estado de ' + title &&
          button.textContent.includes(state) &&
          !button.disabled,
      ),
    { title: lastTitle, state: next.name },
    { timeout: 10000 },
  );
  assert.equal((await json(admin, 'GET', `/tasks/${lastTask.id}`)).item.statusId, next.id);
  assert(await columns.evaluate((element) => element.scrollHeight > element.clientHeight));
  const version = (await json(admin, 'GET', `/tasks/${drag.id}`)).item.version;
  await handle().focus();
  await page.keyboard.press('Space');
  // Let the sensor attach its document listener and paint the drag overlay.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  assert.equal((await json(admin, 'GET', `/tasks/${drag.id}`)).item.version, version);
  await mouseDrag(work.locator(`[data-status-id="${states(b.id)[0].id}"]`));
  assert.equal((await json(admin, 'GET', `/tasks/${drag.id}`)).item.version, version);
  await page.screenshot({ path: path.join(artifacts, 'tasks-drag-board-dark.png') });
  pass(
    'Kanban mouse and keyboard moves persist status; Escape and cross-project drops leave the task untouched',
  );

  await page.route(
    `**/api/tasks/${drag.id}/status`,
    async (route) => {
      const live = (await json(admin, 'GET', `/tasks/${drag.id}`)).item;
      await json(admin, 'PUT', `/tasks/${drag.id}/status`, {
        statusId: open.id,
        version: live.version,
      });
      await route.continue();
    },
    { times: 1 },
  );
  await chooseTaskStatus(page, drag.title, done);
  await page.getByRole('alert').filter({ hasText: 'El pendiente cambió' }).waitFor();
  await waitState(open);
  await chooseTaskStatus(page, drag.title, next);
  await waitState(next);
  assert.equal(await page.getByRole('alert').filter({ hasText: 'El pendiente cambió' }).count(), 0);
  pass(
    'Quick status changes reject stale versions, show a persistent conflict and refresh safely for retry',
  );

  for (const kind of ['modules', 'cycles']) {
    const group = await json(admin, 'POST', '/' + kind, {
      projectId: a.id,
      name: 'Drag ' + kind,
      color: 'purple',
    });
    const live = (await json(admin, 'GET', '/tasks/' + drag.id)).item;
    await json(
      admin,
      'POST',
      '/' + kind + '/' + group.id + '/tasks',
      { tasks: [{ id: drag.id, version: live.version }] },
      204,
    );
    await page.goto('http://localhost:4174/#project/' + a.id + '/' + kind + '/' + group.id);
    await page.getByRole('heading', { name: group.name, exact: true }).waitFor();
    await page.getByRole('button', { name: 'Tablero', exact: true }).click();
    await waitState(kind === 'modules' ? next : open);
    if (kind === 'modules') await mouseDrag(page.locator('[data-status-id="' + open.id + '"]'));
    else {
      await handle().focus();
      await page.keyboard.press('Space');
      // Let the sensor attach its document listener and paint the drag overlay.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await page.locator('[data-status-id="' + open.id + '"].is-over').waitFor({ timeout: 5000 });
      await page.keyboard.press('ArrowRight');
      await page.locator('[data-status-id="' + next.id + '"].is-over').waitFor({ timeout: 5000 });
      await page.keyboard.press('Space');
      // Let the sensor attach its document listener and paint the drag overlay.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
    }
    await waitState(kind === 'modules' ? open : next);
    if (kind === 'cycles') {
      await page.setViewportSize({ width: 390, height: 1000 });
      await handle().scrollIntoViewIfNeeded();
      const from = await handle().boundingBox();
      const to = await page.locator('[data-status-id="' + open.id + '"]').boundingBox();
      assert(to.y >= 0 && to.y + 65 < 1000, 'Touch target must be visible');
      const touch = await page.context().newCDPSession(page);
      await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      const point = (x, y) => [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
      const x = from.x + from.width / 2,
        y = from.y + from.height / 2;
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: point(x, y),
      });
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: point(x + 12, y),
      });
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: point(to.x + to.width / 2, to.y + 65),
      });
      await page.locator('[data-status-id="' + open.id + '"].is-over').waitFor({ timeout: 5000 });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await waitState(open);
      await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await touch.detach();
      await page.screenshot({ path: path.join(artifacts, 'group-board-touch.png') });
    }
    await page.getByRole('button', { name: 'Calendario', exact: true }).click();
    await page.getByLabel('Mes del calendario').fill('2028-02');
    await page.getByRole('button', { name: /^jueves, 10 de febrero de 2028:/ }).click();
    await page
      .getByRole('button', { name: 'Cambiar estado de ' + drag.title, exact: true })
      .waitFor();
    assert.equal(
      (
        await json(
          admin,
          'GET',
          '/tasks?' + range + '&' + (kind === 'modules' ? 'module' : 'cycle') + '=' + group.id,
        )
      ).total,
      1,
    );
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  pass(
    'Module and cycle task boards share persistent mouse/keyboard/touch dragging and their calendars preserve group membership',
  );
  await page.goto('http://localhost:4174/#inbox');
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
  await page.getByLabel('Buscar pendientes', { exact: true }).fill(prefix);
  await page.getByRole('button', { name: 'Abrir filtros', exact: true }).click();
  await filters.getByLabel('Mostrar pendientes').selectOption('all');
  await filters.getByLabel('Filtrar por responsable').selectOption('all');
  await filters.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await choose('calendario');
  await page.getByLabel('Mes del calendario', { exact: true }).fill('2028-02');
  await page.waitForFunction(
    () =>
      !document.querySelector('.loading-line') &&
      document.querySelector('.calendar-caption')?.textContent.includes('55 pendientes'),
    undefined,
    { timeout: 10000 },
  );
  await work.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await work
    .getByRole('button', { name: 'Abrir pendiente: ' + prefix + ' 52', exact: true })
    .waitFor();
  await work.getByRole('button', { name: 'Anterior', exact: true }).click();
  await waitState(open);
  await page.getByRole('button', { name: 'Mes siguiente', exact: true }).click();
  await work
    .getByRole('button', { name: 'Abrir pendiente: ' + prefix + ' Next month', exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Mes anterior', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    for (const [width, height] of [
      [1440, 1000],
      [390, 844],
      [320, 740],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.getByRole('button', { name: /^jueves, 10 de febrero de 2028:/ }).click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const status = work.getByRole('button', {
        name: 'Cambiar estado de ' + drag.title,
        exact: true,
      });
      assert.equal(await status.count(), 1);
      await status.click();
      const dialog = page.getByRole('dialog', { name: 'Cambiar estado', exact: true });
      assert(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth));
      await page.keyboard.press('Escape');
      await page.screenshot({ path: path.join(artifacts, `task-calendar-${width}-${theme}.png`) });
      if (width < 900) {
        await page.locator('.calendar-toolbar').scrollIntoViewIfNeeded();
        await page.screenshot({
          path: path.join(artifacts, `task-calendar-grid-${width}-${theme}.png`),
        });
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Hoy', exact: true }).click();
  await page.locator('.calendar-day-number[aria-current="date"]').waitFor();
  await page
    .locator('.calendar-day:not(.outside-month) .calendar-day-number:not([aria-current])')
    .first()
    .click();
  await page.getByRole('button', { name: 'Hoy', exact: true }).click();
  assert.equal(
    await page.locator('.calendar-day-number[aria-current="date"]').getAttribute('aria-pressed'),
    'true',
  );
  await page.getByRole('button', { name: 'Sin fecha límite', exact: true }).click();
  await work
    .getByRole('button', { name: 'Abrir pendiente: ' + undated.title, exact: true })
    .waitFor();
  await chooseTaskStatus(page, undated.title, done);
  await page.waitForFunction(
    (title) =>
      Array.from(document.querySelectorAll('.calendar-task .task-status-button')).some(
        (b) =>
          b.getAttribute('aria-label') === 'Cambiar estado de ' + title &&
          b.textContent.includes('Resuelto') &&
          !b.disabled,
      ),
    undated.title,
    { timeout: 10000 },
  );
  pass(
    'Calendar month navigation and undated quick actions fit desktop, phone and landscape in both themes',
  );
  await choose('lista');
  await json(admin, 'DELETE', `/projects/${a.id}`, undefined, 204);
  await json(admin, 'DELETE', `/projects/${b.id}`, undefined, 204);
  await page.goto('http://localhost:4174/#inbox');
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
}
