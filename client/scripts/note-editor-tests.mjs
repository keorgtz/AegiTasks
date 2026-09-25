import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
  const otherSpace = (await json(admin, 'GET', '/spaces')).spaces.find(
    (space) => space.id !== stored.spaceId,
  );
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByLabel('Espacio activo').first().selectOption(otherSpace.id);
  assert.equal(await source.inputValue(), original);
  assert.equal(page.url(), url);
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await page.locator('.note-editor-context').getByText('Guardado', { exact: true }).waitFor();
  pass(
    'Malformed Mermaid and embedded configuration show recoverable errors; cancelled navigation and space changes preserve the draft',
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
    await page.screenshot({ path: path.join(artifacts, `notes-page-${width}-${theme}.png`) });
    await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll('[data-diagram-state="ready"]').length === 7,
    );
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(artifacts, `notes-preview-${width}-${theme}.png`) });
  }
  await page.getByRole('button', { name: 'Volver a notas', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).waitFor();
  await page.setViewportSize({ width: 1366, height: 900 });
  pass(
    'Phone and landscape notes default to Markdown editing; preview, toolbars and full-page navigation fit 320, 390 and 844px in both themes',
  );
}
