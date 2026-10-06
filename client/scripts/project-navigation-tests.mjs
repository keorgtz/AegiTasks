import assert from 'node:assert/strict';
import path from 'node:path';

export async function testProjectNavigation({ page, admin, fixtures, json, pass, artifacts }) {
  const project = fixtures.project;
  const base = `http://localhost:4174/#project/${project.id}`;
  const sidebar = page.locator('.sidebar');
  const tree = () =>
    sidebar.getByRole('navigation', { name: 'Secciones del proyecto', exact: true });
  const palette = (dialog) =>
    dialog.getByRole('group', { name: 'Color de la agrupación', exact: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  await tree().getByRole('button', { name: 'Pendientes', exact: true }).waitFor();
  assert.equal(await page.locator('.project-sections').count(), 0);
  assert.equal(
    await page
      .locator('.app-content')
      .getByRole('navigation', { name: 'Secciones del proyecto' })
      .count(),
    0,
  );
  const root = sidebar.getByRole('button', { name: project.name, exact: true });
  assert.equal(await root.getAttribute('aria-expanded'), 'true');
  await root.click();
  assert.equal(await root.getAttribute('aria-expanded'), 'false');
  assert.equal(await tree().count(), 0);
  await root.focus();
  await page.keyboard.press('Space');
  await tree().getByRole('button', { name: 'Módulos', exact: true }).waitFor();
  for (const [name, section] of [
    ['Módulos', 'modules'],
    ['Ciclos', 'cycles'],
    ['Pendientes', ''],
  ]) {
    await tree().getByRole('button', { name, exact: true }).click();
    await page.waitForURL(
      (url) => url.hash === `#project/${project.id}${section ? `/${section}` : ''}`,
    );
    await page.waitForFunction(
      (name) =>
        document
          .querySelector('.sidebar .project-tree-link[aria-current="page"]')
          ?.textContent.trim() === name,
      name,
    );
    assert.equal(
      await tree().getByRole('button', { name, exact: true }).getAttribute('aria-current'),
      'page',
    );
  }
  await page.goto(`${base}/modules/${fixtures.mod.id}`);
  await page.getByRole('heading', { name: fixtures.mod.name, exact: true }).waitFor();
  assert.equal(
    await tree().getByRole('button', { name: 'Módulos', exact: true }).getAttribute('aria-current'),
    'page',
  );
  await page.reload();
  await tree().getByRole('button', { name: 'Módulos', exact: true }).waitFor();
  assert.equal(await root.getAttribute('aria-expanded'), 'true');
  pass(
    'Project sections move into the sidebar tree; native keyboard disclosure, collapse, navigation and active deep links work without content tabs',
  );

  const created = [];
  for (let i = 0; i < 9; i++)
    created.push(
      await json(admin, 'POST', '/projects', {
        name:
          i === 8
            ? 'ZZ Árbol de proyectos con nombre largo para comprobar el espacio lateral'
            : `ZZ Árbol navegación ${i}`,
        color: 'purple',
      }),
    );
  const last = created[created.length - 1];
  // API-created fixtures must reach the client catalog before hash navigation.
  await page.reload();
  await tree().getByRole('button', { name: 'Módulos', exact: true }).waitFor();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      localStorage.setItem('aegitasks-theme', t);
    }, theme);
    for (const height of [900, 768, 600, 450]) {
      await page.setViewportSize({ width: 1366, height });
      await page.goto(`http://localhost:4174/#project/${last.id}/cycles`);
      await tree().getByRole('button', { name: 'Ciclos', exact: true }).waitFor();
      assert.equal(
        await tree()
          .getByRole('button', { name: 'Ciclos', exact: true })
          .getAttribute('aria-current'),
        'page',
      );
      assert.ok(
        await sidebar.evaluate((s) => s.scrollHeight <= s.clientHeight + 1),
        `sidebar ${height} ${theme}`,
      );
      assert.ok(
        await sidebar
          .locator('.sidebar-panel')
          .evaluate((s) => s.scrollHeight <= s.clientHeight + 1),
        `tree panel ${height} ${theme}`,
      );
      if (height >= 600) assert.equal(await tree().getByRole('button').count(), 3);
      const previous = sidebar.getByRole('button', { name: 'Opciones anteriores', exact: true });
      while ((await previous.count()) && (await previous.isEnabled())) await previous.click();
      const names = new Set();
      while (true) {
        for (const name of await sidebar.locator('.project-link').allTextContents())
          names.add(name.trim());
        const next = sidebar.getByRole('button', { name: 'Más opciones', exact: true });
        if (!(await next.count()) || (await next.isDisabled())) break;
        await next.click();
      }
      assert.ok(names.has(last.name));
      assert.ok(names.has(project.name));
      if (height === 600)
        await page.screenshot({ path: path.join(artifacts, `project-tree-600-${theme}.png`) });
    }
  }
  for (const item of created) await json(admin, 'DELETE', `/projects/${item.id}`, undefined, 204);
  pass(
    'Project trees keep child links together when height permits, paginate all projects and remain scroll-free at 900/768/600/450px in both themes',
  );

  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      localStorage.setItem('aegitasks-theme', t);
    }, theme);
    for (const [width, height] of [
      [390, 844],
      [320, 740],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(base);
      await page.getByRole('button', { name: 'Explorar proyecto', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Explorar proyectos', exact: true });
      assert.equal(
        await dialog
          .getByRole('navigation', { name: 'Secciones del proyecto', exact: true })
          .getByRole('button')
          .count(),
        3,
      );
      assert.ok(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth));
      await dialog.getByRole('button', { name: 'Módulos', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('heading', { name: 'Módulos', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Explorar proyecto', exact: true }).click();
      await dialog.getByRole('button', { name: 'Ciclos', exact: true }).waitFor();
      await page.screenshot({
        path: path.join(artifacts, `project-tree-mobile-${width}-${theme}.png`),
      });
      await page.keyboard.press('Escape');
      assert.ok(page.url().endsWith(`/modules`));
      assert.equal(await page.locator('.project-sections').count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
  }
  pass(
    'Mobile project navigation uses a compact tree dialog with active sections, touch-sized controls, cancellation and no top tabs in both themes',
  );

  for (const [kind, label, color, colorName] of [
    ['modules', 'módulo', 'blue', 'Azul'],
    ['cycles', 'ciclo', 'green', 'Verde'],
  ]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/${kind}`);
    await page.getByRole('button', { name: `Crear ${label}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Crear ${label}`, exact: true });
    assert.equal(await palette(dialog).getByRole('button').count(), 6);
    assert.equal(await dialog.locator('select').count(), 0);
    await page.getByLabel(`Nombre del ${label}`).fill(`Muestrario ${kind} UI`);
    await palette(dialog).getByRole('button', { name: colorName, exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(
      await palette(dialog)
        .getByRole('button', { name: colorName, exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    for (const [width, height, theme] of [
      [1440, 900, 'dark'],
      [320, 740, 'light'],
      [844, 390, 'dark'],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        localStorage.setItem('aegitasks-theme', t);
      }, theme);
      assert.ok(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth));
      for (const button of await palette(dialog).getByRole('button').all())
        assert.ok(
          await button.evaluate(
            (b) => b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44,
          ),
        );
      await page.screenshot({
        path: path.join(artifacts, `planning-swatches-${kind}-${width}-${theme}.png`),
      });
    }
    await dialog.getByRole('button', { name: 'Guardar agrupación', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: `Muestrario ${kind} UI`, exact: true }).waitFor();
    const group = (await json(admin, 'GET', '/workspace'))[kind].find(
      (g) => g.name === `Muestrario ${kind} UI`,
    );
    assert.equal(group.color, color);
    await page.getByRole('button', { name: `Editar ${label}`, exact: true }).click();
    const edit = page.getByRole('dialog', { name: `Editar ${label}`, exact: true });
    assert.equal(
      await palette(edit)
        .getByRole('button', { name: colorName, exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    await palette(edit).getByRole('button', { name: 'Coral', exact: true }).click();
    await edit.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(
      (await json(admin, 'GET', '/workspace'))[kind].find((g) => g.id === group.id).color,
      color,
    );
    await json(admin, 'DELETE', `/${kind}/${group.id}`, undefined, 204);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await sidebar.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click();
  const projectDialog = page.getByRole('dialog', { name: 'Crear proyecto', exact: true });
  assert.equal(
    await projectDialog
      .getByRole('group', { name: 'Color', exact: true })
      .getByRole('button')
      .count(),
    6,
  );
  await projectDialog.getByRole('button', { name: 'Azul', exact: true }).click();
  assert.equal(
    await projectDialog
      .getByRole('button', { name: 'Azul', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  await page.keyboard.press('Escape');
  pass(
    'Modules and cycles share the exact project color swatches; keyboard selection, persisted editing, cancel and 44px wrapping work on desktop/phone/landscape',
  );
}
