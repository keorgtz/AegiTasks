import assert from 'node:assert/strict';
import path from 'node:path';

export async function testProfile({
  page,
  request,
  admin,
  adminUser,
  shared,
  json,
  pass,
  artifacts,
  password,
}) {
  const person = await json(admin, 'POST', '/users', {
    name: 'Profile QA',
    username: 'profile.qa',
    email: 'profile@qa.example',
    role: 'User',
    password,
  });
  const client = await request.newContext({
    // Separate the IPv4 login budget from the long full-suite IPv6 localhost session.
    // Production rate limits stay enabled and unchanged throughout the tests.
    baseURL: 'http://127.0.0.1:5213',
    extraHTTPHeaders: { 'X-AegiTasks': '1', 'X-Space-Id': 'not-a-space' },
  });
  const signIn = await request.newContext({
    baseURL: 'http://127.0.0.1:5213',
    extraHTTPHeaders: { 'X-AegiTasks': '1' },
  });
  let sibling;
  try {
    await json(client, 'POST', '/auth/login', { identifier: person.username, password });
    const change = {
      name: 'Profile renamed',
      username: 'Profile.Updated',
      email: 'Updated.Profile@qa.example',
      currentPassword: password,
    };
    await json(client, 'PUT', '/auth/profile', { ...change, currentPassword: '' }, 400);
    await json(client, 'PUT', '/auth/profile', { ...change, currentPassword: 'wrong' }, 400);
    await json(
      client,
      'PUT',
      '/auth/profile',
      { ...change, username: adminUser.username.toUpperCase() },
      400,
    );
    await json(
      client,
      'PUT',
      '/auth/profile',
      { ...change, email: adminUser.email.toUpperCase() },
      400,
    );
    await json(client, 'PUT', '/auth/profile', { ...change, username: 'ab' }, 400);
    await json(client, 'PUT', '/auth/profile', { ...change, email: 'not-an-email' }, 400);
    assert.equal((await json(client, 'GET', '/auth/me')).username, person.username);
    pass(
      'Own profile rejects wrong passwords, duplicate case-insensitive identities and invalid input without partial writes',
    );
    const updated = await json(client, 'PUT', '/auth/profile', {
      ...change,
      role: 'Admin',
      active: false,
      id: adminUser.id,
    });
    assert.equal(updated.id, person.id);
    assert.equal(updated.role, 'User');
    assert.equal(updated.active, true);
    assert.equal(updated.username, 'profile.updated');
    assert.equal(updated.email, 'updated.profile@qa.example');
    assert.equal((await json(admin, 'GET', '/auth/me')).email, adminUser.email);
    assert.equal((await json(client, 'GET', '/auth/me')).name, change.name);
    await json(signIn, 'POST', '/auth/login', { identifier: person.username, password }, 401);
    await json(signIn, 'POST', '/auth/login', { email: person.email, password }, 401);
    await json(signIn, 'POST', '/auth/login', {
      identifier: updated.username.toUpperCase(),
      password,
    });
    await json(signIn, 'POST', '/auth/login', { email: updated.email.toUpperCase(), password });
    await json(client, 'POST', '/roles', { name: 'ProfileForbidden' }, 403);
    await json(client, 'PUT', '/auth/profile', { ...updated, name: 'Name only' });
    pass(
      'User edits only their own profile, remains authenticated without gaining privileges and can log in with either new identifier',
    );
    const original = await json(client, 'GET', '/auth/me');
    const concurrent = await Promise.all(
      ['First profile edit', 'Second profile edit'].map((name) =>
        client.put('/api/auth/profile', { data: { ...original, name, original } }),
      ),
    );
    assert.deepEqual(concurrent.map((r) => r.status()).sort(), [200, 409]);
    assert.ok(
      ['First profile edit', 'Second profile edit'].includes(
        (await json(client, 'GET', '/auth/me')).name,
      ),
    );
    pass(
      'Concurrent profile edits compare the original identity atomically and reject the stale save',
    );
    const managed = await json(admin, 'PUT', `/users/${person.id}`, {
      name: 'Managed profile',
      username: 'managed.profile',
      email: 'managed@qa.example',
      role: 'User',
      active: true,
    });
    assert.equal(managed.email, 'managed@qa.example');
    await json(signIn, 'POST', '/auth/login', { email: managed.email, password });
    await json(admin, 'PUT', `/users/${person.id}`, { ...managed, email: adminUser.email }, 400);
    pass(
      'Administrator can edit another account email with uniqueness validation and existing session revocation',
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?space=${shared.id}#settings/account`);
    const card = page.locator('.settings-identity');
    await card.getByLabel('Nombre visible', { exact: true }).waitFor();
    sibling = await page.context().newPage();
    await sibling.goto(`/?space=${shared.id}#settings/account`);
    await sibling.locator('.settings-identity').getByLabel('Nombre visible').waitFor();
    await card.getByLabel('Nombre visible').fill('Admin profile QA');
    await card.getByLabel('Nombre de usuario').fill('admin.profile.qa');
    await card.getByLabel('Correo electrónico').fill('admin.profile@qa.example');
    await card.getByLabel('Confirmar contraseña actual').fill(password);
    assert.equal(await card.locator('form').getAttribute('data-update-blocked'), 'true');
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/auth/profile') &&
        r.request().method() === 'PUT' &&
        r.status() === 200,
    );
    await card.getByRole('button', { name: 'Guardar datos' }).click();
    await saved;
    await page.getByText('Datos de tu cuenta actualizados.', { exact: true }).waitFor();
    await sibling.waitForFunction(
      () => document.querySelector('input[autocomplete="username"]')?.value === 'admin.profile.qa',
    );
    assert.equal((await json(admin, 'GET', '/auth/me')).role, 'Admin');
    assert.equal((await json(admin, 'GET', '/auth/me')).name, 'Admin profile QA');
    await signIn.post('/api/auth/logout');
    assert.equal(
      (await json(signIn, 'POST', '/auth/login', { identifier: 'admin.profile.qa', password })).id,
      adminUser.id,
    );
    pass(
      'Administrator saves their own visible name, username and email in Mi cuenta; another open tab updates live without logout',
    );
    for (const [width, height, theme] of [
      [1440, 900, 'light'],
      [1440, 900, 'dark'],
      [390, 844, 'dark'],
      [320, 740, 'light'],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await card.getByLabel('Correo electrónico').fill('draft@qa.example');
      await card.getByLabel('Confirmar contraseña actual').waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({
        path: path.join(artifacts, `profile-${width}-${theme}.png`),
        animations: 'disabled',
        fullPage: true,
      });
    }
    await json(admin, 'PUT', '/auth/profile', {
      ...adminUser,
      name: 'Remote admin name',
      username: 'admin.profile.qa',
      email: 'admin.profile@qa.example',
    });
    await sibling.waitForFunction(
      () => document.querySelector('input[autocomplete="name"]')?.value === 'Remote admin name',
    );
    assert.equal(await card.getByLabel('Correo electrónico').inputValue(), 'draft@qa.example');
    pass(
      'Profile fits desktop and narrow phones in both themes; live refresh preserves unsaved edits',
    );
    await card.getByLabel('Confirmar contraseña actual').fill(password);
    const conflict = page.waitForResponse(
      (r) => r.url().endsWith('/api/auth/profile') && r.status() === 409,
    );
    await card.getByRole('button', { name: 'Guardar datos' }).click();
    await conflict;
    await card
      .getByText('Tu cuenta cambió en otra sesión. Recarga los datos antes de guardar.', {
        exact: true,
      })
      .waitFor();
    assert.equal((await json(admin, 'GET', '/auth/me')).name, 'Remote admin name');
    assert.equal(await card.getByLabel('Correo electrónico').inputValue(), 'draft@qa.example');
    page.once('dialog', (prompt) => prompt.dismiss());
    await card.getByRole('button', { name: 'Recargar datos' }).click();
    assert.equal(await card.getByLabel('Correo electrónico').inputValue(), 'draft@qa.example');
    page.once('dialog', (prompt) => prompt.accept());
    await card.getByRole('button', { name: 'Recargar datos' }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('input[autocomplete="email"]')?.value === 'admin.profile@qa.example',
    );
    await card.getByLabel('Nombre visible').fill('Recovered admin profile');
    const recovered = page.waitForResponse(
      (r) => r.url().endsWith('/api/auth/profile') && r.status() === 200,
    );
    await card.getByRole('button', { name: 'Guardar datos' }).click();
    await recovered;
    assert.equal((await json(admin, 'GET', '/auth/me')).name, 'Recovered admin profile');
    pass(
      'Stale UI saves preserve both server changes and the draft; confirmed reload allows a safe retry on a phone',
    );
  } finally {
    await json(admin, 'PUT', '/auth/profile', { ...adminUser, currentPassword: password });
    await sibling?.close();
    await client.dispose();
    await signIn.dispose();
    await page.goto('/#inbox');
  }
}
