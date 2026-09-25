import assert from 'node:assert/strict';
import path from 'node:path';
import { openFocusPanel, openFocusTasks, closeFocusDialog } from './focus-ui-helpers.mjs';

export async function testFocusLayout({ page, admin, json, pass, artifacts }) {
  await page.goto('http://localhost:4174/#focus');
  await openFocusPanel(page, 'Objetivos e historial');
  await page
    .getByLabel('Objetivos de la sesión')
    .fill(
      Array.from(
        { length: 15 },
        (_, i) => `Objetivo ${i + 1}: revisar los pendientes y documentar los cambios`,
      ).join('\n'),
    );
  await openFocusPanel(page, 'Ajustes de Focus');
  await page.getByLabel('Ambiente visual').selectOption('geometry');
  await closeFocusDialog(page);
  await page.getByRole('button', { name: 'Comenzar enfoque', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).waitFor();
  const original = (await json(admin, 'GET', '/focus')).session;
  for (const [width, height] of [
    [1440, 900],
    [1366, 600],
    [1024, 600],
    [768, 1024],
    [390, 844],
    [320, 600],
    [320, 480],
    [844, 390],
    [667, 375],
    [568, 320],
  ]) {
    await page.setViewportSize({ width, height });
    for (const expanded of [false, true]) {
      if (expanded)
        await page.getByRole('button', { name: 'Ampliar en esta pestaña', exact: true }).click();
      const metrics = await page.locator('.focus-stage').evaluate((stage) => {
        const bounds = stage.getBoundingClientRect();
        const rect = (el) => {
          const b = el.getBoundingClientRect();
          return {
            left: b.left,
            right: b.right,
            top: b.top,
            bottom: b.bottom,
            width: b.width,
            height: b.height,
          };
        };
        const controls = [...stage.querySelectorAll('button')]
          .filter((el) => el.getClientRects().length)
          .map(rect);
        return {
          stage: rect(stage),
          dial: rect(stage.querySelector('.focus-dial')),
          center: rect(stage.querySelector('.focus-center')),
          centerContainer: getComputedStyle(stage.querySelector('.focus-center')).containerType,
          controls,
          stageFits:
            stage.scrollHeight <= stage.clientHeight + 1 &&
            stage.scrollWidth <= stage.clientWidth + 1,
          pageFits:
            document.documentElement.scrollHeight <= innerHeight + 1 &&
            document.documentElement.scrollWidth <= innerWidth + 1,
          contained: controls.every(
            (b) =>
              b.top >= bounds.top &&
              b.bottom <= bounds.bottom + 1 &&
              b.left >= bounds.left &&
              b.right <= bounds.right + 1,
          ),
        };
      });
      assert(
        metrics.pageFits && metrics.stageFits && metrics.contained,
        `${width}x${height} expanded=${expanded}: ${JSON.stringify(metrics)}`,
      );
      assert(
        metrics.dial.height >= 70 && Math.abs(metrics.dial.width - metrics.dial.height) <= 1,
        `Clock must remain circular and readable: ${JSON.stringify(metrics)}`,
      );
      for (let i = 0; i < metrics.controls.length; i++)
        for (let j = i + 1; j < metrics.controls.length; j++) {
          const a = metrics.controls[i],
            b = metrics.controls[j];
          assert(
            a.right <= b.left + 1 ||
              b.right <= a.left + 1 ||
              a.bottom <= b.top + 1 ||
              b.bottom <= a.top + 1,
            'Focus controls must not overlap',
          );
        }
      await page.screenshot({
        path: path.join(
          artifacts,
          `focus-fit-${width}-${height}-${expanded ? 'expanded' : 'normal'}.png`,
        ),
      });
      await openFocusTasks(page);
      await page.getByText('Elige los pendientes que quieres avanzar en esta sesión.').waitFor();
      await page.keyboard.press('Escape');
      await openFocusPanel(page, 'Configurar audio del espectro');
      await page
        .getByRole('button', { name: 'Compartir audio', exact: true })
        .scrollIntoViewIfNeeded();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.focus-stage.is-immersive').count(), expanded ? 1 : 0);
      if (expanded) await page.keyboard.press('Escape');
    }
  }
  const after = (await json(admin, 'GET', '/focus')).session;
  assert.equal(after.endsAt, original.endsAt);
  assert.equal(after.state, 'running');
  await openFocusPanel(page, 'Objetivos e historial');
  await page.locator('.focus-goals').getByLabel('Objetivo 1:', { exact: false }).click();
  await page.locator('.focus-goals input:checked').waitFor();
  await closeFocusDialog(page);
  await page.reload();
  await openFocusPanel(page, 'Objetivos e historial');
  assert(
    await page.locator('.focus-goals').getByLabel('Objetivo 1:', { exact: false }).isChecked(),
  );
  await closeFocusDialog(page);
  const current = (await json(admin, 'GET', '/focus')).session;
  await json(admin, 'POST', `/focus/${current.id}/action`, {
    action: 'finish',
    version: current.version,
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  pass(
    'Focus fits ten portrait/landscape viewports without page or timer overflow; all controls stay visible, dialogs preserve the timer and goals persist',
  );
}
