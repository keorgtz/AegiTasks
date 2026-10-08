import assert from 'node:assert/strict';
import path from 'node:path';

export async function testPasswordPresence({
  page,
  request,
  admin,
  adminUser,
  json,
  pass,
  artifacts,
  password,
}) {
  const clients = [];
  const browserContexts = [];
  const streams = [];
  const poll = async (check) => {
    const deadline = Date.now() + 8000;
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error('Presence did not reach the expected state');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  const client = async () => {
    const result = await request.newContext({
      baseURL: 'http://127.0.0.1:5213',
      extraHTTPHeaders: { 'X-AegiTasks': '1' },
    });
    clients.push(result);
    return result;
  };
  const create = (name, secret) =>
    json(admin, 'POST', '/users', {
      name,
      username: name.toLowerCase().replaceAll(' ', '.'),
      email: `${name.toLowerCase().replaceAll(' ', '.')}@presence.example`,
      role: 'User',
      password: secret,
    });
  try {
    let account = await create('Password Flexible', '');
    const login = await client();
    await json(login, 'POST', '/auth/login', { identifier: account.username, password: '' });
    await json(
      login,
      'PUT',
      '/auth/profile',
      { ...account, username: 'password.renamed', currentPassword: null },
      400,
    );
    account = await json(login, 'PUT', '/auth/profile', {
      ...account,
      username: 'password.renamed',
      currentPassword: '',
    });
    await json(login, 'POST', '/auth/password', { currentPassword: '', newPassword: '7' }, 204);
    await json(login, 'GET', '/auth/me', undefined, 401);
    await json(login, 'POST', '/auth/login', { identifier: account.username, password: '' }, 401);
    await json(login, 'POST', '/auth/login', { identifier: account.username, password: '7' });
    await json(admin, 'PUT', `/users/${account.id}`, {
      name: account.name,
      role: account.role,
      active: true,
    });
    await json(login, 'POST', '/auth/login', { email: account.email, password: '7' });
    const long = 'Long-passphrase-'.repeat(25);
    await json(login, 'POST', '/auth/password', { currentPassword: '7', newPassword: long }, 204);
    await json(login, 'POST', '/auth/login', { identifier: account.username, password: long });
    await json(login, 'POST', '/auth/password', { currentPassword: long, newPassword: '  ' }, 204);
    await json(login, 'POST', '/auth/login', { identifier: account.username, password: '  ' });
    await json(admin, 'PUT', `/users/${account.id}`, {
      name: account.name,
      role: account.role,
      active: true,
      password: '',
    });
    await json(login, 'GET', '/auth/me', undefined, 401);
    await json(login, 'POST', '/auth/login', { identifier: account.username, password: '' });
    const omitted = await create('Password Omitted', undefined);
    await json(login, 'POST', '/auth/login', { identifier: omitted.username, password: '' });
    await json(login, 'POST', '/auth/login', { identifier: adminUser.username, password: '' }, 401);
    await json(login, 'POST', '/auth/login', { identifier: omitted.username, password: null }, 401);
    pass(
      'Empty, one-character, whitespace and long passwords work; current-secret verification, omitted admin updates and session revocation remain enforced',
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#settings/users');
    await page.getByRole('button', { name: 'Agregar persona' }).click();
    let dialog = page.getByRole('dialog', { name: 'Crear persona' });
    const secret = dialog.getByLabel('Contraseña inicial', { exact: true });
    assert.equal(await secret.getAttribute('required'), null);
    assert.equal(await secret.getAttribute('minlength'), null);
    await dialog.getByText('Sin contraseña', { exact: true }).waitFor();
    await secret.fill('123456');
    await dialog.locator('.password-strength[data-strength="0"]').waitFor();
    await secret.fill('wG9$zL4!kR7#vT2@bM6%');
    await dialog.locator('.password-strength[data-strength="4"]').waitFor();
    for (const [width, height, theme] of [
      [1440, 900, 'light'],
      [1440, 900, 'dark'],
      [390, 844, 'dark'],
      [320, 740, 'light'],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({
        path: path.join(artifacts, `password-strength-${width}-${theme}.png`),
        fullPage: true,
      });
    }
    await secret.fill('');
    await dialog.getByLabel('Nombre', { exact: true }).fill('Password UI Empty');
    await dialog.getByLabel('Nombre de usuario', { exact: true }).fill('password.ui.empty');
    await dialog
      .getByLabel('Correo electrónico', { exact: true })
      .fill('password.ui.empty@presence.example');
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/users') && r.request().method() === 'POST' && r.ok(),
    );
    await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    const uiUser = await (await saved).json();
    await page
      .getByRole('button', { name: 'Editar persona Password UI Empty', exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: 'Editar persona' });
    assert.equal(
      await dialog.getByLabel('Nueva contraseña (opcional)', { exact: true }).count(),
      0,
    );
    await dialog.getByLabel('Cambiar contraseña', { exact: true }).check();
    await dialog.getByText('Sin contraseña', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await json(login, 'POST', '/auth/login', { identifier: uiUser.username, password: '' });
    const browserContext = await page
      .context()
      .browser()
      .newContext({ baseURL: 'http://localhost:4174' });
    browserContexts.push(browserContext);
    const own = await browserContext.newPage();
    await own.clock.install();
    await own.goto('/');
    await own.locator('input[autocomplete="username"]').fill(uiUser.username);
    await own.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).click();
    await own.getByRole('heading', { name: 'Tu bandeja.', exact: true }).waitFor();
    await json(admin, 'POST', '/chat', { isGroup: false, users: [uiUser.id] });
    await own.bringToFront();
    await own.evaluate(() => window.dispatchEvent(new Event('focus')));
    await poll(async () => (await json(admin, 'GET', '/chat/presence'))[uiUser.id] === 'online');
    await own.clock.fastForward(5 * 60 * 1000 + 30_000);
    await poll(async () => (await json(admin, 'GET', '/chat/presence'))[uiUser.id] === 'away');
    await own.evaluate(() => window.dispatchEvent(new Event('focus')));
    await poll(async () => (await json(admin, 'GET', '/chat/presence'))[uiUser.id] === 'online');
    await own.evaluate(() => window.dispatchEvent(new Event('blur')));
    // Use visibility to test backgrounding without relying on headless window-manager focus.
    await own.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await poll(async () => (await json(admin, 'GET', '/chat/presence'))[uiUser.id] === 'away');
    await own.evaluate(() => {
      delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await poll(async () => (await json(admin, 'GET', '/chat/presence'))[uiUser.id] === 'online');
    await own.clock.resume();
    await own.goto('/#settings/account');
    await own.getByLabel('Nueva contraseña', { exact: true }).fill('9');
    await own.locator('.password-strength[data-strength="0"]').waitFor();
    const changed = own.waitForResponse(
      (r) => r.url().endsWith('/api/auth/password') && r.status() === 204,
    );
    await own.getByRole('button', { name: 'Cambiar contraseña', exact: true }).click();
    await changed;
    await own.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).waitFor();
    await own.locator('input[autocomplete="username"]').fill(uiUser.username);
    await own.getByLabel('Contraseña', { exact: true }).fill('9');
    const signedIn = own.waitForResponse(
      (r) => r.url().endsWith('/api/auth/login') && r.status() === 200,
    );
    await own.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).click();
    await signedIn;
    await own.goto('/#inbox');
    await own.getByRole('heading', { name: 'Tu bandeja.', exact: true }).waitFor();
    await browserContext.close();
    browserContexts.pop();
    pass(
      'Browser signs in with an empty password and changes it to one character; visibility, idle timeout and resumed activity update presence live',
    );
    pass(
      'Password meter is advisory, recognizes common sequences, fits desktop/mobile in both themes and creates empty-password users without silently resetting edited accounts',
    );

    const alice = await create('Presence Alice', password);
    const bob = await create('Presence Bob', password);
    const outsider = await create('Presence Outsider', password);
    const a = await client();
    const b = await client();
    const x = await client();
    for (const [c, user] of [
      [a, alice],
      [b, bob],
      [x, outsider],
    ])
      await json(c, 'POST', '/auth/login', { identifier: user.username, password });
    const direct = await json(admin, 'POST', '/chat', { isGroup: false, users: [alice.id] });
    const group = await json(admin, 'POST', '/chat', {
      isGroup: true,
      name: 'Presence group QA',
      users: [alice.id, bob.id],
    });
    async function connect(c) {
      const controller = new AbortController();
      const cookie = (await c.storageState()).cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      const response = await fetch('http://127.0.0.1:5213/api/chat/events', {
        headers: { Cookie: cookie },
        signal: controller.signal,
      });
      assert.equal(response.status, 200);
      const reader = response.body.getReader();
      streams.push({ controller, reader });
      let buffer = '';
      while (!buffer.includes('event: ready'))
        buffer += new TextDecoder().decode((await reader.read()).value);
      const id = JSON.parse(buffer.match(/event: ready\ndata: (.*)\n/)[1]).connectionId;
      // Keep draining so the server can observe disconnects and emit real SSE changes.
      void (async () => {
        try {
          while (!(await reader.read()).done) {
            /* drain */
          }
        } catch {
          /* aborted during cleanup */
        }
      })();
      return { id, controller };
    }
    const at = await connect(a);
    const at2 = await connect(a);
    const bt = await connect(b);
    await json(x, 'PUT', `/chat/presence/${at.id}`, { active: true }, 404);
    await json(a, 'PUT', `/chat/presence/${crypto.randomUUID()}`, { active: true }, 404);
    assert.equal((await json(x, 'GET', '/chat/presence'))[alice.id], undefined);
    assert.equal((await json(x, 'GET', '/chat/presence'))[adminUser.id], undefined);
    await json(a, 'PUT', `/chat/presence/${at.id}`, { active: true }, 204);
    await json(a, 'PUT', `/chat/presence/${at2.id}`, { active: false }, 204);
    await json(b, 'PUT', `/chat/presence/${bt.id}`, { active: false }, 204);
    assert.equal((await json(admin, 'GET', '/chat/presence'))[alice.id], 'online');
    assert.equal((await json(admin, 'GET', '/chat/presence'))[bob.id], 'away');
    pass(
      'Presence API only exposes current chat contacts and rejects impersonated or fabricated SSE tokens',
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/#chat/${direct.id}`);
    await page.locator('.chat-head').getByText('Conectado', { exact: true }).waitFor();
    await json(a, 'PUT', `/chat/presence/${at.id}`, { active: false }, 204);
    await page.locator('.chat-head').getByText('Ausente', { exact: true }).waitFor();
    await json(a, 'PUT', `/chat/presence/${at2.id}`, { active: true }, 204);
    await page.locator('.chat-head').getByText('Conectado', { exact: true }).waitFor();
    at.controller.abort();
    await poll(async () => (await json(admin, 'GET', '/chat/presence'))[alice.id] === 'online');
    at2.controller.abort();
    await page.locator('.chat-head').getByText('Desconectado', { exact: true }).waitFor();
    pass(
      'Private chat status changes live, aggregates multiple tabs and goes offline when the final stream closes',
    );
    await page.goto(`/#chat/${group.id}`);
    await page
      .locator('.chat-head .chat-group-presence')
      .filter({ hasText: '1 ausente' })
      .waitFor();
    await page.getByRole('button', { name: 'Integrantes del grupo', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Integrantes del grupo' });
    await dialog.getByText('Ausente', { exact: true }).waitFor();
    await dialog.getByText('Desconectado', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    for (const [width, height, theme] of [
      [1440, 900, 'light'],
      [1440, 900, 'dark'],
      [390, 844, 'dark'],
      [320, 740, 'light'],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(artifacts, `chat-presence-${width}-${theme}.png`) });
    }
    await json(admin, 'PUT', `/users/${bob.id}`, { name: bob.name, role: bob.role, active: false });
    await poll(async () => !(bob.id in (await json(admin, 'GET', '/chat/presence'))));
    assert.equal((await json(a, 'GET', '/chat/presence'))[bob.id], undefined);
    pass(
      'Group headers and member details show live presence in both themes and mobile layouts; deactivated accounts are excluded',
    );
  } finally {
    for (const c of browserContexts) await c.close();
    for (const stream of streams) stream.controller.abort();
    for (const c of clients) await c.dispose();
  }
}
