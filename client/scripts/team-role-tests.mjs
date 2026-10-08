import assert from 'node:assert/strict';
import path from 'node:path';

export async function testTeamRoles({
  page,
  admin,
  support,
  adminUser,
  member,
  shared,
  json,
  pass,
  artifacts,
}) {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const workspace = await json(admin, 'POST', '/spaces', { name: 'Roles del equipo' });
  await json(admin, 'POST', `/spaces/${workspace.id}/members`, { userId: member.id }, 204);
  const ownerSpace = await json(support, 'POST', '/spaces', { name: 'Equipo de soporte' });
  const ownerRole = await json(support, 'POST', `/spaces/${ownerSpace.id}/team-roles`, {
    name: 'Dirección técnica',
    description: 'Arquitectura y desarrollo',
  });
  await json(admin, 'GET', `/spaces/${ownerSpace.id}/team-roles`, undefined, 404);
  await json(admin, 'POST', `/spaces/${ownerSpace.id}/team-roles`, { name: 'Intruso' }, 404);
  const personal = (await json(admin, 'GET', '/spaces')).spaces.find((s) => s.isPersonal);
  await json(admin, 'POST', `/spaces/${personal.id}/team-roles`, { name: 'Privado' }, 404);
  pass(
    'Team roles belong only to joined shared workspaces; personal spaces and outsider Admin access are rejected',
  );

  const rolesUrl = `/spaces/${workspace.id}/team-roles`;
  const role = await json(admin, 'POST', rolesUrl, {
    name: '  Soporte   técnico  ',
    description: 'Atención a clientes',
  });
  assert.equal(role.name, 'Soporte técnico');
  await json(admin, 'POST', rolesUrl, { name: 'SOPORTE TÉCNICO' }, 409);
  await json(admin, 'POST', rolesUrl, { name: ' ' }, 400);
  await json(admin, 'POST', rolesUrl, { name: 'x'.repeat(81) }, 400);
  await json(admin, 'POST', rolesUrl, { name: 'Otro', description: 'x'.repeat(401) }, 400);
  await json(support, 'POST', rolesUrl, { name: 'Dirección general' }, 403);
  await json(support, 'PUT', `${rolesUrl}/${role.id}`, { ...role, name: 'Manager' }, 403);
  await json(support, 'DELETE', `${rolesUrl}/${role.id}?version=${role.version}`, undefined, 403);
  pass(
    'Workspace catalog validates Spanish names, lengths and case-insensitive uniqueness; ordinary members cannot manage roles',
  );

  const membersUrl = `/spaces/${workspace.id}/members`;
  const members = () => json(admin, 'GET', membersUrl);
  const assign = (id, body, expected = 204) =>
    json(admin, 'PUT', `${membersUrl}/${id}/team-role`, body, expected);
  await assign(adminUser.id, { teamRoleId: role.id });
  await assign(member.id, { teamRoleId: role.id });
  let assigned = (await members()).find((m) => m.id === member.id);
  assert.equal(assigned.teamRole.name, 'Soporte técnico');
  assert.equal((await members()).find((m) => m.id === adminUser.id).teamRole.id, role.id);
  await json(
    support,
    'PUT',
    `${membersUrl}/${member.id}/team-role`,
    { teamRoleId: null, version: assigned.teamRoleVersion },
    403,
  );
  await assign(member.id, { teamRoleId: ownerRole.id, version: assigned.teamRoleVersion }, 400);
  await assign('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { teamRoleId: role.id }, 404);
  await assign(member.id, { teamRoleId: null }, 409);
  await assign(member.id, { teamRoleId: null, version: assigned.teamRoleVersion });
  await assign(member.id, { teamRoleId: role.id });
  await assign(member.id, { teamRoleId: null, version: assigned.teamRoleVersion }, 409);
  pass(
    'Owners and members receive one optional team role; cross-space, nonmember, self-promotion and stale assignment writes are rejected',
  );

  await json(admin, 'PUT', `${rolesUrl}/${role.id}`, { ...role, name: 'Gerencia de soporte' }, 204);
  await json(admin, 'PUT', `${rolesUrl}/${role.id}`, { ...role, name: 'Edición antigua' }, 409);
  const renamed = (await json(support, 'GET', rolesUrl)).find((r) => r.id === role.id);
  assert.equal((await members()).find((m) => m.id === member.id).teamRole.name, renamed.name);
  await json(admin, 'DELETE', `${rolesUrl}/${role.id}?version=${role.version}`, undefined, 409);
  const ownInvitation = await json(support, 'POST', `/spaces/${ownerSpace.id}/invite`);
  await json(admin, 'POST', '/spaces/join', { code: ownInvitation.code });
  await json(admin, 'POST', `/spaces/${ownerSpace.id}/team-roles`, { name: 'Gerencia' });
  assert.equal((await json(support, 'GET', '/auth/me')).role, 'User');
  await json(support, 'GET', '/users', undefined, 403);
  pass(
    'Renames propagate to assigned members, catalog conflicts reject stale edits, and joined Admin can manage roles without changing system permissions',
  );

  // Removing a member clears its assignment; rejoining does not restore a stale job label.
  await json(admin, 'DELETE', `${membersUrl}/${member.id}`, undefined, 204);
  await json(admin, 'POST', membersUrl, { userId: member.id }, 204);
  assert.equal((await members()).find((m) => m.id === member.id).teamRole, null);
  await assign(member.id, { teamRoleId: renamed.id });
  await json(admin, 'POST', `/spaces/${workspace.id}/owner`, { userId: member.id }, 204);
  assert.equal(
    (await json(support, 'GET', membersUrl)).find((m) => m.id === member.id).teamRole.id,
    renamed.id,
  );
  await json(support, 'POST', `/spaces/${workspace.id}/owner`, { userId: adminUser.id }, 204);
  await json(
    admin,
    'DELETE',
    `${rolesUrl}/${renamed.id}?version=${renamed.version}`,
    undefined,
    204,
  );
  const cleared = await members();
  assert.equal(cleared.length, 2);
  assert.ok(cleared.every((m) => m.teamRole === null));
  pass(
    'Member removal clears assignments, ownership transfer retains job roles, and deleting an assigned role preserves membership',
  );

  await page.goto('/#spaces');
  const picker = page.locator('select[aria-label="Espacio activo"]:visible');
  await picker.locator(`option[value="${workspace.id}"]`).waitFor({ state: 'attached' });
  await picker.selectOption(workspace.id);
  await page.goto('/#spaces');
  await page.getByRole('heading', { name: 'Roles de equipo', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Crear rol de equipo', exact: true }).click();
  await page.getByLabel('Nombre del rol de equipo').fill('Dirección general');
  await page.getByLabel('Descripción (opcional)', { exact: true }).fill('Coordinación del equipo');
  await page.getByRole('button', { name: 'Guardar rol', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page
    .getByLabel(`Rol de equipo de ${member.name}`)
    .locator('option')
    .filter({ hasText: 'Dirección general' })
    .waitFor({ state: 'attached' });
  const director = (await json(admin, 'GET', rolesUrl)).find((r) => r.name === 'Dirección general');
  await page.getByLabel(`Rol de equipo de ${member.name}`).selectOption(director.id);
  await page
    .getByRole('status')
    .filter({ hasText: `Rol de equipo de ${member.name} actualizado.` })
    .waitFor();
  await page.reload();
  assert.equal(await page.getByLabel(`Rol de equipo de ${member.name}`).inputValue(), director.id);
  await page.screenshot({
    path: path.join(artifacts, 'team-roles-desktop-light.png'),
    fullPage: true,
  });
  pass('Actual workspace settings UI creates and assigns roles; assignments survive reload');

  const userContext = await page
    .context()
    .browser()
    .newContext({
      baseURL: 'http://localhost:4174',
      storageState: await support.storageState(),
      viewport: { width: 390, height: 844 },
    });
  const userPage = await userContext.newPage();
  await userPage.goto('/#spaces');
  await userPage.locator('select[aria-label="Espacio activo"]:visible').selectOption(workspace.id);
  await userPage.goto('/#spaces');
  await userPage
    .locator('.workspace-member-row')
    .filter({ has: userPage.getByText(member.name, { exact: true }) })
    .getByText('Dirección general', { exact: true })
    .waitFor();
  assert.equal(
    await userPage.getByRole('button', { name: 'Crear rol de equipo', exact: true }).count(),
    0,
  );
  assert.equal(await userPage.locator('.member-team-role').count(), 0);
  await page.getByRole('button', { name: 'Editar rol Dirección general', exact: true }).click();
  await page.getByLabel('Nombre del rol de equipo').fill('Dirección de operaciones');
  await page.getByRole('button', { name: 'Guardar rol', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await userPage
    .locator('.member-role-label')
    .filter({ hasText: 'Dirección de operaciones' })
    .waitFor();
  await userPage.screenshot({
    path: path.join(artifacts, 'team-roles-member-mobile.png'),
    fullPage: true,
  });
  pass(
    'Ordinary members see read-only roles and connected devices receive renamed roles through live events',
  );
  await userContext.close();

  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== 'dark')
    await page.getByRole('button', { name: 'Cambiar a modo oscuro' }).click();
  await page.screenshot({
    path: path.join(artifacts, 'team-roles-desktop-dark.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 640 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Crear rol de equipo', exact: true }).click();
  assert.ok(await page.getByRole('dialog').evaluate((d) => d.scrollWidth <= d.clientWidth));
  assert.match(
    await page.getByLabel('Nombre del rol de equipo').getAttribute('placeholder'),
    /Dirección técnica.*Soporte técnico/,
  );
  await page.screenshot({ path: path.join(artifacts, 'team-roles-mobile-dialog-dark.png') });
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Eliminar rol Dirección de operaciones', exact: true })
    .click({ trial: true });
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Eliminar rol Dirección de operaciones', exact: true })
    .click();
  await page
    .getByLabel(`Rol de equipo de ${member.name}`)
    .locator(`option[value="${director.id}"]`)
    .waitFor({ state: 'detached' });
  assert.equal((await members()).find((m) => m.id === member.id).teamRole, null);
  pass(
    'Compact dark/mobile controls fit 320px, use Spanish role examples, and confirmed role deletion clears the assignment',
  );
  await page.setViewportSize({ width: 1440, height: 1080 });
  await picker.selectOption(shared.id);
  await page.goto('/#inbox');
  await page.getByRole('button', { name: 'Cambiar a modo claro' }).click();
}
