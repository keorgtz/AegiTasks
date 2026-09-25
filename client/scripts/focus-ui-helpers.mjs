export async function closeFocusDialog(page) {
  const dialog = page.locator('dialog[open]');
  if (await dialog.count()) {
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  }
}

export async function openFocusPanel(page, name) {
  await closeFocusDialog(page);
  await page.getByRole('button', { name, exact: true }).click();
  await page.locator('dialog[open]').waitFor();
}

export async function openFocusTasks(page) {
  await closeFocusDialog(page);
  await page.locator('.focus-choose-tasks').click();
  await page.getByRole('dialog', { name: 'Pendientes de Focus', exact: true }).waitFor();
}

export async function openFocusPicker(page) {
  await openFocusTasks(page);
  await page.getByRole('button', { name: 'Elegir pendientes', exact: true }).click();
  await page.getByRole('dialog', { name: 'Elegir pendientes para Focus' }).waitFor();
}
