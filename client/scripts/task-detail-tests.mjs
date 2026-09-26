import assert from 'node:assert/strict';
import path from 'node:path';

export async function testTaskDetailTabs({ page, png, artifacts, pass }) {
  const dialog = page.getByRole('dialog', { name: 'Detalle del pendiente' });
  const tab = (name) => dialog.getByRole('tab', { name, exact: true });
  const general = tab('Detalle general');
  const evidence = tab('Evidencias');
  const activity = tab('Conversación y actividad');
  await general.click();
  assert.equal(await dialog.getByRole('tabpanel').count(), 1);
  const description = dialog.getByLabel('Descripción (opcional)');
  const draft = `${await description.inputValue()}\nEdición conservada al cambiar de pestaña.`;
  await description.fill(draft);
  await activity.click();
  const comment = dialog.getByLabel('Agregar comentario');
  await comment.fill('Comentario conservado entre pestañas.');
  await evidence.click();
  assert(!(await description.isVisible()));
  assert(!(await comment.isVisible()));
  await evidence.press('ArrowRight');
  assert.equal(await activity.getAttribute('aria-selected'), 'true');
  assert.equal(await comment.inputValue(), 'Comentario conservado entre pestañas.');
  await activity.press('Home');
  assert.equal(await general.getAttribute('aria-selected'), 'true');
  assert.equal(await description.inputValue(), draft);
  await general.press('ArrowLeft');
  assert.equal(await activity.getAttribute('aria-selected'), 'true');
  await activity.press('Home');
  await general.press('End');
  assert.equal(await activity.getAttribute('aria-selected'), 'true');
  page.once('dialog', (confirmation) => confirmation.dismiss());
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  assert(await dialog.isVisible());
  await general.click();
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await dialog.getByText('Todos los cambios están guardados.', { exact: true }).waitFor();
  pass(
    'Task detail tabs support arrow/Home/End navigation, expose one panel and retain edit/comment drafts and the close guard',
  );

  await evidence.click();
  await dialog.getByText('Todavía no hay evidencias.', { exact: false }).waitFor();
  await dialog.getByLabel('Adjuntar evidencia').setInputFiles({
    name: 'evidencia-tabs.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await dialog.getByRole('link', { name: /evidencia-tabs.png/ }).waitFor();
  await activity.click();
  assert.equal(await comment.inputValue(), 'Comentario conservado entre pestañas.');
  await dialog.getByRole('button', { name: 'Comentar', exact: true }).click();
  await dialog
    .locator('.activity-list')
    .getByText('Comentario conservado entre pestañas.', { exact: true })
    .waitFor();
  await page.waitForFunction(() => document.querySelector('.comment-form textarea')?.value === '');
  assert.equal(await comment.inputValue(), '');
  await general.click();
  assert.equal(await description.inputValue(), draft);
  pass('Evidence uploads and comments work in their own tabs while general details remain intact');

  for (const [width, height, theme] of [
    [1440, 1080, 'light'],
    [390, 844, 'dark'],
    [320, 600, 'light'],
    [844, 390, 'dark'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    for (const name of ['Detalle general', 'Evidencias', 'Conversación y actividad']) {
      await tab(name).click();
      assert.equal(await dialog.getByRole('tabpanel').count(), 1);
      const rect = await dialog.boundingBox();
      assert(
        rect.x >= 0 &&
          rect.y >= 0 &&
          rect.x + rect.width <= width + 1 &&
          rect.y + rect.height <= height + 1,
      );
      assert(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      const body = dialog.locator('.task-detail-body');
      await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
      for (const control of [general, evidence, activity]) {
        const bounds = await control.boundingBox();
        assert(
          bounds.height >= 44 &&
            bounds.y >= rect.y &&
            bounds.y + bounds.height <= rect.y + rect.height,
        );
      }
      // The tab strip remains outside the scrolling content and switching resets the panel scroll.
      await tab(name).click();
      assert.equal(await body.evaluate((el) => el.scrollTop), 0);
      await page.screenshot({
        path: path.join(artifacts, `task-tabs-${width}-${name.split(' ')[0]}-${theme}.png`),
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await general.click();
  pass(
    'All task tabs fit desktop, phone and landscape in both themes; 44px navigation stays visible while panels scroll',
  );
}
