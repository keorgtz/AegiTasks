import assert from 'node:assert/strict';
import path from 'node:path';

export async function testSpaceAccounts({
  request,
  admin,
  support,
  adminUser,
  member,
  shared,
  password,
  json,
  pass,
}) {
  const context = () =>
    request.newContext({
      baseURL: 'http://localhost:5213',
      extraHTTPHeaders: { 'X-AegiTasks': '1' },
    });
  const login = await context();
  assert.equal(
    (
      await json(login, 'POST', '/auth/login', {
        identifier: `  ${adminUser.username.toUpperCase()}  `,
        password,
      })
    ).id,
    adminUser.id,
  );
  assert.equal(
    (await json(login, 'POST', '/auth/login', { identifier: ' ADMIN@EXAMPLE.COM ', password })).id,
    adminUser.id,
  );
  assert.equal(
    (await json(login, 'POST', '/auth/login', { email: 'admin@example.com', password })).id,
    adminUser.id,
  );
  for (const identifier of [
    'unknown-account',
    'missing@example.com',
    adminUser.username,
    '',
    'x'.repeat(201),
  ]) {
    const response = await login.post('/api/auth/login', {
      data: { identifier, password: 'incorrect-password' },
    });
    assert.equal(response.status(), 401);
    assert.equal((await response.json()).error, 'Correo, usuario o contraseña incorrectos.');
  }
  pass(
    'Email and unique username login trim whitespace and ignore case; old PWA payloads still work and invalid credentials stay generic',
  );

  const target = await json(admin, 'POST', '/users', {
    name: member.name,
    email: 'direct-member@example.com',
    username: '  Space.Test  ',
    role: 'User',
    password,
  });
  assert.equal(target.username, 'space.test');
  await json(
    admin,
    'POST',
    '/users',
    {
      name: 'Duplicate',
      email: 'duplicate@example.com',
      username: 'SPACE.TEST',
      role: 'User',
      password,
    },
    400,
  );
  for (const username of ['a', 'bad name', 'mail@example.com', '-invalid', 'x'.repeat(41)])
    await json(
      admin,
      'POST',
      '/users',
      { name: 'Invalid', email: 'invalid@example.com', username, role: 'User', password },
      400,
    );
  const collision = await json(admin, 'POST', '/users', {
    name: 'Legacy client',
    email: 'support@another.example',
    role: 'User',
    password,
  });
  assert.equal(collision.username, `${member.username}-2`);
  const inactive = await json(admin, 'POST', '/users', {
    name: 'Inactive fixture',
    email: 'inactive-space@example.com',
    username: 'inactive.space',
    role: 'User',
    password,
  });
  await json(admin, 'PUT', `/users/${inactive.id}`, { ...inactive, active: false });
  await json(login, 'POST', '/auth/login', { identifier: inactive.username, password }, 401);
  pass(
    'Usernames are unique across duplicate display names, validated and configurable; legacy creation generates a collision-free handle and disabled accounts cannot log in',
  );

  const targetContext = await context();
  await json(targetContext, 'POST', '/auth/login', { identifier: target.username, password });
  const personal = (await json(targetContext, 'GET', '/spaces')).spaces.find((s) => s.isPersonal);
  await json(targetContext, 'PUT', `/spaces/${personal.id}`, { name: 'Mi espacio privado' }, 204);
  assert.equal(
    (await json(targetContext, 'GET', '/spaces')).spaces.find((s) => s.id === personal.id).name,
    'Mi espacio privado',
  );
  await json(admin, 'PUT', `/spaces/${personal.id}`, { name: 'Forbidden' }, 404);
  await json(admin, 'POST', `/spaces/${personal.id}/members`, { userId: adminUser.id }, 404);
  await json(admin, 'POST', `/spaces/${shared.id}/members`, { userId: inactive.id }, 400);
  await json(
    admin,
    'POST',
    `/spaces/${shared.id}/members`,
    { userId: '00000000-0000-0000-0000-000000000001' },
    400,
  );
  await json(support, 'POST', `/spaces/${shared.id}/members`, { userId: target.id }, 403);
  await json(support, 'PUT', `/spaces/${shared.id}`, { name: 'Forbidden' }, 403);
  pass(
    'Personal names can be edited without exposing their contents; direct membership requires Admin, active existing accounts and a shared space',
  );

  const workspace = await json(support, 'POST', '/spaces', { name: 'Workspace de soporte QA' });
  await json(support, 'PUT', `/spaces/${workspace.id}`, { name: 'Workspace editable QA' }, 204);
  await json(admin, 'PUT', `/spaces/${workspace.id}`, { name: 'Unjoined admin' }, 404);
  await json(admin, 'POST', `/spaces/${workspace.id}/members`, { userId: target.id }, 404);
  const invite = await json(support, 'POST', `/spaces/${workspace.id}/invite`);
  await json(admin, 'POST', '/spaces/join', { code: invite.code });
  await json(admin, 'PUT', `/spaces/${workspace.id}`, { name: 'Workspace admin QA' }, 204);
  await json(admin, 'PUT', `/spaces/${workspace.id}`, { name: '   ' }, 400);
  await json(admin, 'PUT', `/spaces/${workspace.id}`, { name: 'x'.repeat(81) }, 400);
  await json(admin, 'POST', `/spaces/${workspace.id}/members`, { userId: target.id }, 204);
  await json(admin, 'POST', `/spaces/${workspace.id}/members`, { userId: target.id }, 204);
  await json(admin, 'POST', `/spaces/${workspace.id}/members`, { userId: member.id }, 204);
  assert.equal(
    (await json(admin, 'GET', `/spaces/${workspace.id}/members`)).filter((u) => u.id === target.id)
      .length,
    1,
  );
  assert.ok(
    (await json(targetContext, 'GET', '/spaces')).spaces.some((s) => s.id === workspace.id),
  );
  await json(admin, 'DELETE', `/spaces/${workspace.id}/members/${target.id}`, undefined, 204);
  assert.ok(
    !(await json(targetContext, 'GET', '/spaces')).spaces.some((s) => s.id === workspace.id),
  );
  await json(admin, 'DELETE', `/spaces/${workspace.id}/members/${member.id}`, undefined, 400);
  pass(
    'Joined Admin can edit and add or remove members in another owner’s workspace; duplicate additions are idempotent and ownership stays protected',
  );
  await login.dispose();
  return {
    target,
    targetContext,
    workspace: { ...workspace, name: 'Workspace admin QA' },
    inactive,
    personal,
  };
}

export async function testSpaceAccountUi({
  browser,
  page,
  admin,
  json,
  fixtures,
  shared,
  password,
  pass,
  artifacts,
}) {
  const { target, targetContext, workspace, inactive, personal } = fixtures;
  const userContext = await browser.newContext({
    baseURL: 'http://localhost:4174',
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const userPage = await userContext.newPage();
  await userPage.goto('/');
  await userPage.getByLabel('Correo o nombre de usuario').fill(' SPACE.TEST ');
  await userPage.getByLabel('Contraseña', { exact: true }).fill(password);
  await userPage.getByRole('button', { name: 'Entrar a mi espacio' }).click();
  await userPage.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
  assert.equal(
    await userPage
      .locator('select[aria-label="Espacio activo"]:visible')
      .locator(`option[value="${workspace.id}"]`)
      .count(),
    0,
  );
  pass(
    'Browser login accepts a username without email validation, including uppercase and surrounding spaces',
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  const previousTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (previousTheme === 'dark')
    await page.getByRole('button', { name: 'Cambiar a modo claro' }).click();
  await page.goto('http://localhost:4174/#spaces');
  await page.locator('select[aria-label="Espacio activo"]:visible').selectOption(workspace.id);
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
  await page.goto('http://localhost:4174/#spaces');
  await page.getByRole('button', { name: 'Editar espacio', exact: true }).click();
  await page.getByLabel('Nombre del espacio').fill('Nombre cancelado');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(
    (await json(admin, 'GET', '/spaces')).spaces.find((s) => s.id === workspace.id).name,
    workspace.name,
  );
  await page.getByRole('button', { name: 'Editar espacio', exact: true }).click();
  await page.getByLabel('Nombre del espacio').fill('Workspace actualizado UI');
  await page.screenshot({ path: path.join(artifacts, 'space-edit-desktop.png') });
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page
    .locator('select[aria-label="Espacio activo"]:visible')
    .locator(`option[value="${workspace.id}"]`)
    .filter({ hasText: 'Workspace actualizado UI' })
    .waitFor({ state: 'attached' });
  pass(
    'Space edit dialog cancels without mutation, persists the new name and refreshes navigation',
  );

  await page.getByRole('button', { name: 'Agregar usuario', exact: true }).click();
  const select = page.getByLabel('Usuario existente');
  await select.locator(`option[value="${target.id}"]`).waitFor({ state: 'attached' });
  assert.equal(await select.locator(`option[value="${inactive.id}"]`).count(), 0);
  await select.selectOption(target.id);
  await page.screenshot({ path: path.join(artifacts, 'space-member-desktop.png') });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Agregar usuario', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await userPage
    .locator('select[aria-label="Espacio activo"]:visible')
    .locator(`option[value="${workspace.id}"]`)
    .waitFor({ state: 'attached' });
  await userPage.locator('select[aria-label="Espacio activo"]:visible').selectOption(workspace.id);
  await userPage.goto('/#spaces');
  await userPage.getByRole('heading', { name: 'Spaces', exact: true }).waitFor();
  assert.equal(
    await userPage.getByRole('button', { name: 'Agregar usuario', exact: true }).count(),
    0,
  );
  assert.equal(
    await userPage.getByRole('button', { name: 'Editar espacio', exact: true }).count(),
    0,
  );
  assert.equal(
    (await json(admin, 'GET', `/spaces/${workspace.id}/members`)).filter((u) => u.id === target.id)
      .length,
    1,
  );
  pass(
    'Admin adds an existing account through the dialog; its connected device gains the space through events and User sees no admin actions',
  );

  await page.setViewportSize({ width: 320, height: 600 });
  await page.getByRole('button', { name: 'Agregar usuario', exact: true }).click();
  await select.locator(`option[value="${target.id}"]`).waitFor({ state: 'detached' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await page.getByRole('dialog').evaluate((d) => d.scrollWidth <= d.clientWidth));
  await page.screenshot({ path: path.join(artifacts, 'space-member-mobile.png') });
  await page.keyboard.press('Escape');
  await userPage.locator('select[aria-label="Espacio activo"]:visible').selectOption(personal.id);
  await userPage.goto('/#spaces');
  await userPage.getByRole('button', { name: 'Editar espacio', exact: true }).click();
  await userPage.getByLabel('Nombre del espacio').fill('Ideas personales');
  await userPage.screenshot({ path: path.join(artifacts, 'space-edit-mobile-dark.png') });
  await userPage.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await userPage.getByRole('dialog').waitFor({ state: 'hidden' });
  await userPage.reload();
  await userPage
    .locator('select[aria-label="Espacio activo"]:visible')
    .locator(`option[value="${personal.id}"]`)
    .filter({ hasText: 'Ideas personales' })
    .waitFor({ state: 'attached' });
  pass(
    'Dialogs work at 320px and on a dark phone layout; members are excluded from the picker and personal names survive reload',
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4174/#admin');
  const row = page
    .locator('.settings-row')
    .filter({ has: page.getByText(`${target.username} · ${target.email}`, { exact: true }) });
  await row.getByRole('button', { name: `Editar persona ${target.name}`, exact: true }).click();
  await page.getByLabel('Nombre de usuario', { exact: true }).fill('space.renamed');
  assert.ok(
    await page
      .getByLabel('Nombre de usuario', { exact: true })
      .evaluate((input) => input.checkValidity()),
  );
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await json(targetContext, 'POST', '/auth/login', { identifier: target.username, password }, 401);
  assert.equal(
    (await json(targetContext, 'POST', '/auth/login', { identifier: 'SPACE.RENAMED', password }))
      .id,
    target.id,
  );
  pass(
    'Administrator edits the login username independently of the visible name; old username stops working and new username authenticates',
  );
  await userContext.close();
  await targetContext.dispose();
  await page.locator('select[aria-label="Espacio activo"]:visible').selectOption(shared.id);
  await page.goto('http://localhost:4174/#inbox');
  await page.setViewportSize({ width: 1440, height: 1080 });
  if (previousTheme === 'dark')
    await page.getByRole('button', { name: 'Cambiar a modo oscuro' }).click();
}
