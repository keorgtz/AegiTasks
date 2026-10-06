export async function openTaskProperties(page) {
  const editor = page.getByRole('dialog', { name: /^(Detalle del pendiente|¿Qué encontraste\?)$/ });
  await editor.getByRole('button', { name: 'Más propiedades del pendiente', exact: true }).click();
  await page.getByRole('dialog', { name: 'Propiedades del pendiente', exact: true }).waitFor();
}
export async function closeTaskProperties(page) {
  await page
    .getByRole('dialog', { name: 'Propiedades del pendiente', exact: true })
    .getByRole('button', { name: 'Listo', exact: true })
    .click();
}
