import assert from 'node:assert/strict';
import path from 'node:path';
import { createECDH, randomBytes } from 'node:crypto';

export async function testSettings({
  page,
  admin,
  adminUser,
  shared,
  json,
  password,
  pass,
  artifacts,
}) {
  const origin = 'http://localhost:4174';
  const project = await json(admin, 'POST', '/projects', {
    name: 'Settings UX QA',
    color: 'purple',
  });
  const workspace = await json(admin, 'GET', '/workspace');
  const task = await json(admin, 'POST', '/tasks', {
    title: 'Onboarding defer fixture',
    projectId: project.id,
    statusId: workspace.statuses.find((s) => s.projectId === project.id && !s.isDone).id,
    tagIds: [],
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?space=${shared.id}#settings/organization`);
  const main = page.locator('.settings-main');
  await main.getByRole('heading', { name: 'Ajustes', exact: true }).waitFor();
  await main.getByLabel('Proyecto a configurar', { exact: true }).selectOption('');
  assert.equal(await main.getByRole('button', { name: 'Crear carpeta' }).isDisabled(), true);
  await main.getByText('Selecciona un proyecto para gestionar sus estados.').waitFor();
  await main.getByLabel('Proyecto a configurar', { exact: true }).selectOption(project.id);
  await main.getByRole('button', { name: 'Crear carpeta' }).click();
  let dialog = page.getByRole('dialog', { name: 'Crear carpeta', exact: true });
  await dialog.getByLabel('Nombre', { exact: true }).fill('Settings folder QA');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await main.getByRole('button', { name: 'Editar carpeta Settings folder QA' }).waitFor();
  await main.getByRole('button', { name: 'Crear estado' }).click();
  dialog = page.getByRole('dialog', { name: 'Crear estado', exact: true });
  await dialog.getByLabel('Nombre', { exact: true }).fill('Settings reviewed QA');
  await dialog.getByLabel('Este estado cuenta como resuelto').check();
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await main.getByRole('button', { name: 'Editar estado Settings reviewed QA' }).waitFor();
  await main.getByRole('button', { name: 'Crear etiqueta' }).click();
  dialog = page.getByRole('dialog', { name: 'Crear etiqueta', exact: true });
  await dialog.getByLabel('Nombre', { exact: true }).fill('SETTINGS_QA');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await main.getByRole('button', { name: 'Editar etiqueta SETTINGS_QA' }).waitFor();
  const saved = await json(admin, 'GET', '/workspace');
  assert.ok(
    saved.folders.some((f) => f.name === 'Settings folder QA' && f.projectId === project.id),
  );
  assert.ok(
    saved.statuses.some(
      (s) => s.name === 'Settings reviewed QA' && s.projectId === project.id && s.isDone,
    ),
  );
  assert.ok(saved.tags.some((t) => t.name === 'SETTINGS_QA'));
  pass(
    'Sectioned organization clearly scopes project/folders/statuses and shared tags; empty states and real creation persist',
  );
  const pages = [
    ['organization', 'Ajustes'],
    ['workspace', 'Spaces'],
    ['users', 'Usuarios y roles'],
    ['account', 'Mi cuenta'],
    ['notifications', 'Notificaciones'],
  ];
  for (const [width, height, theme] of [
    [1440, 900, 'light'],
    [1440, 900, 'dark'],
    [390, 844, 'dark'],
    [320, 740, 'light'],
    [844, 450, 'dark'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    for (const [route, heading] of pages) {
      if (width <= 1023)
        await page
          .getByLabel('Sección de ajustes', { exact: true })
          .selectOption(`settings/${route}`);
      else
        await page
          .getByRole('navigation', { name: 'Secciones de ajustes' })
          .getByRole('button', {
            name:
              heading === 'Ajustes'
                ? 'Organización'
                : route === 'workspace'
                  ? 'Workspace'
                  : heading,
            exact: true,
          })
          .click();
      await main.getByRole('heading', { name: heading, exact: true }).waitFor();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: path.join(artifacts, `settings-${route}-${width}-${theme}.png`),
        fullPage: true,
      });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${route} fits ${width}`,
      );
      if (route === 'account') {
        await main.getByRole('heading', { name: 'Datos de tu cuenta' }).waitFor();
        await main.getByRole('heading', { name: 'Seguridad' }).waitFor();
      }
    }
  }
  pass(
    'All five settings sections navigate and fit desktop, mobile, narrow phone and landscape in both themes',
  );
  assert.equal(
    await page
      .getByRole('dialog', { name: '¿Activar notificaciones en este dispositivo?' })
      .count(),
    0,
  );
  pass('A normal browser tab never asks for installed-app notification onboarding');
  await page.setViewportSize({ width: 1440, height: 900 });
  const storage = await page.context().storageState();
  const browser = page.context().browser();
  const contexts = [];
  const key = createECDH('prime256v1');
  key.generateKeys();
  const fake = {
    endpoint: 'https://fcm.googleapis.com/push/settings-qa-' + randomBytes(10).toString('hex'),
    keys: {
      p256dh: key.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
  async function installedPage({
    stored = storage,
    permission = 'default',
    subscribed = false,
    unsupported = false,
  } = {}) {
    const context = await browser.newContext({
      baseURL: origin,
      storageState: stored,
      viewport: { width: 390, height: 844 },
    });
    contexts.push(context);
    await context.addInitScript(
      ({ fake, permission, subscribed, unsupported }) => {
        const realMatchMedia = window.matchMedia.bind(window);
        window.matchMedia = (query) => {
          const value = realMatchMedia(query);
          if (query === '(display-mode: standalone)')
            Object.defineProperty(value, 'matches', { get: () => true });
          return value;
        };
        window.__permissionRequests = 0;
        let current = sessionStorage.getItem('qa-push-permission') || permission;
        Object.defineProperty(Notification, 'permission', {
          configurable: true,
          get: () => current,
        });
        Notification.requestPermission = async () => {
          window.__permissionRequests++;
          current = 'granted';
          sessionStorage.setItem('qa-push-permission', current);
          return current;
        };
        if (unsupported) {
          Object.defineProperty(window, 'PushManager', { value: undefined });
          return;
        }
        const subscription = {
          options: {},
          toJSON: () => fake,
          unsubscribe: async () => {
            sessionStorage.removeItem('qa-push-subscription');
            return true;
          },
        };
        PushManager.prototype.getSubscription = async () =>
          subscribed || sessionStorage.getItem('qa-push-subscription') ? subscription : null;
        PushManager.prototype.subscribe = async () => {
          sessionStorage.setItem('qa-push-subscription', 'yes');
          return subscription;
        };
      },
      { fake, permission, subscribed, unsupported },
    );
    const tab = await context.newPage();
    return { context, tab };
  }
  try {
    let { tab } = await installedPage();
    await tab.goto(`/?space=${shared.id}#inbox`);
    const welcome = tab.getByRole('dialog', {
      name: '¿Activar notificaciones en este dispositivo?',
      exact: true,
    });
    await welcome.waitFor();
    assert.equal(
      await tab.evaluate(
        (id) => localStorage.getItem(`aegitasks-push-introduction-v1-${id}`),
        adminUser.id,
      ),
      'seen',
    );
    assert.equal(await tab.evaluate(() => window.__permissionRequests), 0);
    await tab.screenshot({ path: path.join(artifacts, 'settings-installed-welcome-mobile.png') });
    await welcome.getByRole('button', { name: 'Ahora no' }).click();
    await tab.reload();
    await tab.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
    assert.equal(await welcome.count(), 0);
    const introduced = await tab.context().storageState();
    pass(
      'First installed launch invites without native permission requests; dismissal persists across reopening',
    );
    ({ tab } = await installedPage());
    await tab.goto(`/?space=${shared.id}&task=${task.id}#inbox`);
    await tab.getByRole('dialog', { name: 'Detalle del pendiente' }).waitFor();
    assert.equal(
      await tab
        .getByRole('dialog', { name: '¿Activar notificaciones en este dispositivo?' })
        .count(),
      0,
    );
    await tab
      .getByRole('dialog', { name: 'Detalle del pendiente' })
      .getByRole('button', { name: 'Cerrar', exact: true })
      .click();
    await tab
      .getByRole('dialog', { name: '¿Activar notificaciones en este dispositivo?' })
      .getByRole('button', { name: 'Activar notificaciones', exact: true })
      .click();
    await tab.waitForFunction(() => !document.querySelector('dialog[open]'));
    assert.equal(await tab.evaluate(() => window.__permissionRequests), 1);
    await tab.goto('#settings/notifications');
    await tab.getByText('Avisos activados en este dispositivo').waitFor();
    await tab.reload();
    await tab.getByText('Avisos activados en este dispositivo').waitFor();
    assert.equal(
      await tab
        .getByRole('dialog', { name: '¿Activar notificaciones en este dispositivo?' })
        .count(),
      0,
    );
    await tab.getByRole('button', { name: 'Desactivar', exact: true }).click();
    await tab
      .getByText('Notificaciones desactivadas en este dispositivo. El historial sigue disponible.')
      .waitFor();
    pass(
      'Installed invitation defers for an existing detail dialog; activation is explicit, registered and retained after reopening',
    );
    ({ tab } = await installedPage({ permission: 'denied' }));
    await tab.goto(`/?space=${shared.id}#inbox`);
    const blocked = tab.getByRole('dialog', {
      name: '¿Activar notificaciones en este dispositivo?',
    });
    await blocked.getByRole('button', { name: 'Ir a ajustes' }).click();
    await tab.getByText('Permiso bloqueado', { exact: true }).waitFor();
    assert.equal(await tab.evaluate(() => window.__permissionRequests), 0);
    pass(
      'Blocked permission opens clear device settings without attempting to force a native permission prompt',
    );
    const configured = await installedPage({ permission: 'granted', subscribed: true });
    const registration = await configured.context.request.post(
      origin + '/api/notifications/devices',
      { headers: { 'X-AegiTasks': '1' }, data: fake },
    );
    assert.equal(registration.status(), 200);
    await configured.tab.goto('/#settings/notifications');
    await configured.tab.getByText('Avisos activados en este dispositivo').waitFor();
    assert.equal(
      await configured.tab
        .getByRole('dialog', { name: '¿Activar notificaciones en este dispositivo?' })
        .count(),
      0,
    );
    await configured.tab.getByRole('button', { name: 'Desactivar', exact: true }).click();
    await configured.tab
      .getByText('Notificaciones desactivadas en este dispositivo. El historial sigue disponible.')
      .waitFor();
    pass('An already-enabled installed device opens without asking to enable notifications again');
    const person = await json(admin, 'POST', '/users', {
      name: 'Settings user',
      email: 'settings-user@qa.example',
      password,
      role: 'User',
    });
    const another = await installedPage({ stored: introduced });
    await another.context.clearCookies();
    await another.tab.goto('/');
    await another.tab.getByLabel('Correo o nombre de usuario').fill(person.email);
    await another.tab.getByLabel('Contraseña', { exact: true }).fill(password);
    await another.tab.getByRole('button', { name: 'Entrar a mi espacio', exact: true }).click();
    await another.tab
      .getByRole('dialog', { name: '¿Activar notificaciones en este dispositivo?' })
      .getByRole('button', { name: 'Ahora no' })
      .click();
    await another.tab.goto('#settings/notifications');
    await another.tab.getByRole('heading', { name: 'Este dispositivo', exact: true }).waitFor();
    assert.equal(
      await another.tab
        .getByLabel('Sección de ajustes')
        .locator('option[value="settings/users"]')
        .count(),
      0,
    );
    pass(
      'Onboarding decisions are isolated by user; device settings remain available to User without exposing administration',
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
  await page.goto('/#inbox');
}
