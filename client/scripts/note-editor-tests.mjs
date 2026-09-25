import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { noteDiagrams } from '../src/noteDiagrams.ts';

export async function testNoteEditor({ page, context, admin, json, pass, artifacts }) {
  await json(admin, 'POST', '/spaces', { name: 'Note navigation QA' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://localhost:4174/#notes');
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).click();
  await page.locator('.note-editor-page .mode-split').waitFor();
  assert.equal(await page.locator('dialog[open]').count(), 0);
  await page.getByLabel('Título de nota').fill('Arquitectura y métricas');
  const source = page.getByLabel('Contenido Markdown');
  await source.fill(
    '# Documentación del equipo\n\nTexto **importante** y <span class="font-lora">una fuente editorial</span>.\n\n',
  );
  const requests = [];
  const observe = (request) => {
    if (!request.url().startsWith('http://localhost:')) requests.push(request.url());
  };
  page.on('request', observe);
  const diagrams = page.getByLabel('Insertar diagrama Mermaid');
  for (const value of ['flow', 'sequence', 'mindmap', 'er', 'gantt', 'pie', 'bar']) {
    await source.press('Control+End');
    await diagrams.selectOption(value);
  }
  await page.waitForFunction(
    () => document.querySelectorAll('[data-diagram-state="ready"]').length === 7,
  );
  assert.equal(await page.locator('.mermaid-svg svg').count(), 7);
  assert(
    await page
      .locator('.mermaid-svg svg')
      .evaluateAll((elements) =>
        elements.every((svg) => svg.hasAttribute('viewBox') && svg.getBBox().width > 100),
      ),
  );
  assert(
    await page
      .locator('.mermaid-svg .node rect')
      .first()
      .evaluate((rect) => Number(rect.getAttribute('width')) > 20),
  );
  assert.equal(
    await page.locator('.mermaid-svg foreignObject,.mermaid-svg script,.mermaid-svg image').count(),
    0,
  );
  assert.deepEqual(requests, []);
  page.off('request', observe);
  await page.locator('.note-details summary').click();
  assert.equal(await page.getByLabel('Tipografía', { exact: true }).locator('option').count(), 8);
  await page.getByLabel('Tipografía', { exact: true }).selectOption('lora');
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await page.locator('.note-editor-context').getByText('Guardado', { exact: true }).waitFor();
  const url = page.url();
  const id = new URL(url).hash.slice('#notes/'.length);
  let stored = await json(admin, 'GET', `/notes/${id}`);
  assert.equal(stored.font, 'lora');
  assert.equal((stored.markdown.match(/```mermaid/g) || []).length, 7);
  for (const font of [
    'sans',
    'serif',
    'mono',
    'source-serif',
    'jetbrains',
    'nunito',
    'plex',
    'lora',
  ]) {
    stored = await json(admin, 'PUT', `/notes/${id}`, { ...stored, font });
    assert.equal((await json(admin, 'GET', `/notes/${id}`)).font, font);
  }
  await json(admin, 'PUT', `/notes/${id}`, { ...stored, font: 'unknown-font' }, 400);
  assert.equal(
    await page.getByRole('button', { name: 'Dividida', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  await page.reload();
  await page.getByLabel('Contenido Markdown').waitFor();
  assert.equal(await source.inputValue(), stored.markdown);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-diagram-state="ready"]').length === 7,
  );
  await page.screenshot({ path: path.join(artifacts, 'notes-page-desktop.png') });
  pass(
    'Notes open as full pages with desktop split view, persistent deep links, eight fonts and seven locally rendered Mermaid templates',
  );

  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.locator('.note-details summary').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTML', exact: true }).click();
  const html = await readFile(await (await download).path(), 'utf8');
  await writeFile(path.join(artifacts, 'notes-export-mermaid.html'), html);
  assert.equal((html.match(/<svg\b/g) || []).length, 7);
  assert(html.includes('data:font/') || html.includes('data:application/'));
  assert(html.includes('@font-face'));
  assert(!html.includes('<script'));
  const exported = await context.newPage();
  await exported.setContent(html);
  assert.equal(await exported.locator('svg').count(), 7);
  await exported.screenshot({ path: path.join(artifacts, 'notes-export-mermaid.png') });
  await exported.close();
  await page.emulateMedia({ media: 'print' });
  assert(await page.locator('.markdown-preview').isVisible());
  assert(!(await source.isVisible()));
  assert(!(await page.locator('.note-editor-header').isVisible()));
  await page.pdf({ path: path.join(artifacts, 'notes-mermaid.pdf'), format: 'A4' });
  await page.emulateMedia({ media: 'screen' });
  pass(
    'HTML exports include seven sanitized SVG diagrams and embedded fonts from edit-only mode; print displays the note without app chrome',
  );

  await page.locator('.note-details summary').click();
  const original = await source.inputValue();
  await source.fill('```mermaid\nflowchart TD\n A[Invalid\n```');
  await page.waitForFunction(() => !!document.querySelector('[data-diagram-state="error"]'));
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await page.locator('.mermaid-error').waitFor();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await source.fill('```mermaid\n%%{init: {"securityLevel":"loose"}}%%\nflowchart TD\n A-->B\n```');
  await page.waitForFunction(() =>
    document.querySelector('.mermaid-error')?.textContent.includes('sin configuración'),
  );
  await source.fill(original);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Volver a notas', exact: true }).click();
  await page.waitForFunction((url) => location.href === url, url);
  assert.equal(await source.inputValue(), original);
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await page.locator('.note-editor-context').getByText('Guardado', { exact: true }).waitFor();
  pass(
    'Malformed Mermaid and embedded configuration show recoverable errors; cancelled navigation preserves the draft',
  );

  await page.getByRole('button', { name: 'Dividida', exact: true }).click();
  const expanded = await source.boundingBox();
  assert.equal(expanded.x, 0, 'The editor starts at the viewport edge, without sidebar');
  assert(expanded.height > 800, 'The canvas gets most of the desktop height');
  for (const selector of ['.sidebar', '.app-header', '.bottom-nav']) {
    assert(!(await page.locator(selector).isVisible()));
  }
  await page.getByRole('button', { name: 'Ocultar herramientas' }).click();
  assert(!(await diagrams.isVisible()));
  assert((await source.boundingBox()).height > expanded.height + 30);
  assert.equal(await source.inputValue(), original);
  assert(await page.getByRole('button', { name: 'Guardar nota', exact: true }).isVisible());
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  assert(await page.locator('.markdown-preview').isVisible());
  await page.screenshot({ path: path.join(artifacts, 'notes-workbench-collapsed.png') });
  await page.getByRole('button', { name: 'Dividida', exact: true }).click();
  await page.getByRole('button', { name: 'Mostrar herramientas' }).click();
  assert.equal(await diagrams.locator('optgroup').count(), 7);
  pass(
    'Note workbench occupies the whole viewport; collapsing tools expands the canvas and retains content, save and view controls',
  );

  // Exercise the actual insertion control, renderer and SVG sanitizer for every catalog entry.
  await source.fill('');
  for (const diagram of noteDiagrams) {
    await source.press('Control+End');
    await diagrams.selectOption(diagram.id);
  }
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    await page.waitForFunction(
      (count) => {
        const figures = [...document.querySelectorAll('[data-diagram-state]')];
        return (
          figures.length === count && figures.every((el) => el.dataset.diagramState !== 'pending')
        );
      },
      noteDiagrams.length,
      { timeout: 90000 },
    );
    const results = await page.locator('.mermaid-diagram').evaluateAll((figures) =>
      figures.map((figure) => {
        const svg = figure.querySelector('svg');
        return {
          error: figure.querySelector('.mermaid-error')?.textContent,
          width: svg?.getBBox().width,
          labels: [...(svg?.querySelectorAll('text') || [])].filter(
            (text) => text.textContent.trim() && text.getBBox().width > 0,
          ).length,
        };
      }),
    );
    const failures = results.flatMap((result, index) =>
      result.error || !result.width || !result.labels
        ? [{ id: noteDiagrams[index].id, ...result }]
        : [],
    );
    assert.deepEqual(failures, [], `Every template needs visible geometry and text in ${theme}`);
    assert.equal(
      await page
        .locator('.mermaid-svg foreignObject,.mermaid-svg script,.mermaid-svg image')
        .count(),
      0,
    );
  }
  await page.locator('.markdown-preview').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.screenshot({ path: path.join(artifacts, 'notes-mermaid-catalog.png') });
  await source.fill(original);
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await page.locator('.note-editor-context').getByText('Guardado', { exact: true }).waitFor();
  pass(
    `${noteDiagrams.length} Mermaid templates insert and render with visible labels and geometry in light and dark themes`,
  );

  for (const [width, height, theme] of [
    [390, 844, 'light'],
    [320, 600, 'dark'],
    [844, 390, 'dark'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await source.waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Editar', exact: true }).getAttribute('aria-pressed'),
      'true',
    );
    assert(!(await page.locator('.markdown-preview').isVisible()));
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
    await page.screenshot({ path: path.join(artifacts, `notes-page-${width}-${theme}.png`) });
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll('[data-diagram-state="ready"]').length === 7,
    );
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
    await page.screenshot({ path: path.join(artifacts, `notes-preview-${width}-${theme}.png`) });
  }
  const touch = await context.browser().newContext({
    storageState: await context.storageState(),
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const phone = await touch.newPage();
    await phone.goto(url);
    await phone.getByLabel('Contenido Markdown').waitFor();
    for (const [width, height] of [
      [390, 844],
      [320, 600],
      [844, 390],
      [390, 360],
    ]) {
      await phone.setViewportSize({ width, height });
      const controls = await phone.locator('.note-editor-header button').evaluateAll((buttons) =>
        buttons.map((button) => {
          const { x, y, width, height } = button.getBoundingClientRect();
          return { x, y, width, height };
        }),
      );
      for (const rect of controls) {
        assert(rect.height >= 44 && rect.width >= 44, 'Touch targets stay at least 44px');
        assert(rect.x >= 0 && rect.x + rect.width <= width + 1);
      }
      for (let i = 0; i < controls.length; i++)
        for (let j = i + 1; j < controls.length; j++) {
          const a = controls[i],
            b = controls[j];
          assert(
            a.x + a.width <= b.x + 1 ||
              b.x + b.width <= a.x + 1 ||
              a.y + a.height <= b.y + 1 ||
              b.y + b.height <= a.y + 1,
            'Header buttons do not overlap',
          );
        }
      assert(
        await phone.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth + 1 &&
            document.documentElement.scrollHeight <= innerHeight + 1,
        ),
      );
      await phone.screenshot({ path: path.join(artifacts, `notes-touch-${width}-${height}.png`) });
    }
    await phone.locator('.note-details summary').click();
    const panel = await phone.locator('.note-properties-panel').boundingBox();
    assert(panel.y + panel.height < 360);
    await phone.getByLabel('Tipografía', { exact: true }).focus();
    await phone.keyboard.press('Escape');
    assert(!(await phone.getByLabel('Tipografía', { exact: true }).isVisible()));
    await phone.getByRole('button', { name: 'Ocultar herramientas' }).click();
    assert(!(await phone.locator('.note-tools').isVisible()));
    await phone.getByLabel('Título de nota').fill('Arquitectura y métricas revisadas');
    await phone.getByLabel('Título de nota').press('Control+s');
    await phone.locator('.note-editor-context').getByText('Guardado', { exact: true }).waitFor();
    assert.equal(
      (await json(admin, 'GET', `/notes/${id}`)).title,
      'Arquitectura y métricas revisadas',
    );
  } finally {
    await touch.close();
  }
  pass(
    'Touch controls fit without overlap at 320px and keyboard-height viewports; properties close with Escape and Ctrl+S saves from the title',
  );
  await page.getByRole('button', { name: 'Volver a notas', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).waitFor();
  await page.setViewportSize({ width: 1366, height: 900 });
  pass(
    'Phone and landscape notes default to Markdown editing; preview, toolbars and full-page navigation fit 320, 390 and 844px in both themes',
  );
}
