import { chooseTaskStatus } from './task-status-helpers.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openTaskProperties, closeTaskProperties } from './task-property-test-helpers.mjs';

export async function testTaskHierarchy({
  page,
  admin,
  support,
  personalAdmin,
  member,
  json,
  pass,
  artifacts,
}) {
  const project = await json(admin, 'POST', '/projects', {
    name: 'Hierarchy fixture',
    color: 'purple',
  });
  const other = await json(admin, 'POST', '/projects', {
    name: 'Hierarchy boundary',
    color: 'blue',
  });
  const workspace = await json(admin, 'GET', '/workspace');
  const open = workspace.statuses.find((s) => s.projectId === project.id && !s.isDone);
  const done = workspace.statuses.find((s) => s.projectId === project.id && s.isDone);
  const input = (title, extra = {}) => ({
    title,
    projectId: project.id,
    statusId: open.id,
    tagIds: [],
    ...extra,
  });
  const create = (title, extra) => json(admin, 'POST', '/tasks', input(title, extra));
  const get = async (id) => (await json(admin, 'GET', `/tasks/${id}`)).item;
  const parent = (task, parentId, expected = 200) =>
    json(
      admin,
      'PUT',
      `/tasks/${task.id}/parent`,
      { parentTaskId: parentId, version: task.version },
      expected,
    );
  let root = await create('Large reservation feature');
  let child = await create('Reservation API', {
    assigneeId: member.id,
    hierarchy: { parentTaskId: root.id },
  });
  let grandchild = await create('Validate dates', { hierarchy: { parentTaskId: child.id } });
  assert.equal((await json(admin, 'GET', `/tasks/${child.id}`)).parent.id, root.id);
  assert.equal((await json(admin, 'GET', `/tasks/${root.id}`)).children.total, 1);
  child = await json(
    support,
    'PUT',
    `/tasks/${child.id}`,
    input(child.title, { assigneeId: member.id, version: child.version }),
  );
  assert.equal(child.parentTaskId, root.id, 'Legacy clients preserve hierarchy when omitted');
  child = await json(support, 'PUT', `/tasks/${child.id}/status`, {
    statusId: done.id,
    version: child.version,
  });
  assert.equal((await get(root.id)).statusId, open.id);
  assert.equal((await json(admin, 'GET', `/tasks/${root.id}`)).children.done, 1);
  pass(
    'Nested tasks keep independent owners/states; completing children updates progress without completing the parent, and legacy edits preserve links',
  );

  await parent(root, root.id, 400);
  await parent(root, grandchild.id, 400);
  const foreign = await json(admin, 'POST', '/tasks', {
    title: 'Other project task',
    projectId: other.id,
    statusId: workspace.statuses.find((s) => s.projectId === other.id).id,
  });
  await parent(child, foreign.id, 400);
  const privateProject = await json(personalAdmin, 'POST', '/projects', {
    name: 'Private hierarchy',
    color: 'blue',
  });
  const privateWorkspace = await json(personalAdmin, 'GET', '/workspace');
  const privateTask = await json(personalAdmin, 'POST', '/tasks', {
    title: 'Private parent',
    projectId: privateProject.id,
    statusId: privateWorkspace.statuses.find((s) => s.projectId === privateProject.id).id,
  });
  await parent(root, privateTask.id, 400);
  await json(support, 'GET', `/tasks/${privateTask.id}/children`, undefined, 404);
  await json(support, 'GET', `/tasks/parent-options?project=${privateProject.id}`, undefined, 404);
  await parent({ ...child, version: root.version }, null, 409);
  const options = await json(
    admin,
    'GET',
    `/tasks/parent-options?project=${project.id}&exclude=${root.id}`,
  );
  assert(!options.items.some((t) => [root.id, child.id, grandchild.id].includes(t.id)));
  const childOptions = await json(
    admin,
    'GET',
    `/tasks/parent-options?project=${project.id}&exclude=${grandchild.id}&relation=child`,
  );
  assert(!childOptions.items.some((t) => [root.id, child.id, grandchild.id].includes(t.id)));
  pass(
    'Self/descendant/cross-project/private-space links and stale updates are rejected; pickers exclude ancestors/descendants',
  );

  const archivedParent = await create('Archived candidate');
  await json(admin, 'POST', `/tasks/${archivedParent.id}/archive`, {
    archived: true,
    version: archivedParent.version,
  });
  await parent(root, archivedParent.id, 400);
  grandchild = await json(admin, 'POST', `/tasks/${grandchild.id}/archive`, {
    archived: true,
    version: grandchild.version,
  });
  assert.equal((await json(admin, 'GET', `/tasks/${child.id}/children`)).total, 0);
  assert.equal((await json(admin, 'GET', `/tasks/${child.id}/children?archived=true`)).total, 1);
  await parent(root, grandchild.id, 400);
  grandchild = await json(admin, 'POST', `/tasks/${grandchild.id}/archive`, {
    archived: false,
    version: grandchild.version,
  });
  pass(
    'Archived tasks remain related but are excluded from active child progress and cannot become new parents',
  );

  const a = await create('Concurrent A');
  const b = await create('Concurrent B');
  const race = await Promise.all([
    admin.put(`/api/tasks/${a.id}/parent`, { data: { parentTaskId: b.id, version: a.version } }),
    support.put(`/api/tasks/${b.id}/parent`, { data: { parentTaskId: a.id, version: b.version } }),
  ]);
  assert.deepEqual(race.map((r) => r.status()).sort(), [200, 400]);
  assert(!((await get(a.id)).parentTaskId === b.id && (await get(b.id)).parentTaskId === a.id));
  pass('Concurrent opposite parent assignments serialize and cannot create a cycle');

  const moveInput = (task) => ({
    ...task,
    projectId: other.id,
    statusId: foreign.statusId,
    tagIds: [],
  });
  await json(admin, 'PUT', `/tasks/${root.id}`, moveInput(root), 400);
  await json(admin, 'PUT', `/tasks/${child.id}`, moveInput(child), 400);
  grandchild = await json(admin, 'PUT', `/tasks/${grandchild.id}`, moveInput(grandchild));
  assert.equal(grandchild.parentTaskId, null);
  assert.equal(grandchild.projectId, other.id);
  pass('A parent with children cannot move projects; moving a leaf clears its parent safely');

  await json(admin, 'DELETE', `/tasks/${root.id}?version=${root.version}`, undefined, 204);
  const surviving = await json(admin, 'GET', `/tasks/${child.id}`);
  assert.equal(surviving.item.parentTaskId, null);
  assert.equal(surviving.item.assigneeId, member.id);
  assert.equal(surviving.item.statusId, done.id);
  assert.notEqual(surviving.item.version, child.version);
  assert(surviving.activities.some((a) => a.body.includes('padre fue eliminado')));
  await parent(child, null, 409);
  pass(
    'Deleting a parent preserves its children, owner/status and activity, and invalidates stale child edits',
  );

  root = await create('Hierarchy UI parent');
  const module = await json(admin, 'POST', '/modules', {
    projectId: project.id,
    name: 'Hierarchy module',
    color: 'purple',
  });
  const cycle = await json(admin, 'POST', '/cycles', {
    projectId: project.id,
    name: 'Hierarchy cycle',
    color: 'blue',
  });
  root = await json(
    admin,
    'PUT',
    `/tasks/${root.id}`,
    input(root.title, {
      version: root.version,
      planning: { moduleId: module.id, cycleId: cycle.id, estimateKind: 'none' },
    }),
  );
  await page.goto(`http://localhost:4174/?task=${root.id}`);
  let dialog = page.getByRole('dialog', { name: 'Detalle del pendiente', exact: true });
  await dialog.getByLabel('Título', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Crear hijo', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '¿Qué encontraste?', exact: true });
  await dialog.getByLabel('Título', { exact: true }).fill('UI child assigned to support');
  await dialog.getByLabel('Responsable', { exact: true }).selectOption(member.id);
  await openTaskProperties(page);
  assert.equal(await page.getByLabel('Proyecto', { exact: true }).inputValue(), project.id);
  assert.equal(await page.getByLabel('Módulo (opcional)', { exact: true }).inputValue(), module.id);
  assert.equal(await page.getByLabel('Ciclo (opcional)', { exact: true }).inputValue(), cycle.id);
  await closeTaskProperties(page);
  const saveChild = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/api/tasks'),
  );
  await dialog.getByRole('button', { name: 'Crear pendiente', exact: true }).click();
  const uiChild = await (await saveChild).json();
  assert.equal(uiChild.parentTaskId, root.id);
  assert.equal(uiChild.assigneeId, member.id);
  dialog = page.getByRole('dialog', { name: 'Detalle del pendiente', exact: true });
  await dialog.getByRole('button', { name: `Padre: ${root.title}`, exact: true }).click();
  await dialog.getByRole('article', { name: `Subpendiente ${uiChild.title}` }).waitFor();
  await chooseTaskStatus(dialog, uiChild.title, done);
  await page.waitForFunction(() =>
    document.querySelector('.task-relations h3')?.textContent.includes('1/1'),
  );
  assert.equal((await get(root.id)).statusId, open.id);
  pass(
    'The real UI creates assigned children with inherited organization, navigates parent/child and updates child status/progress independently',
  );

  const existing = await create('Existing work to link');
  await dialog.getByRole('button', { name: 'Vincular existente', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Vincular subpendiente existente', exact: true });
  await picker.getByLabel('Buscar pendiente para relacionar').fill(existing.title);
  await picker.getByRole('button', { name: `Seleccionar ${existing.title}`, exact: true }).click();
  await picker.waitFor({ state: 'hidden' });
  await dialog.getByRole('article', { name: `Subpendiente ${existing.title}` }).waitFor();
  const unlinked = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/tasks/${existing.id}/parent` &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
  );
  await dialog
    .getByRole('button', { name: `Retirar ${existing.title} del padre`, exact: true })
    .click();
  await unlinked;
  await dialog
    .getByRole('article', { name: `Subpendiente ${existing.title}` })
    .waitFor({ state: 'hidden' });
  assert.equal((await get(existing.id)).parentTaskId, null);
  pass('The child picker searches and links existing work; unlinking preserves the task');

  await page.goto(`http://localhost:4174/?task=${existing.id}`);
  await dialog.getByLabel('Título', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Elegir pendiente padre', exact: true }).click();
  const parentPicker = page.getByRole('dialog', { name: 'Elegir pendiente padre', exact: true });
  await parentPicker.getByLabel('Buscar pendiente para relacionar').fill(root.title);
  await parentPicker
    .getByRole('button', { name: `Seleccionar ${root.title}`, exact: true })
    .click();
  assert.equal(
    (await get(existing.id)).parentTaskId,
    null,
    'Picking a parent remains a draft until Save',
  );
  const savedParent = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/tasks/${existing.id}`),
  );
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  assert.equal((await (await savedParent).json()).parentTaskId, root.id);
  await dialog.getByRole('button', { name: `Padre: ${root.title}`, exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Elegir pendiente padre', exact: true }).click();
  await parentPicker.getByRole('button', { name: 'Sin padre', exact: true }).click();
  const removedParent = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/tasks/${existing.id}`),
  );
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  assert.equal((await (await removedParent).json()).parentTaskId, null);
  await dialog.getByText('Todos los cambios están guardados.', { exact: true }).waitFor();
  await page.goto(`http://localhost:4174/?task=${root.id}`);
  await dialog.getByLabel('Título', { exact: true }).waitFor();
  pass(
    'The footer parent picker searches, saves an optional parent and removes it without changing either task',
  );

  await dialog.getByLabel('Título', { exact: true }).fill('');
  await dialog.getByRole('tab', { name: 'Evidencias', exact: true }).click();
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  assert.equal(
    await dialog
      .getByRole('tab', { name: 'Detalle general', exact: true })
      .getAttribute('aria-selected'),
    'true',
  );
  await dialog.getByLabel('Título', { exact: true }).fill(root.title);
  await openTaskProperties(page);
  await page.getByLabel('Fecha límite (opcional)', { exact: true }).fill('2026-12-20');
  let unexpectedConfirmation = 0;
  const onUnexpectedConfirmation = async (confirmation) => {
    unexpectedConfirmation++;
    await confirmation.dismiss();
  };
  page.on('dialog', onUnexpectedConfirmation);
  await page
    .getByRole('dialog', { name: 'Propiedades del pendiente', exact: true })
    .press('Escape');
  await page
    .getByRole('dialog', { name: 'Propiedades del pendiente', exact: true })
    .waitFor({ state: 'hidden' });
  page.off('dialog', onUnexpectedConfirmation);
  assert.equal(
    unexpectedConfirmation,
    0,
    'Escape closes only the property dialog without prompting to discard the task',
  );
  assert(await dialog.isVisible());
  await dialog.getByRole('tab', { name: 'Conversación y actividad', exact: true }).click();
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().endsWith(`/api/tasks/${root.id}`),
  );
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  assert.equal((await (await saved).json()).dueDate, '2026-12-20');
  await dialog.getByText('Todos los cambios están guardados.', { exact: true }).waitFor();
  pass(
    'Footer properties preserve drafts across tabs and can save from any tab; invalid titles return to General',
  );

  for (const [width, height, theme] of [
    [1440, 900, 'light'],
    [390, 844, 'dark'],
    [320, 600, 'light'],
    [844, 390, 'dark'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    for (const tab of ['Detalle general', 'Evidencias', 'Conversación y actividad']) {
      await dialog.getByRole('tab', { name: tab, exact: true }).click();
      await dialog.locator('.task-detail-body').evaluate((el) => (el.scrollTop = el.scrollHeight));
      assert(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      for (const control of [
        dialog.getByLabel('Estado', { exact: true }),
        dialog.getByLabel('Responsable', { exact: true }),
        dialog.getByRole('button', { name: 'Más propiedades del pendiente', exact: true }),
        dialog.getByRole('button', { name: 'Guardar cambios', exact: true }),
      ]) {
        const rect = await control.boundingBox();
        assert(
          rect &&
            rect.x >= 0 &&
            rect.y >= 0 &&
            rect.x + rect.width <= width + 1 &&
            rect.y + rect.height <= height + 1,
        );
        if (width <= 640 || height <= 500) assert(rect.height >= 44);
      }
    }
    await dialog.getByRole('tab', { name: 'Detalle general', exact: true }).click();
    await page.screenshot({ path: path.join(artifacts, `task-footer-${width}-${theme}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  pass(
    'Compact footer controls stay visible outside scrolling content on every tab, both themes, desktop, narrow phone and landscape',
  );

  const bulk = [];
  for (let i = 0; i < 51; i++)
    bulk.push(
      await create(`Paged child ${String(i).padStart(2, '0')}`, {
        hierarchy: { parentTaskId: root.id },
      }),
    );
  const first = await json(admin, 'GET', `/tasks/${root.id}/children`);
  const second = await json(admin, 'GET', `/tasks/${root.id}/children?page=2`);
  assert.equal(first.total, 52);
  assert.equal(first.items.length, 50);
  assert.equal(second.items.length, 2);
  assert.equal(new Set([...first.items, ...second.items].map((t) => t.id)).size, 52);
  const candidates = await json(
    admin,
    'GET',
    `/tasks/parent-options?project=${project.id}&q=Paged%20child&page=2`,
  );
  assert.equal(candidates.total, 51);
  assert.equal(candidates.items.length, 1);
  pass('Child lists and searchable parent candidates paginate without losing tasks beyond 50');
  await page.goto(`http://localhost:4174/?task=${root.id}`);
  await dialog.getByLabel('Título', { exact: true }).waitFor();
  const relations = dialog.getByRole('region', { name: 'Subpendientes', exact: true });
  await relations.getByText('Página 1 de 2', { exact: true }).waitFor();
  await relations.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await relations.getByText('Página 2 de 2', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.task-child-row').length === 2);
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  const allowed = (await json(admin, 'GET', '/roles')).permissions
    .filter((p) => p.roleName === 'User' && p.allowed)
    .map((p) => p.page);
  try {
    await json(
      admin,
      'PUT',
      '/roles/User/permissions',
      { pages: allowed.filter((p) => p !== 'tasks') },
      204,
    );
    await json(support, 'GET', `/tasks/${root.id}/children`, undefined, 403);
    await json(support, 'GET', `/tasks/parent-options?project=${project.id}`, undefined, 403);
    await json(
      support,
      'PUT',
      `/tasks/${existing.id}/parent`,
      { parentTaskId: root.id, version: (await get(existing.id)).version },
      403,
    );
  } finally {
    await json(admin, 'PUT', '/roles/User/permissions', { pages: allowed }, 204);
  }
  pass(
    'The real child list reaches its second page and all hierarchy endpoints enforce the Tasks page permission',
  );
  await json(admin, 'DELETE', `/projects/${project.id}`, undefined, 204);
  await json(admin, 'DELETE', `/projects/${other.id}`, undefined, 204);
  await json(personalAdmin, 'DELETE', `/projects/${privateProject.id}`, undefined, 204);
  await json(admin, 'GET', `/tasks/${uiChild.id}`, undefined, 404);
  await page.goto('http://localhost:4174');
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
  pass(
    'Deleting projects with multiple task levels clears hierarchy safely without foreign-key failures',
  );
}
