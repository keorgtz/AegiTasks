import assert from 'node:assert/strict';
import path from 'node:path';

export async function testShellChatLayout({ page, admin, adminUser, json, pass, artifacts }) {
  const near = (actual, expected, label) =>
    assert.ok(Math.abs(actual - expected) <= 1, `${label}: ${actual} versus ${expected}`);
  const settle = () =>
    page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  const key = 'aegitasks-sidebar-compact-' + adminUser.id;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#inbox');
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
  near((await page.locator('.app-header').boundingBox()).height, 56, 'Compact titlebar');
  const sidebar = page.locator('.sidebar');
  await sidebar.getByRole('button', { name: 'Contraer barra lateral' }).click();
  near((await sidebar.boundingBox()).width, 72, 'Icon rail width');
  for (const name of [
    'Bandeja',
    'Notas',
    'Focus',
    'Chat',
    'Ajustes',
    'Explorar proyectos',
    'Cambiar espacio',
    'Archivados',
  ]) {
    const button = sidebar.getByRole('button', { name, exact: true });
    assert.ok(await button.isVisible(), name);
    assert.equal(await button.getAttribute('title'), name);
    const bounds = await button.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44, name);
  }
  near((await page.locator('.app-header').boundingBox()).x, 72, 'Titlebar follows rail');
  await page.reload();
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
  assert.ok(await sidebar.getByRole('button', { name: 'Expandir barra lateral' }).isVisible());
  await sidebar.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('heading', { name: 'Mi cuenta', exact: true }).waitFor();
  await sidebar.getByRole('button', { name: 'Explorar proyectos', exact: true }).focus();
  await sidebar.getByRole('button', { name: 'Explorar proyectos', exact: true }).press('Enter');
  const projects = page.getByRole('dialog', { name: 'Explorar proyectos' });
  await projects.getByRole('button', { name: 'Todos los proyectos' }).click();
  await page.waitForURL((url) => url.hash === '#projects');
  await sidebar.getByRole('button', { name: 'Expandir barra lateral' }).click();
  assert.ok(await sidebar.locator('#sidebar-workspace').isVisible());
  near((await sidebar.boundingBox()).width, 244, 'Expanded navigation restored');
  await page.screenshot({ path: path.join(artifacts, 'shell-expanded-desktop.png') });
  pass(
    'Desktop icon rail persists per account, keeps named/touch-sized controls, follows content and supports keyboard access to projects/settings',
  );

  await page.goto('/#inbox');
  for (const [width, height, theme] of [
    [320, 740, 'light'],
    [390, 844, 'dark'],
    [430, 932, 'light'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const route of ['inbox', 'notes', 'focus', 'chat']) {
      await page.goto(`/#${route}`);
      const bottom = page.getByRole('navigation', { name: 'Navegación móvil', exact: true });
      await bottom.getByRole('button', { name: 'Más', exact: true }).waitFor();
      assert.deepEqual(await bottom.locator('button > span').allTextContents(), [
        'Bandeja',
        'Chat',
        'Notas',
        'Focus',
        'Más',
      ]);
      await bottom.getByRole('button', { name: 'Más', exact: true }).click();
      const more = page.getByRole('dialog', { name: 'Más opciones', exact: true });
      const menu = more.locator('.mobile-menu');
      for (const button of await menu.locator('.sidebar-link').all()) {
        const bounds = await button.boundingBox();
        const grid = await menu.boundingBox();
        const padding = await menu.evaluate((element) => {
          const style = getComputedStyle(element);
          return parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        });
        assert.ok(
          bounds.width >= 100 && bounds.width >= (grid.width - padding) / 2 - 10,
          `${route}: menu buttons must fill their grid cell, ${JSON.stringify(bounds)}`,
        );
        assert.ok(bounds.height >= 44);
        assert.ok(bounds.x >= grid.x && bounds.x + bounds.width <= grid.x + grid.width + 1);
        const icons = button.locator('svg');
        assert.ok((await icons.count()) >= 1);
        for (const icon of await icons.all()) {
          const glyph = await icon.boundingBox();
          assert.ok(
            glyph.width >= 15 &&
              glyph.x >= bounds.x &&
              glyph.x + glyph.width <= bounds.x + bounds.width + 1,
            `${route}: readable icon inside its button`,
          );
        }
      }
      const standaloneOptions = await menu.locator(':scope > button.sidebar-link').all();
      const collapsedHeights = await Promise.all(
        standaloneOptions.map(async (button) => (await button.boundingBox()).height),
      );
      await more.getByRole('button', { name: 'Ajustes', exact: true }).click();
      await more.getByRole('navigation', { name: 'Submenú de ajustes', exact: true }).waitFor();
      for (const [index, button] of standaloneOptions.entries()) {
        near(
          (await button.boundingBox()).height,
          collapsedHeights[index],
          `${route}/${width}/${theme}: opening settings must not stretch ${await button.innerText()}`,
        );
      }
      await page.screenshot({
        path: path.join(artifacts, `more-menu-expanded-${route}-${width}-${theme}.png`),
      });
      await more.getByRole('button', { name: 'Ajustes', exact: true }).click();
      await page.screenshot({
        path: path.join(artifacts, `more-menu-${route}-${width}-${theme}.png`),
      });
      await more.press('Escape');
      assert.ok(await bottom.getByRole('button', { name: 'Más', exact: true }).isVisible());
    }
  }
  await page
    .getByRole('navigation', { name: 'Navegación móvil', exact: true })
    .getByRole('button', { name: 'Más', exact: true })
    .click();
  const navigationMenu = page.getByRole('dialog', { name: 'Más opciones', exact: true });
  await navigationMenu.getByRole('button', { name: 'Notas', exact: true }).click();
  await page.waitForURL((url) => url.hash === '#notes');
  assert.equal(await navigationMenu.count(), 0);
  pass(
    'Mobile More options keep natural button heights with expanded Settings on Inbox, Notes, Focus and Chat at 320/390/430px in both themes; icons, close and navigation work',
  );
  await page.goto('/#inbox');
  for (const [width, height, theme] of [
    [320, 640, 'light'],
    [360, 740, 'dark'],
    [390, 844, 'dark'],
    [430, 932, 'light'],
    [844, 390, 'dark'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    await settle();
    const nav = await page.locator('.bottom-nav').boundingBox();
    near(nav.y + nav.height, height, 'Bottom navigation at screen edge');
    near(nav.height, 56, 'No extra bottom spacer');
    near((await page.locator('.app-header').boundingBox()).height, 56, 'Mobile titlebar');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const button of await page.locator('.bottom-nav button').all()) {
      const bounds = await button.boundingBox();
      assert.ok(bounds.height >= 44 && bounds.width >= 44);
    }
    await page.screenshot({ path: path.join(artifacts, `shell-mobile-${width}-${theme}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.app-shell').evaluate((shell) => {
    shell.style.setProperty('--safe-top', '24px');
    shell.style.setProperty('--safe-bottom', '34px');
  });
  near((await page.locator('.app-header').boundingBox()).height, 80, 'Top inset once');
  const insetNav = await page.locator('.bottom-nav').boundingBox();
  near(insetNav.height, 90, 'Home-indicator inset once');
  near(
    await page
      .locator('.bottom-nav')
      .evaluate((nav) => parseFloat(getComputedStyle(nav).paddingBottom)),
    38,
    'Only one inset in bottom padding',
  );
  near(insetNav.y + insetNav.height, 844, 'Safe navigation at edge');
  await page.locator('.app-shell').evaluate((shell) => shell.removeAttribute('style'));
  pass(
    'Phone/landscape titlebar and bottom navigation stay compact and edge-aligned in both themes; simulated safe areas are reserved exactly once',
  );

  const directory = await json(admin, 'GET', '/chat/users?q=');
  const contact = directory.items.find((user) => user.id !== adminUser.id);
  const room = await json(admin, 'POST', '/chat', { isGroup: false, users: [contact.id] });
  await page.goto(`/#chat/${room.id}`);
  await page.getByLabel('Mensaje', { exact: true }).waitFor();
  const message = page.getByLabel('Mensaje', { exact: true });
  for (const [width, height, theme] of [
    [1440, 900, 'light'],
    [1920, 1080, 'dark'],
    [844, 390, 'dark'],
    [390, 844, 'dark'],
    [320, 640, 'light'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    await page.waitForFunction(
      () =>
        document.querySelector('.chat-composer').getBoundingClientRect().bottom <= innerHeight + 1,
    );
    await settle();
    const chat = await page.locator('.chat-page').boundingBox();
    const composer = await page.locator('.chat-composer').boundingBox();
    assert.ok(composer.y + composer.height <= height + 1);
    near(chat.y, 0, 'Conversation begins at top');
    near(chat.height, height, 'Conversation owns viewport');
    assert.equal(await page.locator('.app-header').isVisible(), false);
    assert.equal(await page.locator('.bottom-nav').isVisible(), false);
    const entry = await message.boundingBox();
    const send = await page.getByRole('button', { name: 'Enviar', exact: true }).boundingBox();
    near(entry.height, 44, 'Single line input');
    near(send.height, entry.height, 'Send and input match');
    assert.ok(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    );
    if (width >= 768) {
      assert.ok(await sidebar.isVisible());
      near((await sidebar.boundingBox()).width, 72, 'Chat defaults to icon rail');
      near(chat.x, 72, 'No desktop outer margin');
      near(chat.width, width - 72, 'Chat fills remaining width');
      assert.ok(await page.locator('.chat-sidebar').isVisible());
      const rail = await page.locator('.sidebar-rail').boundingBox();
      assert.ok(rail.height >= 88, 'Short windows retain usable navigation');
      if (height <= 600) {
        await sidebar.getByRole('button', { name: 'Más opciones', exact: true }).click();
        const more = page.getByRole('dialog', { name: 'Más opciones', exact: true });
        assert.ok(await more.getByRole('button', { name: 'Mi cuenta', exact: true }).isVisible());
        assert.ok(
          await more.getByRole('button', { name: 'Cerrar sesión', exact: true }).isVisible(),
        );
        await more.press('Escape');
      }
    } else {
      assert.equal(await sidebar.isVisible(), false);
      assert.equal(await page.locator('.chat-sidebar').isVisible(), false);
      near(chat.x, 0, 'Mobile has no outer margin');
      assert.ok(await page.getByRole('button', { name: 'Volver a conversaciones' }).isVisible());
    }
    await message.fill('Una línea\nSegunda línea\nTercera línea\nCuarta línea');
    assert.ok((await message.boundingBox()).height > 44);
    await message.fill(Array.from({ length: 30 }, (_, n) => `Línea ${n}`).join('\n'));
    assert.ok((await message.boundingBox()).height <= Math.min(160, height * 0.25) + 1);
    assert.ok(await message.evaluate((field) => field.scrollHeight > field.clientHeight));
    assert.ok((await page.locator('.chat-messages').boundingBox()).height > height * 0.5);
    await message.fill('');
    near((await message.boundingBox()).height, 44, 'Composer shrinks after clearing');
    await page.screenshot({ path: path.join(artifacts, `chat-immersive-${width}-${theme}.png`) });
  }
  pass(
    'Chats fill desktop with an icon rail/two panes and mobile with only conversation; the one-line composer grows, caps and shrinks without pushing Send offscreen',
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Volver a conversaciones' }).click();
  await page.getByRole('button', { name: 'Nuevo chat', exact: true }).waitFor();
  assert.ok(await page.locator('.app-header').isVisible());
  assert.ok(await page.locator('.bottom-nav').isVisible());
  await page
    .getByRole('navigation', { name: 'Conversaciones' })
    .getByRole('button')
    .filter({ hasText: contact.name })
    .click();
  await message.fill('Borrador que se conserva');
  await page.getByRole('button', { name: 'Agregar al mensaje' }).click();
  const attachments = page.getByRole('dialog', { name: 'Agregar al mensaje' });
  assert.ok(
    await attachments.getByRole('button', { name: 'Adjuntar archivos', exact: true }).isVisible(),
  );
  assert.ok(
    await attachments.getByRole('button', { name: 'Compartir pendiente', exact: true }).isVisible(),
  );
  await attachments.press('Escape');
  assert.equal(await message.inputValue(), 'Borrador que se conserva');
  await message.fill('');
  pass(
    'Mobile back restores app navigation and the attachment dialog retains file/task actions and unsent drafts',
  );

  await page.locator('.app-shell').evaluate((shell) => {
    shell.style.setProperty('--safe-top', '24px');
    shell.style.setProperty('--safe-bottom', '34px');
  });
  near((await page.locator('.chat-head').boundingBox()).height, 81, 'Chat top safety inset');
  near((await page.locator('.chat-composer').boundingBox()).height, 95, 'Composer safe area once');
  await message.focus();
  await page.evaluate(() => {
    const viewport = visualViewport;
    Object.defineProperty(viewport, 'height', { configurable: true, value: 420 });
    Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 25 });
    viewport.dispatchEvent(new Event('resize'));
  });
  await settle();
  const keyboardComposer = await page.locator('.chat-composer').boundingBox();
  near(
    keyboardComposer.y + keyboardComposer.height,
    445,
    'Composer follows visible keyboard viewport',
  );
  near(keyboardComposer.height, 61, 'No home-indicator gap over keyboard');
  await page.screenshot({ path: path.join(artifacts, 'chat-keyboard-simulated.png') });
  await page.evaluate(() => {
    delete visualViewport.height;
    delete visualViewport.offsetTop;
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await page.locator('.app-shell').evaluate((shell) => shell.removeAttribute('style'));
  await message.fill('Mensaje desde el nuevo compositor');
  const sent = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/chat/${room.id}/messages`) &&
      response.request().method() === 'POST' &&
      response.status() === 200,
  );
  await message.press('Control+Enter');
  await (await sent).finished();
  await page
    .locator('.chat-message-text')
    .getByText('Mensaje desde el nuevo compositor', { exact: true })
    .waitFor();
  await page.waitForFunction(() => document.querySelector('.chat-composer textarea').value === '');
  near((await message.boundingBox()).height, 44, 'Sending resets input');
  pass(
    'Simulated mobile keyboard resize/pan keeps composer visible without doubled safe-area padding; keyboard shortcut still sends and resets text',
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#inbox');
  await page.evaluate((key) => localStorage.removeItem(key), key);
  await page.reload();
  await page.getByRole('heading', { name: 'Tu bandeja.' }).waitFor();
}
